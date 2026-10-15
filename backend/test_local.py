# test_local.py
# Prueba el endpoint /optimize sin levantar el servidor, con puntos reales en CU (CDMX).
# Sin MAPBOX_API_KEY usa la matriz haversine.

import json
import time

from fastapi.testclient import TestClient

from main import app

DATOS = {
    "nodes": [
        {"id": 1, "lat": 19.3326, "lng": -99.1870, "demand": 0, "type": "depot"},
        {"id": 2, "lat": 19.3240, "lng": -99.1790, "demand": 8, "type": "container"},
        {"id": 3, "lat": 19.3290, "lng": -99.1760, "demand": 6, "type": "container"},
        {"id": 4, "lat": 19.3180, "lng": -99.1850, "demand": 10, "type": "container"},
        {"id": 5, "lat": 19.3215, "lng": -99.1905, "demand": 7, "type": "container"},
        {"id": 6, "lat": 19.3350, "lng": -99.1795, "demand": 9, "type": "container"},
        {"id": 7, "lat": 19.3275, "lng": -99.1930, "demand": 5, "type": "container"},
        {"id": 8, "lat": 19.3160, "lng": -99.1780, "demand": 6, "type": "container"},
        {"id": 9, "lat": 19.3305, "lng": -99.1700, "demand": 4, "type": "container"},
        {"id": 10, "lat": 19.3260, "lng": -99.1820, "demand": 0, "type": "charging_station"},
    ],
    "vehicleCapacity": 30,
    "timeWindow": ["06:00", "10:00"],
    "numberOfVehicles": 3,
    "startTime": "06:30",
    "serviceTime": 5,
    "vehicleAutonomy": 80,
    "vehicleConsumption": 0.5,
}


def ejecutar_prueba_local():
    cliente = TestClient(app)
    inicio = time.perf_counter()
    respuesta = cliente.post("/optimize", json=DATOS)
    duracion = time.perf_counter() - inicio
    print(f"Estado HTTP: {respuesta.status_code} ({duracion:.1f} s)")
    cuerpo = respuesta.json()
    if respuesta.status_code != 200:
        print(json.dumps(cuerpo, indent=2, ensure_ascii=False))
        return
    print(f"Matriz: {cuerpo['fuenteMatriz']} | Aviso: {cuerpo['aviso']}")
    print(f"Soluciones en el frente: {len(cuerpo['paretoFront'])}")
    for s in cuerpo["paretoFront"]:
        rutas = "; ".join(f"camión {r['camionId']}: {r['nodos']} ({r['carga']} kg)" for r in s["routes"])
        print(f"  {s['label']}: {s['distancia'] / 1000:.2f} km, {s['tiempo'] / 60:.0f} min -> {rutas}")


if __name__ == "__main__":
    ejecutar_prueba_local()
