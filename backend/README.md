# GenRutas Optimizer Engine

Motor de optimización de ruteo logístico basado en el algoritmo evolutivo multi-objetivo NSGA-II.

## Características

- **Algoritmo NSGA-II**: Optimización multi-objetivo con Pareto fronts
- **FastAPI**: API REST de alto rendimiento con documentación automática
- **Mapbox Integration**: Matrices de distancia y tiempo de tráfico en tiempo real
- **Environmental KPIs**: Cálculo de huella de carbono (Kg CO2e) por solución
- **Docker**: Contenedorización para despliegue agnóstico
- **Google Cloud Run**: Arquitectura serverless escalable

## Tecnologías

| Componente | Stack |
|-----------|-------|
| Framework | FastAPI, Uvicorn |
| Algoritmo | NSGA-II (NumPy, Matplotlib) |
| API de Rutas | Mapbox Directions Matrix |
| Contenedor | Docker, Google Cloud Run |
| Idioma | Python 3.9+ |

## Instalación Local

### Requisitos
- Python 3.9+
- Docker (opcional)

### Setup

```bash
# Clonar repositorio
git clone <repo-url>
cd backend

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tu MAPBOX_API_KEY
```

### Ejecutar localmente

```bash
# Desarrollo con hot-reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Producción
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

La API estará disponible en `http://localhost:8000`

Documentación interactiva: `http://localhost:8000/docs`

## Despliegue en Google Cloud Run

### Pasos

1. **Autenticarse en Google Cloud**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Construir la imagen Docker**
   ```bash
   docker build -t gcr.io/YOUR_PROJECT/vrp-optimizer:latest backend/
   ```

3. **Pushear a Google Container Registry**
   ```bash
   docker push gcr.io/YOUR_PROJECT/vrp-optimizer:latest
   ```

4. **Desplegar en Cloud Run**
   ```bash
   gcloud run deploy vrp-optimizer \
     --image gcr.io/YOUR_PROJECT/vrp-optimizer:latest \
     --platform managed \
     --region us-central1 \
     --memory 2Gi \
     --timeout 3600 \
     --allow-unauthenticated \
     --set-env-vars MAPBOX_API_KEY=your_api_key
   ```

5. **Obtener la URL del servicio**
   ```bash
   gcloud run services describe vrp-optimizer --region us-central1
   ```

## API Endpoints

### POST `/optimize`

Optimiza rutas basado en nodos, capacidad de vehículos y ventana de tiempo.

**Request body:**
```json
{
  "nodes": [
    {
      "id": "1",
      "lat": 25.6866,
      "lng": -100.3161,
      "demanda": 0
    },
    {
      "id": "2",
      "lat": 25.7000,
      "lng": -100.3300,
      "demanda": 15
    }
  ],
  "vehicleCapacity": 100,
  "numVehicles": 2,
  "timeWindow": ["08:00", "18:00"],
  "serviceTime": 5,
  "vehicleMPG": 8.5
}
```

**Response:**
```json
{
  "ejemplarId": "DOCKER-VRP-5432",
  "paretoFront": [
    {
      "id": "sol-1",
      "label": "A",
      "distancia": 45230.5,
      "carga_total": 98,
      "tiempo": 320,
      "routes": [...],
      "environmentalImpact": {
        "total_kg_co2e": 12.45
      }
    }
  ],
  "coordenadas_nodos": {...},
  "graficas": {
    "progreso_optimizacion": "data:image/png;base64,...",
    "soluciones_finales": "data:image/png;base64,..."
  }
}
```

## Estructura del Proyecto

```
backend/
├── main.py                 # Aplicación FastAPI principal
├── alg_nsga2.py           # Algoritmo NSGA-II core
├── requirements.txt       # Dependencias Python
├── Dockerfile             # Configuración de contenedor
├── .gcloudignore          # Archivos a ignorar en GCP
└── README.md              # Este archivo
```

## Variables de Entorno

```env
MAPBOX_API_KEY=pk_your_mapbox_token_here
```

## Performance

- **Tiempo de optimización**: ~20-30 segundos para 50 nodos con 100 generaciones
- **Memoria**: 512MB mínimo, 2GB recomendado para carga alta
- **Timeout**: 3600s (1 hora) en Google Cloud Run

## Próximas Mejoras

- [ ] Optimización de tiempo usando matriz de duración de Mapbox
- [ ] Soporte para ventanas de tiempo por parada
- [ ] Caché de matrices de distancia/tiempo
- [ ] GraphQL API
- [ ] Métricas en Prometheus

## Autor

Proyecto de optimización de rutas logísticas para Liverpool.

## Licencia

Privado - Derechos Reservados
