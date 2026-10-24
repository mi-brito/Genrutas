# GenRutas Backend

Servicio backend para optimizacion de rutas con NSGA-II.

Recibe nodos y restricciones de operacion, ejecuta el algoritmo, y devuelve:
- soluciones del frente de Pareto
- itinerarios por vehiculo
- estimacion de impacto ambiental (CO2e)
- graficas en base64 (progreso y soluciones finales)

## Stack

- Python
- FastAPI + Uvicorn
- NumPy + Matplotlib
- Docker
- Google Cloud Run

## Estructura

```text
backend/
|- main.py
|- alg_nsga2.py
|- requirements.txt
|- Dockerfile
`- test_local.py
```

Archivos de entorno/despliegue en raiz del repo:
- `../.env.example`
- `../.gcloudignore`

## Variables de entorno

```env
MAPBOX_API_KEY=tu_token
```

## Ejecutar local

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python datos/descargar_datos_cu.py   # una vez: datos de CU (ver abajo)
python -m uvicorn main:app --port 8000 --reload
```

Usa `python -m uvicorn` (no `uvicorn` a secas) para que corra con el Python del `.venv`.

Documentacion interactiva:
- `http://localhost:8000/docs`

Health checks:
- `GET /`
- `GET /health`

## Escenario real: Pumabús en Ciudad Universitaria

`datos/descargar_datos_cu.py` baja datos públicos a `datos/cu/`:

| Archivo | Contenido | Fuente |
|---|---|---|
| `osm_cu.json` | Rutas del Pumabús (paradas y trazo), paraderos y facultades | OpenStreetMap (© colaboradores, ODbL) |
| `metro_universidad_diario.csv` | Afluencia diaria de Metro Universidad y Copilco | STC Metro, Datos Abiertos CDMX |
| `clima_cu_horario.csv` | Lluvia, temperatura y radiación solar por hora | Open-Meteo (ERA5), CC BY 4.0 |

Módulos:

- `parametros_cu.py`: parámetros con fuente y nivel (oficial, académico o proxy) y el cálculo
  diésel / eléctrico con la red / eléctrico con carga solar.
- `demanda_cu.py`: pronóstico de pasajeros por día (gradient boosting con la afluencia real del
  Metro, calendario UNAM, festivos y clima), por hora (picos de 7–8 y 15–16 h) y por paradero
  (matrícula de las facultades cercanas). Se valida con el último año que el modelo no vio.
- `escenario_cu.py`: rutas actuales, paraderos y pesos de demanda desde OpenStreetMap.
- `operacion_cu.py`: día completo, operación actual contra recorridos repartidos según la demanda,
  con energía y generación solar real.
- `optimizacion_cu.py`: rutas nuevas con el NSGA-II para una base y hora, contra las rutas actuales.

Endpoints:

- `GET /cu/escenario`: rutas, paraderos y precisión del modelo.
- `GET /cu/dia?fecha=2026-10-20&kwp_solar=500`: plan del día.
- `GET /cu/disenar?fecha=2026-10-20&hora=15&base=Metro%20Universidad&oleada_min=10&fraccion_solar=1`:
  rutas nuevas y comparación (tarda 30–60 s).
- `GET /parametros`: tabla de parámetros con fuente.

Los consumos del autobús eléctrico y del diésel son proxies del Metrobús CDMX (ICCT 2022): no hay
datos publicados del Pumabús eléctrico.

## Docker

```bash
docker build -t genrutas-backend .
docker run -p 8000:8000 --env-file ../.env genrutas-backend
```

## Endpoint principal

- `POST /optimize`

Campos esperados en el request:
- `nodes`
- `vehicleCapacity`
- `timeWindow`
- `numVehicles`
- `serviceTime`
- `vehicleMPG`

Respuesta:
- `paretoFront`
- `coordenadas_nodos`
- `graficas`

## Deploy en Google Cloud Run

```bash
gcloud run deploy genrutas-backend \
  --source backend \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars MAPBOX_API_KEY=tu_token
```
