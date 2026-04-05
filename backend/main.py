# main.py

import os
import io
import base64
import logging
import random
from typing import List, Tuple
from datetime import datetime, timedelta

import numpy as np
import matplotlib.pyplot as plt
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


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
from alg_nsga2 import preparar_datos_para_algoritmo, alg_NSGA2, crear_matriz_de_distancias_y_tiempos

# Configurar logging estructurado para Google Cloud
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# --- Modelos de Datos ---

class Node(BaseModel):
    id: str
    lat: float
    lng: float
    demanda: int = 0

class OptimizeRequest(BaseModel):
    nodes: List[Node]
    vehicleCapacity: int
    timeWindow: Tuple[str, str]
    numVehicles: int
    serviceTime: int = Field(default=5, description="Tiempo de servicio por parada en minutos.")
    vehicleMPG: float = Field(..., description="Millas por galón del vehículo.")

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

# --- Endpoints ---

@app.get("/")
def health_check():
    """Health check endpoint para Google Cloud Run."""
    return {
        "status": "healthy",
        "service": "GenRutas Optimizer Engine",
        "version": "1.0.0",
        "environment": "Google Cloud Run"
    }


@app.get("/health")
def detailed_health():
    """Endpoint de salud con detalles técnicos."""
    return {
        "status": "online",
        "service": "GenRutas Optimizer Engine",
        "version": "1.0.0",
        "algorithm": "NSGA-II Multi-Objective Optimization",
        "capabilities": [
            "Vehicle Routing Optimization",
            "Mapbox Distance Matrix Integration",
            "Environmental Impact Calculation",
            "Pareto Front Analysis"
        ]
    }

