# main.py

import os
import io
import base64
import logging
import random
from typing import List, Optional, Tuple, Union
from datetime import date, datetime, timedelta

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
from alg_nsga2 import preparar_datos_para_algoritmo, alg_NSGA2, obtener_matrices, simular_ruta
from parametros_cu import impacto_escenarios, tabla_parametros

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
    chargingPowerKw: float = Field(default=150.0, description="Potencia del cargador en kW.")
    solarFraction: float = Field(default=1.0, ge=0.0, le=1.0,
                                 description="Fracción de la energía cargada con paneles solares (0 a 1).")
    chargingPeriod: str = Field(default="noche", description="'noche' (tarifa base) o 'dia'.")
    speedKmh: float = Field(default=20.0, gt=0, description="Velocidad promedio para estimar tiempos (km/h).")
    batteryReserve: float = Field(default=0.10, ge=0.0, lt=1.0, description="Fracción mínima de batería.")

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


OBJETIVOS = ("distancia", "tiempo", "energia_kwh")


def frente_no_dominado(soluciones):
    """Filtra soluciones no dominadas en distancia, tiempo y energía, sin duplicados."""
    unicas = {}
    for s in soluciones:
        clave = tuple(round(s[k], 1) for k in OBJETIVOS)
        unicas.setdefault(clave, s)
    candidatas = list(unicas.values())
    frente = []
    for a in candidatas:
        dominada = any(
            all(b[k] <= a[k] for k in OBJETIVOS) and any(b[k] < a[k] for k in OBJETIVOS)
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

@app.get("/parametros")
def parametros():
    """Parámetros del cálculo de impacto, con su fuente y nivel de confianza."""
    return {"parametros": tabla_parametros()}


# --- Escenario real de Ciudad Universitaria ---

def _fecha(texto):
    try:
        return date.fromisoformat(texto)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Fecha inválida; usa AAAA-MM-DD.")


@app.get("/cu/escenario")
def cu_escenario():
    """Rutas actuales del Pumabús, paraderos con su peso de demanda y precisión del modelo."""
    import escenario_cu, demanda_cu
    try:
        rutas = escenario_cu.rutas_actuales()
        paraderos = escenario_cu.paraderos()
        modelo = demanda_cu.modelo()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {
        "rutas": rutas,
        "paraderos": paraderos,
        "bases": ["Metro Universidad", "Estadio Olímpico", "Metrobús CU"],
        "modelo": modelo.metricas,
        "datos_hasta": modelo.hasta.isoformat(),
        "horas_sol_pico": demanda_cu.horas_sol_pico(),
    }


@app.get("/cu/dia")
def cu_dia(fecha: str, kwp_solar: float = 0.0):
    """Operación de todo el día: actual vs. GenRutas, con energía y carga solar."""
    import operacion_cu
    return operacion_cu.plan_dia(_fecha(fecha), kwp_solar=kwp_solar)


@app.get("/cu/disenar")
def cu_disenar(fecha: str, hora: int, base: str = "Metro Universidad", oleada_min: int = 10,
               fraccion_solar: float = 1.0):
    """Rutas nuevas con el NSGA-II para una base y hora, comparadas con las rutas actuales."""
    import optimizacion_cu
    if not 6 <= hora <= 21:
        raise HTTPException(status_code=400, detail="El Pumabús opera de 6 a 22 h.")
    if oleada_min not in (5, 10, 15, 20, 30):
        raise HTTPException(status_code=400, detail="La oleada debe ser de 5, 10, 15, 20 o 30 minutos.")
    try:
        return optimizacion_cu.disenar(_fecha(fecha), hora, base, oleada_min, fraccion_solar)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/optimize")
def optimize_route(request_data: OptimizeRequest):
    return optimizar(request_data)


def optimizar(request_data: OptimizeRequest):
    """Corre el NSGA-II y arma la respuesta (frente de Pareto, itinerarios, impacto y gráficas)."""
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
        estaciones = [n for n in request_data.nodes if n.type == 'charging_station']
        todos_nodos = nodos + estaciones  # mismo orden que las matrices

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

        numN, numC, capacidad, coordenadas, horario = preparar_datos_para_algoritmo(
            nodos_dict, capacidad_vehiculo, time_window_formateado, num_vehiculos
        )

        # 4. Matrices de distancia y tiempo (contenedores y estaciones de carga)
        coordenadas_estaciones = [[(n.lat, n.lng), 0] for n in estaciones]
        matriz_distancias, matriz_tiempos, fuente_matriz = obtener_matrices(
            coordenadas + coordenadas_estaciones, velocidad_kmh=request_data.speedKmh)
        logger.info("Matrices de distancia: %s", fuente_matriz)

        fin_dt = datetime.strptime(time_window_formateado[1], '%H:%M:%S')
        params_ev = {
            "autonomia_kwh": request_data.vehicleAutonomy,
            "consumo_kwh_km": request_data.vehicleConsumption or 1.2,
            "potencia_carga_kw": request_data.chargingPowerKw,
            "reserva": request_data.batteryReserve,
            "velocidad_kmh": request_data.speedKmh,
            "servicio_s": tiempo_servicio_min * 60,
            "inicio_s": hora_inicio_dt.hour * 3600 + hora_inicio_dt.minute * 60,
            "fin_s": fin_dt.hour * 3600 + fin_dt.minute * 60,
        }

        logger.info("Executing NSGA-II optimization algorithm")
        poblacion_final, historial_fitness = alg_NSGA2(
            numN, numC, coordenadas, horario, capacidad, matriz_distancias,
            matriz_tiempos=matriz_tiempos, estaciones=coordenadas_estaciones, params_ev=params_ev,
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
        soluciones = []

        for individuo in poblacion_final:
            rutas_formateadas = []
            distancia_total = tiempo_max = energia_total = 0.0
            factible = True

            for camion_idx, camion_data in enumerate(individuo.solucion or []):
                trayecto_coords = camion_data[0]
                if len(trayecto_coords) <= 2:
                    continue  # vehículo sin paradas
                r = simular_ruta(trayecto_coords)
                pasos = []
                for paso in r["pasos"]:
                    nodo = todos_nodos[paso["idx"]]
                    pasos.append({
                        "nodeId": nodo.id,
                        "type": nodo.type,
                        "arrivalTime": (hora_inicio_dt + timedelta(seconds=paso["llegada_s"])).strftime('%H:%M'),
                        "departureTime": (hora_inicio_dt + timedelta(seconds=paso["salida_s"])).strftime('%H:%M'),
                        "cumulativeLoad": paso["carga"],
                        "energia_recargada_kWh": paso["kwh"],
                    })
                if (r["carga"] > capacidad_vehiculo or r["bateria_insuficiente"]
                        or params_ev["inicio_s"] + r["tiempo_s"] > params_ev["fin_s"]):
                    factible = False
                distancia_total += r["distancia_m"]
                energia_total += r["energia_kwh"]
                tiempo_max = max(tiempo_max, r["tiempo_s"])
                rutas_formateadas.append({
                    "camionId": camion_idx + 1,
                    "nodos": [p["nodeId"] for p in pasos],
                    "steps": pasos,
                    "distancia_m": round(r["distancia_m"], 1),
                    "tiempo_s": round(r["tiempo_s"], 1),
                    "energia_kwh": round(r["energia_kwh"], 2),
                    "recargas": len(r["recargas"]),
                    "carga": r["carga"],
                })

            soluciones.append({
                "distancia": round(distancia_total, 1),
                "tiempo": round(tiempo_max, 1),
                "energia_kwh": round(energia_total, 2),
                "carga_total": sum(r["carga"] for r in rutas_formateadas),
                "factible": factible,
                "routes": rutas_formateadas,
                "impacto": impacto_escenarios(distancia_total / 1000, energia_total,
                                              request_data.solarFraction, request_data.chargingPeriod),
            })

        factibles = [s for s in soluciones if s["factible"]]
        aviso = None
        if not factibles:
            aviso = ("Ninguna solución respeta capacidad, horario y batería a la vez; "
                     "se muestran las mejores encontradas. Agrega vehículos, batería o estaciones de carga.")
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
            "coordenadas_nodos": {str(n.id): (n.lat, n.lng) for n in todos_nodos},
            "parametros": tabla_parametros(),
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
