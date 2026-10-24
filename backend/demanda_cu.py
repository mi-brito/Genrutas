"""
Pronóstico de demanda del Pumabús por día, hora y paradero.

1. Nivel diario (IA predictiva): un modelo de gradient boosting (HistGradientBoosting de
   scikit-learn, mismo tipo de algoritmo que LightGBM) aprende la afluencia diaria REAL de las
   estaciones del Metro Universidad y Copilco, que dan servicio a CU, a partir del calendario
   UNAM, los días festivos y el clima. No hay datos públicos de pasajeros del Pumabús por día,
   así que esa afluencia se usa como indicador de actividad en CU.
2. Escala: el índice de actividad se calibra para que el año 2024 sume los ~27.3 millones de
   usuarios del Pumabús (Memoria UNAM 2024).
3. Hora: perfil con los picos de 7–8 h y 15–16 h medidos en CU (Cifuentes, II-UNAM 2016).
4. Paradero: se reparte según la matrícula de licenciatura de las facultades cercanas
   (Agenda Estadística UNAM 2025).

Cuando la DGSGM comparta conteos reales del Pumabús, basta con cambiar el objetivo del modelo.
"""

import csv
import math
import os
import threading
from datetime import date, datetime, timedelta
from functools import lru_cache

import numpy as np

CARPETA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos", "cu")
USUARIOS_PUMABUS_2024 = 27_300_000  # Memoria UNAM 2024, DGSGM ("aproximadamente")

# --------------------------------------------------------------------------
# Calendario UNAM (licenciatura, plan semestral)
# Fechas de la DGAE publicadas en prensa; las marcadas "aprox." están por confirmar.
# --------------------------------------------------------------------------
SEMESTRES = [
    # (nombre, inicio de clases, fin de clases, fin de exámenes)
    ("2023-1", date(2022, 8, 8), date(2022, 11, 25), date(2022, 12, 9)),    # aprox.
    ("2023-2", date(2023, 1, 30), date(2023, 5, 26), date(2023, 6, 9)),     # inicio: El Financiero 29-ene-2023
    ("2024-1", date(2023, 8, 7), date(2023, 11, 24), date(2023, 12, 8)),    # Chilango
    ("2024-2", date(2024, 1, 29), date(2024, 5, 24), date(2024, 6, 7)),     # Chilango
    ("2025-1", date(2024, 8, 5), date(2024, 11, 22), date(2024, 12, 6)),    # Chilango
    ("2025-2", date(2025, 1, 27), date(2025, 5, 23), date(2025, 6, 6)),     # Chilango
    ("2026-1", date(2025, 8, 11), date(2025, 11, 28), date(2025, 12, 12)),  # inicio: Chilango; fin aprox.
    ("2026-2", date(2026, 1, 26), date(2026, 5, 29), date(2026, 6, 12)),    # aprox.; exámenes hasta 12-jun (Chilango)
    ("2027-1", date(2026, 8, 10), date(2026, 11, 27), date(2026, 12, 11)),  # DGAE, calendario semestral 2027
    ("2027-2", date(2027, 2, 2), date(2027, 5, 28), date(2027, 6, 11)),     # DGAE; fin de exámenes aprox.
]

SEMANA_SANTA = {  # lunes a viernes sin clases
    2023: date(2023, 4, 3), 2024: date(2024, 3, 25), 2025: date(2025, 4, 14),
    2026: date(2026, 3, 30), 2027: date(2027, 3, 22),
}


