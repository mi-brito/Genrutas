# main.py

import os
import io
import base64
import logging
import random
from typing import List, Optional, Tuple, Union
from datetime import datetime, timedelta

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, AliasChoices


def cargar_dotenv_simple(ruta='.env'):
    if not os.path.exists(ruta):
        return
    with open(ruta, 'r', encoding='utf-8') as archivo:
        for linea in archivo:
            linea = linea.strip()
            if not linea or linea.startswith('#') or '=' not in linea:
                continue
            clave, valor = linea.split('=', 1)
            os.environ.setdefault(clave.strip(), valor.strip().strip('"').strip("'"))


cargar_dotenv_simple()
# Módulos locales
from alg_nsga2 import preparar_datos_para_algoritmo, alg_NSGA2, obtener_matrices

# Configurar logging estructurado para Google Cloud
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# --- Modelos de Datos ---

class Node(BaseModel):
    # El frontend manda ids numéricos; versiones anteriores mandaban texto.
    id: Union[int, str]
    lat: float
    lng: float
    # Acepta "demanda" (API original) o "demand" (frontend).
    demanda: int = Field(default=0, validation_alias=AliasChoices('demanda', 'demand'))
    type: str = 'container'  # 'depot' | 'container' | 'charging_station'


class OptimizeRequest(BaseModel):
    nodes: List[Node]
    vehicleCapacity: int
    timeWindow: Tuple[str, str]
    numVehicles: int = Field(validation_alias=AliasChoices('numVehicles', 'numberOfVehicles'))
    startTime: Optional[str] = None
    serviceTime: int = Field(default=5, description="Tiempo de servicio por parada en minutos.")
    # Diésel (compatibilidad con la versión anterior); opcional.
    vehicleMPG: Optional[float] = Field(default=None, description="Millas por galón (camión diésel).")
    # Camión eléctrico.
    vehicleAutonomy: Optional[float] = Field(default=None, description="Batería útil en kWh.")
    vehicleConsumption: Optional[float] = Field(default=None, description="Consumo en kWh/km.")

# --- Configuración de la App ---