@app.post("/optimize")
async def optimize_route(request_data: OptimizeRequest):
    logger.info(
        "Optimization request received",
        extra={
            "num_nodes": len(request_data.nodes),
            "num_vehicles": request_data.numVehicles,
            "vehicle_capacity": request_data.vehicleCapacity
        }
    )
    try:
        # 1. Extracción de datos validados
        nodos = request_data.nodes
        capacidad_vehiculo = request_data.vehicleCapacity
        num_vehiculos = request_data.numVehicles
        time_window = request_data.timeWindow
        tiempo_servicio_min = request_data.serviceTime
        vehicle_mpg = request_data.vehicleMPG

        # 2. Preparación de tiempos
        # El algoritmo requiere formato HH:MM:SS
        time_window_formateado = (time_window[0] + ':00', time_window[1] + ':00')
        hora_inicio_str = time_window[0]
        hora_inicio_dt = datetime.strptime(hora_inicio_str, '%H:%M')

        # 3. Diccionarios y conversiones para el algoritmo
        # Convertimos a dict solo para la función legacy preparar_datos
        nodos_dict = [n.dict() for n in nodos]
        
        # Mapeos rápidos usando objetos Pydantic
        id_a_demanda = {n.id: n.demanda for n in nodos}
        id_a_indice = {n.id: i for i, n in enumerate(nodos)}
        coord_a_id = {(n.lat, n.lng): n.id for n in nodos}

        numN, numC, capacidad, coordenadas, horario = preparar_datos_para_algoritmo(
            nodos_dict, capacidad_vehiculo, time_window_formateado, num_vehiculos
        )

        # 4. Ejecución del Algoritmo
        logger.info("Requesting Mapbox distance/time matrices")
        matriz_distancias, matriz_tiempos = crear_matriz_de_distancias_y_tiempos(coordenadas)
        
        if not matriz_distancias or not matriz_tiempos:
            raise HTTPException(status_code=500, detail="Error al obtener matrices de Mapbox.")
        
        logger.info("Executing NSGA-II optimization algorithm")
        poblacion_final, historial_fitness = alg_NSGA2(
            numN, numC, coordenadas, horario, capacidad, matriz_distancias
        )
        logger.info(
            "Optimization completed successfully",
            extra={
                "solutions_found": len(poblacion_final),
                "generations": len(historial_fitness)
            }
        )

        # 5. Generación de Gráficas (Opcional)
        # urls_imagenes = {}
        #connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        #if connection_string:
         #   urls_imagenes = generar_y_subir_graficas(poblacion_final, historial_fitness, connection_string)
        # Gráfica de progreso de optimización
        fig1, ax1 = plt.subplots()
        mejor_historial = [h['mejor'] for h in historial_fitness]
        promedio_historial = [h['promedio'] for h in historial_fitness]
        ax1.plot(mejor_historial, label='Mejor Solución', color='blue')
        ax1.plot(promedio_historial, label='Promedio', color='green', linestyle='--')
        ax1.set_title('Progreso de la Optimización')
        ax1.legend()
        ax1.grid(True)
        progreso_base64 = generar_grafica_base64(fig1)

        # Gráfica de soluciones finales (Frente de Pareto)
        fig2, ax2 = plt.subplots()
        otras_soluciones = [ind for ind in poblacion_final]
        cargas = [ind.evaluacion_carga for ind in otras_soluciones]
        distancias = [ind.evaluacion_trayecto for ind in otras_soluciones]
        ax2.scatter(cargas, distancias, alpha=0.6, color='blue', label='Soluciones')
        ax2.set_title('Frente de Pareto')
        ax2.set_xlabel('Carga Total')
        ax2.set_ylabel('Distancia Total')
        ax2.legend()
        ax2.grid(True)
        pareto_base64 = generar_grafica_base64(fig2)

        graficas = {
            "progreso_optimizacion": progreso_base64,
            "soluciones_finales": pareto_base64
        }
        # 6. Procesamiento de Resultados y KPIs
        pareto_front_json = []
        METERS_TO_MILES = 0.000621371
        DIESEL_KG_CO2E_PER_GALLON = 10.22

        for i, individuo in enumerate(poblacion_final):
            # KPI: Impacto Ambiental
            distancia_total_millas = individuo.evaluacion_trayecto * METERS_TO_MILES
            galones_consumidos = distancia_total_millas / vehicle_mpg if vehicle_mpg > 0 else 0
            kg_co2e_total = galones_consumidos * DIESEL_KG_CO2E_PER_GALLON
            
            impacto_ambiental = {
                "total_kg_co2e": round(kg_co2e_total, 2)
            }

            rutas_formateadas = []
            if hasattr(individuo, 'solucion') and individuo.solucion:
                for camion_idx, camion_data in enumerate(individuo.solucion):
                    trayecto_coords = camion_data[0]
                    # Buscamos ID usando tupla de coordenadas
                    nodos_secuencia = [coord_a_id.get(tuple(punto[0]), "desconocido") for punto in trayecto_coords]
                    
                    # Generación de Itinerario (Steps)
                    itinerario_steps = []
                    tiempo_acumulado_seg = 0
                    carga_acumulada = 0
                    
                    if nodos_secuencia:
                        # Paso 0: Depósito inicial
                        depot_id = nodos_secuencia[0]
                        itinerario_steps.append({
                            "nodeId": depot_id,
                            "arrivalTime": hora_inicio_dt.strftime('%H:%M'),
                            "departureTime": hora_inicio_dt.strftime('%H:%M'),
                            "cumulativeLoad": 0
                        })
                        
                        # Pasos intermedios
                        for j in range(len(nodos_secuencia) - 1):
                            id_origen = nodos_secuencia[j]
                            id_destino = nodos_secuencia[j+1]
                            idx_origen = id_a_indice.get(id_origen)
                            idx_destino = id_a_indice.get(id_destino)
                            
                            # Sumar tiempo de viaje
                            if idx_origen is not None and idx_destino is not None:
                                tiempo_viaje = matriz_tiempos[idx_origen][idx_destino]
                            else:
                                tiempo_viaje = 0
                            
                            tiempo_acumulado_seg += tiempo_viaje
                            hora_llegada = hora_inicio_dt + timedelta(seconds=tiempo_acumulado_seg)
                            
                            # Sumar tiempo de servicio (si no es retorno a depósito)
                            if j < len(nodos_secuencia) - 2:
                                tiempo_acumulado_seg += (tiempo_servicio_min * 60)
                            
                            hora_salida = hora_inicio_dt + timedelta(seconds=tiempo_acumulado_seg)
                            carga_acumulada += id_a_demanda.get(id_destino, 0)
                            
                            itinerario_steps.append({
                                "nodeId": id_destino,
                                "arrivalTime": hora_llegada.strftime('%H:%M'),
                                "departureTime": hora_salida.strftime('%H:%M'),
                                "cumulativeLoad": carga_acumulada
                            })

                    rutas_formateadas.append({
                        "camionId": camion_idx + 1,
                        "nodos": nodos_secuencia,
                        "path": [(p[0][0], p[0][1]) for p in trayecto_coords],
                        "steps": itinerario_steps
                    })

            pareto_front_json.append({
                "id": f"sol-{i+1}", 
                "label": chr(65 + i), 
                "distancia": individuo.evaluacion_trayecto,
                "carga_total": individuo.evaluacion_carga, 
                "tiempo": individuo.evaluacion_tiempo,
                "routes": rutas_formateadas,
                "environmentalImpact": impacto_ambiental
            })

        # Construcción de respuesta final usando atributos de Pydantic
        coordenadas_nodos_dict = {n.id: (n.lat, n.lng) for n in nodos}
        
        return {
            "ejemplarId": f"DOCKER-VRP-{random.randint(1000, 9999)}",
            "paretoFront": pareto_front_json,
            "coordenadas_nodos": coordenadas_nodos_dict,
            "graficas": graficas
        }

    except Exception as e:
        logger.error(
            f"Optimization failed: {str(e)}",
            exc_info=True,
            extra={"error_type": type(e).__name__}
        )
        raise HTTPException(
            status_code=500,
            detail=f"Optimization error: {str(e)}"
        )