def _lunes_n(anio, mes, n):
    d = date(anio, mes, 1)
    d += timedelta(days=(0 - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


@lru_cache(maxsize=None)
def festivos(anio):
    """Días sin clases en la UNAM además de las vacaciones."""
    dias = {
        date(anio, 1, 1), _lunes_n(anio, 2, 1), _lunes_n(anio, 3, 3), date(anio, 5, 1),
        date(anio, 5, 10), date(anio, 5, 15), date(anio, 9, 16), date(anio, 11, 1),
        date(anio, 11, 2), _lunes_n(anio, 11, 3), date(anio, 12, 12), date(anio, 12, 25),
    }
    if anio in SEMANA_SANTA:
        inicio = SEMANA_SANTA[anio]
        dias |= {inicio + timedelta(days=k) for k in range(5)}
    return dias


def periodo_escolar(d):
    """'clases', 'examenes' o 'vacaciones', y la semana del semestre (0 si no hay clases)."""
    for _, inicio, fin_clases, fin_examenes in SEMESTRES:
        if inicio <= d <= fin_clases:
            return "clases", (d - inicio).days // 7 + 1
        if fin_clases < d <= fin_examenes:
            return "examenes", 0
    return "vacaciones", 0


# --------------------------------------------------------------------------
# Datos
# --------------------------------------------------------------------------
@lru_cache(maxsize=1)
def cargar_metro():
    """Afluencia diaria sumada de Universidad y Copilco: {fecha: afluencia}."""
    ruta = os.path.join(CARPETA, "metro_universidad_diario.csv")
    if not os.path.exists(ruta):
        return {}
    totales = {}
    with open(ruta, encoding="utf-8") as archivo:
        for fila in csv.DictReader(archivo):
            try:
                d = date.fromisoformat(fila["fecha"][:10])
            except ValueError:
                continue
            totales[d] = totales.get(d, 0) + int(fila["afluencia"])
    return totales


@lru_cache(maxsize=1)
def cargar_clima():
    """Clima diario de CU: {fecha: (lluvia_mm_6a22, temp_media, radiacion_kwh_m2)}."""
    ruta = os.path.join(CARPETA, "clima_cu_horario.csv")
    if not os.path.exists(ruta):
        return {}
    dias = {}
    with open(ruta, encoding="utf-8") as archivo:
        for fila in csv.DictReader(archivo):
            momento = datetime.fromisoformat(fila["fecha_hora"])
            d = momento.date()
            lluvia, temps, rad = dias.get(d, (0.0, [], 0.0))
            if fila["lluvia_mm"] not in ("", "None") and 6 <= momento.hour <= 22:
                lluvia += float(fila["lluvia_mm"])
            if fila["temperatura_c"] not in ("", "None"):
                temps.append(float(fila["temperatura_c"]))
            if fila.get("radiacion_w_m2") not in (None, "", "None"):
                rad += float(fila["radiacion_w_m2"]) / 1000.0  # W/m² en una hora = Wh/m²
            dias[d] = (lluvia, temps, rad)
    return {d: (l, (sum(t) / len(t)) if t else float("nan"), r) for d, (l, t, r) in dias.items()}


def horas_sol_pico():
    """Promedio diario de radiación en CU (kWh/m²/día = horas solares pico), último año completo."""
    clima = cargar_clima()
    if not clima:
        return None
    ultimo = max(clima)
    valores = [v[2] for d, v in clima.items() if (ultimo - d).days < 365 and v[2] > 0]
    return float(np.mean(valores)) if valores else None


# --------------------------------------------------------------------------
# Modelo diario
# --------------------------------------------------------------------------
PERIODOS = {"clases": 0, "examenes": 1, "vacaciones": 2}
COLUMNAS = ["dia_semana", "periodo", "semana_semestre", "festivo", "dia_anio_sen", "dia_anio_cos",
            "anio", "lluvia_mm", "temp_c"]


def caracteristicas(d, clima=None):
    """Variables del día. Sin archivo de clima se omiten lluvia y temperatura."""
    periodo, semana = periodo_escolar(d)
    angulo = 2 * math.pi * d.timetuple().tm_yday / 365.25
    fila = [d.weekday(), PERIODOS[periodo], semana, int(d in festivos(d.year)),
            math.sin(angulo), math.cos(angulo), d.year]
    if clima:
        lluvia, temp = clima.get(d, (float("nan"), float("nan"), 0))[:2]
        fila += [lluvia, temp]
    return fila


class ModeloDemanda:
    """Gradient boosting sobre la afluencia diaria de Metro Universidad + Copilco."""

    def __init__(self):
        self.modelo = None
        self.metricas = None
        self.escala_pumabus = None  # pasajeros Pumabús por unidad de afluencia de Metro
        self.desde = self.hasta = None

    def entrenar(self, inicio_entrenamiento=date(2022, 8, 1)):
        from sklearn.ensemble import HistGradientBoostingRegressor

        metro = cargar_metro()
        if len(metro) < 200:
            raise RuntimeError("Faltan datos del Metro: corre backend/datos/descargar_datos_cu.py")
        clima = cargar_clima()
        fechas = sorted(d for d in metro if d >= inicio_entrenamiento and metro[d] > 0)
        self.desde, self.hasta = fechas[0], fechas[-1]
        X = np.array([caracteristicas(d, clima) for d in fechas], dtype=float)
        y = np.array([metro[d] for d in fechas], dtype=float)

        # Validación: los últimos 365 días quedan fuera del entrenamiento.
        corte = self.hasta - timedelta(days=365)
        entrenamiento = np.array([d <= corte for d in fechas])
        prueba = ~entrenamiento
        parametros = dict(max_iter=400, learning_rate=0.05, max_leaf_nodes=31,
                          categorical_features=[1], random_state=0)
        validacion = HistGradientBoostingRegressor(**parametros).fit(X[entrenamiento], y[entrenamiento])
        pred = validacion.predict(X[prueba])
        reales = y[prueba]

        # Referencias simples para saber si el modelo aporta: mismo día de la semana anterior
        # y promedio por día de la semana del periodo de entrenamiento.
        fechas_prueba = [d for d, p in zip(fechas, prueba) if p]
        semana_anterior = np.array([metro.get(d - timedelta(days=7), np.nan) for d in fechas_prueba])
        promedio_dia = {k: np.mean(y[entrenamiento][X[entrenamiento][:, 0] == k]) for k in range(7)}
        por_dia = np.array([promedio_dia[d.weekday()] for d in fechas_prueba])

        def errores(estimado):
            ok = ~np.isnan(estimado)
            mae = float(np.mean(np.abs(estimado[ok] - reales[ok])))
            mape = float(np.mean(np.abs(estimado[ok] - reales[ok]) / reales[ok]) * 100)
            return {"mae": round(mae), "mape_pct": round(mape, 1)}

        self.metricas = {
            "variables": COLUMNAS[:X.shape[1]],
            "prueba_desde": fechas_prueba[0].isoformat(), "prueba_hasta": fechas_prueba[-1].isoformat(),
            "dias_entrenamiento": int(entrenamiento.sum()), "dias_prueba": int(prueba.sum()),
            "modelo": errores(pred),
            "referencia_semana_anterior": errores(semana_anterior),
            "referencia_promedio_dia_semana": errores(por_dia),
        }

        # Modelo final con todos los datos.
        self.modelo = HistGradientBoostingRegressor(**parametros).fit(X, y)

        # Calibración: el año 2024 debe sumar los usuarios anuales del Pumabús.
        dias_2024 = [date(2024, 1, 1) + timedelta(days=k) for k in range(366)]
        actividad_2024 = sum(metro.get(d, 0) for d in dias_2024)
        if actividad_2024 == 0:
            actividad_2024 = float(np.sum(self.modelo.predict(
                np.array([caracteristicas(d, clima) for d in dias_2024], dtype=float))))
        self.escala_pumabus = USUARIOS_PUMABUS_2024 / actividad_2024
        return self.metricas

    def afluencia_metro(self, d):
        if self.modelo is None:
            self.entrenar()
        clima = cargar_clima()
        return float(self.modelo.predict(np.array([caracteristicas(d, clima)], dtype=float))[0])

    def pasajeros_pumabus_dia(self, d):
        """Pasajeros del Pumabús pronosticados para la fecha (todas las rutas)."""
        return max(0.0, self.afluencia_metro(d) * self.escala_pumabus)


_MODELO = None
_CANDADO = threading.Lock()


def modelo():
    """Entrena una sola vez. El candado evita que dos peticiones simultáneas (el frontend
    pide el escenario dos veces al arrancar) usen un modelo a medio entrenar."""
    global _MODELO
    with _CANDADO:
        if _MODELO is None:
            nuevo = ModeloDemanda()
            nuevo.entrenar()
            _MODELO = nuevo
    return _MODELO


# --------------------------------------------------------------------------
# Hora y paradero
# --------------------------------------------------------------------------
# Peso relativo de cada hora de servicio (6 a 21 h). Los picos de 7–8 y 15–16 h vienen de la
# tesis de Cifuentes (2016); la forma entre picos es una suposición nuestra.
PERFIL_HORARIO = {6: 5.0, 7: 11.0, 8: 9.0, 9: 6.0, 10: 5.5, 11: 5.5, 12: 6.0, 13: 7.0, 14: 7.5,
                  15: 10.0, 16: 8.5, 17: 6.5, 18: 5.5, 19: 4.5, 20: 3.5, 21: 2.5}
_SUMA_PERFIL = sum(PERFIL_HORARIO.values())


def fraccion_hora(hora):
    return PERFIL_HORARIO.get(hora, 0.0) / _SUMA_PERFIL


def demanda_horaria(d):
    """Pasajeros del Pumabús por hora para la fecha: {hora: pasajeros}."""
    total = modelo().pasajeros_pumabus_dia(d)
    return {h: total * fraccion_hora(h) for h in PERFIL_HORARIO}


def repartir_por_paradero(pasajeros, pesos):
    """Reparte un total entero de pasajeros según pesos {id: peso} (método del mayor residuo)."""
    total_peso = sum(pesos.values())
    if total_peso <= 0 or pasajeros <= 0:
        return {k: 0 for k in pesos}
    exactos = {k: pasajeros * p / total_peso for k, p in pesos.items()}
    enteros = {k: int(v) for k, v in exactos.items()}
    sobrante = int(round(pasajeros)) - sum(enteros.values())
    for k in sorted(exactos, key=lambda k: exactos[k] - enteros[k], reverse=True)[:max(sobrante, 0)]:
        enteros[k] += 1
    return enteros