app = FastAPI(
    title="API de Optimización de Rutas",
    description="Usa un algoritmo genético NSGA-II para optimizar rutas de recolección."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def generar_grafica_base64(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format='png')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    return f"data:image/png;base64,{img_base64}"


def normalizar_hora(hora: str) -> str:
    """Acepta 'HH:MM' o 'HH:MM:SS' y devuelve 'HH:MM:SS'."""
    return hora if hora.count(':') == 2 else hora + ':00'


def frente_no_dominado(soluciones):
    """Filtra soluciones factibles no dominadas en (distancia, tiempo), sin duplicados."""
    unicas = {}
    for s in soluciones:
        clave = (round(s["distancia"], 1), round(s["tiempo"], 1))
        unicas.setdefault(clave, s)
    candidatas = list(unicas.values())
    frente = []
    for a in candidatas:
        dominada = any(
            b["distancia"] <= a["distancia"] and b["tiempo"] <= a["tiempo"]
            and (b["distancia"] < a["distancia"] or b["tiempo"] < a["tiempo"])
            for b in candidatas if b is not a
        )
        if not dominada:
            frente.append(a)
    return sorted(frente, key=lambda s: s["distancia"])

# --- Endpoints ---

@app.get("/")
def health_check():
    """Health check endpoint para Google Cloud Run."""
    return {
        "status": "healthy",
        "service": "GenRutas Optimizer Engine",
        "version": "1.1.0",
    }


@app.get("/health")
def detailed_health():
    """Endpoint de salud con detalles técnicos."""
    return {
        "status": "online",
        "service": "GenRutas Optimizer Engine",
        "version": "1.1.0",
        "algorithm": "NSGA-II Multi-Objective Optimization",
        "capabilities": [
            "Vehicle Routing Optimization",
            "Mapbox Distance Matrix (<= 25 puntos) o haversine",
            "Environmental Impact Calculation",
            "Pareto Front Analysis"
        ]
    }

@app.post("/optimize")
async def optimize_route(request_data: OptimizeRequest):
    logger.info(
        "Optimization request received: %s nodos, %s vehículos, capacidad %s",
        len(request_data.nodes), request_data.numVehicles, request_data.vehicleCapacity,
    )
    try:
        # 1. Nodos que entran al algoritmo: el depósito primero y luego los contenedores.
        #    Las estaciones de carga todavía no las usa el NSGA-II (siguiente etapa).
        depositos = [n for n in request_data.nodes if n.type == 'depot']
        contenedores = [n for n in request_data.nodes if n.type == 'container']
        if not depositos:
            # Compatibilidad: si no viene tipo, el primer nodo es el depósito.
            depositos = [request_data.nodes[0]]
            contenedores = [n for n in request_data.nodes[1:] if n.type != 'charging_station']
        if not contenedores:
            raise HTTPException(status_code=400, detail="Se necesita al menos un contenedor.")
        nodos = [depositos[0]] + contenedores

        capacidad_vehiculo = request_data.vehicleCapacity
        num_vehiculos = min(request_data.numVehicles, len(contenedores))
        tiempo_servicio_min = request_data.serviceTime

        # 2. Preparación de tiempos (el algoritmo requiere HH:MM:SS)
        time_window_formateado = (normalizar_hora(request_data.timeWindow[0]),
                                  normalizar_hora(request_data.timeWindow[1]))
        hora_inicio_str = (request_data.startTime or request_data.timeWindow[0])[:5]
        hora_inicio_dt = datetime.strptime(hora_inicio_str, '%H:%M')

        # 3. Conversiones para el algoritmo
        nodos_dict = [{"id": n.id, "lat": n.lat, "lng": n.lng, "demanda": n.demanda} for n in nodos]
        id_a_demanda = {n.id: n.demanda for n in nodos}
        id_a_indice = {n.id: i for i, n in enumerate(nodos)}
        coord_a_id = {(n.lat, n.lng): n.id for n in nodos}

        numN, numC, capacidad, coordenadas, horario = preparar_datos_para_algoritmo(
            nodos_dict, capacidad_vehiculo, time_window_formateado, num_vehiculos
        )

        # 4. Matrices de distancia y tiempo
        matriz_distancias, matriz_tiempos, fuente_matriz = obtener_matrices(coordenadas)
        logger.info("Matrices de distancia: %s", fuente_matriz)

        logger.info("Executing NSGA-II optimization algorithm")
        poblacion_final, historial_fitness = alg_NSGA2(
            numN, numC, coordenadas, horario, capacidad, matriz_distancias
        )

        # 5. Gráficas
        fig1, ax1 = plt.subplots()
        ax1.plot([h['mejor'] for h in historial_fitness], label='Mejor solución', color='blue')
        ax1.plot([h['promedio'] for h in historial_fitness], label='Promedio', color='green', linestyle='--')
        ax1.set_title('Progreso de la optimización')
        ax1.legend()
        ax1.grid(True)
        progreso_base64 = generar_grafica_base64(fig1)

        # 6. Procesamiento de resultados
        METERS_TO_MILES = 0.000621371
        DIESEL_KG_CO2E_PER_GALLON = 10.22
        soluciones = []

        for individuo in poblacion_final:
            rutas_formateadas = []
            distancia_total = 0.0
            tiempo_max = 0.0
            factible = True

            for camion_idx, camion_data in enumerate(individuo.solucion or []):
                trayecto_coords = camion_data[0]
                nodos_secuencia = [coord_a_id.get(tuple(p[0]), "desconocido") for p in trayecto_coords]
                if len(nodos_secuencia) <= 2:
                    continue  # camión sin contenedores

                itinerario_steps = []
                tiempo_acumulado_seg = 0.0
                distancia_ruta = 0.0
                carga_acumulada = 0
                itinerario_steps.append({
                    "nodeId": nodos_secuencia[0],
                    "arrivalTime": hora_inicio_dt.strftime('%H:%M'),
                    "departureTime": hora_inicio_dt.strftime('%H:%M'),
                    "cumulativeLoad": 0,
                })
                for j in range(len(nodos_secuencia) - 1):
                    i_o = id_a_indice.get(nodos_secuencia[j])
                    i_d = id_a_indice.get(nodos_secuencia[j + 1])
                    if i_o is not None and i_d is not None:
                        tiempo_acumulado_seg += matriz_tiempos[i_o][i_d] or 0
                        distancia_ruta += matriz_distancias[i_o][i_d] or 0
                    hora_llegada = hora_inicio_dt + timedelta(seconds=tiempo_acumulado_seg)
                    if j < len(nodos_secuencia) - 2:
                        tiempo_acumulado_seg += tiempo_servicio_min * 60
                    hora_salida = hora_inicio_dt + timedelta(seconds=tiempo_acumulado_seg)
                    carga_acumulada += id_a_demanda.get(nodos_secuencia[j + 1], 0)
                    itinerario_steps.append({
                        "nodeId": nodos_secuencia[j + 1],
                        "arrivalTime": hora_llegada.strftime('%H:%M'),
                        "departureTime": hora_salida.strftime('%H:%M'),
                        "cumulativeLoad": carga_acumulada,
                    })

                if carga_acumulada > capacidad_vehiculo:
                    factible = False
                distancia_total += distancia_ruta
                tiempo_max = max(tiempo_max, tiempo_acumulado_seg)
                rutas_formateadas.append({
                    "camionId": camion_idx + 1,
                    "nodos": nodos_secuencia,
                    "path": [(p[0][0], p[0][1]) for p in trayecto_coords],
                    "steps": itinerario_steps,
                    "distancia_m": round(distancia_ruta, 1),
                    "tiempo_s": round(tiempo_acumulado_seg, 1),
                    "carga": carga_acumulada,
                })

            # Impacto diésel (compatibilidad); el frontend calcula el eléctrico.
            kg_co2e_diesel = None
            if request_data.vehicleMPG:
                galones = distancia_total * METERS_TO_MILES / request_data.vehicleMPG
                kg_co2e_diesel = round(galones * DIESEL_KG_CO2E_PER_GALLON, 2)

            soluciones.append({
                "distancia": round(distancia_total, 1),
                "tiempo": round(tiempo_max, 1),
                "carga_total": sum(r["carga"] for r in rutas_formateadas),
                "factible": factible,
                "routes": rutas_formateadas,
                "environmentalImpact": {"total_kg_co2e": kg_co2e_diesel},
            })

        factibles = [s for s in soluciones if s["factible"]]
        aviso = None
        if not factibles:
            aviso = ("Ninguna solución respeta la capacidad de los camiones; "
                     "se muestran las mejores encontradas. Agrega camiones o capacidad.")
            factibles = soluciones
        frente = frente_no_dominado(factibles)[:8]
        for i, s in enumerate(frente):
            s["id"] = f"sol-{i + 1}"
            s["label"] = chr(65 + i)

        # Gráfica del frente: distancia contra tiempo de la jornada
        fig2, ax2 = plt.subplots()
        ax2.scatter([s["distancia"] / 1000 for s in factibles], [s["tiempo"] / 60 for s in factibles],
                    alpha=0.3, color='gray', label='Población final')
        ax2.scatter([s["distancia"] / 1000 for s in frente], [s["tiempo"] / 60 for s in frente],
                    color='blue', label='Frente de Pareto')
        ax2.set_title('Frente de Pareto')
        ax2.set_xlabel('Distancia total (km)')
        ax2.set_ylabel('Duración de la ruta más larga (min)')
        ax2.legend()
        ax2.grid(True)
        pareto_base64 = generar_grafica_base64(fig2)

        return {
            "ejemplarId": f"GENRUTAS-{random.randint(1000, 9999)}",
            "fuenteMatriz": fuente_matriz,
            "aviso": aviso,
            "paretoFront": frente,
            "coordenadas_nodos": {str(n.id): (n.lat, n.lng) for n in nodos},
            "graficas": {
                "progreso_optimizacion": progreso_base64,
                "soluciones_finales": pareto_base64,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Optimization failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Optimization error: {str(e)}")
