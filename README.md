# GenRutas - Motor de Optimizacion Logistica

GenRutas es un proyecto backend en Python para optimizar rutas de recoleccion con NSGA-II.

El sistema recibe nodos, capacidad y ventana de tiempo; genera soluciones de ruteo, calcula impacto ambiental estimado (CO2e) y devuelve graficas de resultado.

## Estructura del repositorio

```text
genrutas/
|- README.md
|- .env.example
|- .gcloudignore
|- docker-compose.yml
`- backend/
   |- README.md
   |- main.py
   |- alg_nsga2.py
   |- Dockerfile
   |- requirements.txt
   `- test_local.py
```

## Tecnologias principales

- Python
- FastAPI + Uvicorn
- NSGA-II
- NumPy + Matplotlib
- Docker
- Google Cloud Run

## Ejecucion local rapida

```bash
cp .env.example .env
docker-compose up --build
```

API y docs:
- `http://localhost:8000`
- `http://localhost:8000/docs`

