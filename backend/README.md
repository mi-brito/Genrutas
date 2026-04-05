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
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Documentacion interactiva:
- `http://localhost:8000/docs`

Health checks:
- `GET /`
- `GET /health`

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
