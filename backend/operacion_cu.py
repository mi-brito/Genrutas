"""
Operación de un día del Pumabús: la de hoy contra la que propone GenRutas.

Línea base (operación actual)
  Frecuencias por ruta y periodo medidas con GPS en 2014 (Cifuentes, II-UNAM 2016), escaladas
  para que el año sume los 325 mil recorridos y ~2.5 millones de km de la Memoria UNAM 2024.
  El reparto entre horas es fijo: no sigue a la demanda.

GenRutas
  Mismos recorridos al día, repartidos por hora según la demanda pronosticada (con un mínimo
  de servicio por ruta). Las unidades que sobran en el valle de 9 a 15 h se cargan con sol.

Eléctrico y solar
  Energía = km × consumo. La generación solar sale de la radiación horaria real de CU
  (Open-Meteo) para el mes de la fecha, por los kWp instalados en las bases.
"""

import csv
import os
from datetime import date, datetime
from functools import lru_cache

import demanda_cu
from parametros_cu import impacto_escenarios, valor

# Frecuencia (autobuses/h) por periodo y longitud (km). Cifuentes (2016), tabla de GPS 2014.
# Periodos: 6–9, 9–15, 15–19 y 19–22 h. La ruta 13 se creó después y no tiene medición.
RUTAS_2014 = {
    1: ((3.5, 2.2, 3.4, 3.2), 6.3), 2: ((5.8, 3.3, 4.3, 5.1), 3.8), 3: ((4.8, 2.0, 2.2, 2.8), 9.5),
    4: ((3.2, 1.6, 2.5, 1.8), 6.3), 5: ((4.3, 2.1, 3.2, 3.0), 6.6), 6: ((1.5, 1.4, 1.4, 1.1), 9.7),
    7: ((2.8, 2.5, 2.6, 2.4), 4.7), 8: ((2.5, 2.1, 2.2, 2.0), 6.0), 9: ((2.1, 1.8, 1.9, 1.9), 4.0),
    10: ((1.0, 2.9, 1.0, 2.7), 11.6), 11: ((1.0, 2.0, 1.0, 0.5), 5.8), 12: ((1.0, 2.5, 2.0, 2.6), 3.8),
}
BASE_DE_RUTA = {**{r: "Metro Universidad" for r in (1, 2, 3, 4, 5)},
                **{r: "Estadio Olímpico" for r in (6, 7, 8)},
                **{r: "Metrobús CU" for r in (9, 10, 11, 12)}}

RECORRIDOS_ANUALES = 325_000          # Memoria UNAM 2024
KM_POR_RECORRIDO = 2_500_000 / RECORRIDOS_ANUALES  # ~7.7 km (Memoria UNAM 2024)
FRECUENCIA_MINIMA = 2.0               # recorridos/h por ruta (espera máxima ~30 min); supuesto nuestro
DESCANSO_MIN = 5                      # minutos en la base entre recorridos; supuesto nuestro
HORAS = list(range(6, 22))            # servicio de 6:00 a 22:00
HORAS_SOL = range(9, 15)              # valle de demanda con sol


def _periodo(hora):
    return 0 if hora < 9 else 1 if hora < 15 else 2 if hora < 19 else 3


def recorridos_base_por_hora():
    """Forma del día actual: recorridos/h de todas las rutas (sin escalar)."""
    return {h: sum(f[_periodo(h)] for f, _ in RUTAS_2014.values()) for h in HORAS}


@lru_cache(maxsize=1)
def radiacion_por_mes_hora():
    """Radiación media (W/m²) por (mes, hora) en CU, últimos 3 años de Open-Meteo."""
    ruta = os.path.join(demanda_cu.CARPETA, "clima_cu_horario.csv")
    if not os.path.exists(ruta):
        return {}
    sumas, conteos = {}, {}
    with open(ruta, encoding="utf-8") as archivo:
        filas = list(csv.DictReader(archivo))
    if not filas or "radiacion_w_m2" not in filas[0]:
        return {}
    ultimo = datetime.fromisoformat(filas[-1]["fecha_hora"])
    for fila in filas:
        momento = datetime.fromisoformat(fila["fecha_hora"])
        if (ultimo - momento).days > 3 * 365 or fila["radiacion_w_m2"] in ("", "None"):
            continue
        # Open-Meteo da el promedio de la hora anterior: el valor de las 10:00 es de 9 a 10.
        clave = (momento.month, (momento.hour - 1) % 24)
        sumas[clave] = sumas.get(clave, 0.0) + float(fila["radiacion_w_m2"])
        conteos[clave] = conteos.get(clave, 0) + 1
    return {k: sumas[k] / conteos[k] for k in sumas}


def plan_dia(fecha: date, kwp_solar: float = 0.0, consumo_kwh_km: float = None, flota: int = None):
    consumo = consumo_kwh_km or valor("consumo_ev_kwh_km")
    capacidad = valor("capacidad_pasajeros")
    flota = flota or valor("flota_unidades")  # por defecto, la flota real del Pumabús (60)
    duracion_recorrido_h = KM_POR_RECORRIDO / valor("velocidad_kmh") + DESCANSO_MIN / 60

    modelo = demanda_cu.modelo()
    pasajeros_dia = modelo.pasajeros_pumabus_dia(fecha)
    demanda = {h: pasajeros_dia * demanda_cu.fraccion_hora(h) for h in HORAS}

    # Recorridos del día: proporcionales a la demanda del día (325 mil al año).
    recorridos_dia = RECORRIDOS_ANUALES * pasajeros_dia / demanda_cu.USUARIOS_PUMABUS_2024
    forma = recorridos_base_por_hora()
    escala = recorridos_dia / sum(forma.values())
    base = {h: forma[h] * escala for h in HORAS}

    # GenRutas: mismos recorridos, repartidos según la demanda, con un mínimo de servicio por
    # hora y sin pasar de lo que la flota puede cubrir en una hora.
    minimo = FRECUENCIA_MINIMA * len(RUTAS_2014)
    maximo = flota / duracion_recorrido_h
    genrutas = {h: minimo for h in HORAS}
    restante = max(recorridos_dia - minimo * len(HORAS), 0.0)
    libres = set(HORAS)
    while restante > 1e-6 and libres:
        peso = sum(demanda[h] for h in libres) or 1.0
        topadas = set()
        repartido = 0.0
        for h in libres:
            agregar = restante * demanda[h] / peso
            if genrutas[h] + agregar >= maximo:
                agregar = maximo - genrutas[h]
                topadas.add(h)
            genrutas[h] += agregar
            repartido += agregar
        restante -= repartido
        if not topadas:
            break
        libres -= topadas

    radiacion = radiacion_por_mes_hora()
    horas = []
    for h in HORAS:
        fila = {"hora": h, "demanda": round(demanda[h])}
        for nombre, recorridos in (("base", base[h]), ("genrutas", genrutas[h])):
            en_servicio = recorridos * duracion_recorrido_h
            fila[nombre] = {
                "recorridos": round(recorridos, 1),
                "km": round(recorridos * KM_POR_RECORRIDO, 1),
                "pasajeros_por_recorrido": round(demanda[h] / recorridos, 1) if recorridos else None,
                "ocupacion_pct": round(100 * demanda[h] / (recorridos * capacidad), 1) if recorridos else None,
                "unidades_en_servicio": round(en_servicio, 1),
                "unidades_libres": round(max(flota - en_servicio, 0), 1),
            }
        sol = radiacion.get((fecha.month, h), 0.0)
        fila["solar_kwh"] = round(kwp_solar * sol / 1000 * valor("rendimiento_fv"), 1)
        horas.append(fila)

    resumen = {}
    for nombre in ("base", "genrutas"):
        km = sum(f[nombre]["km"] for f in horas)
        kwh = km * consumo
        # El sol solo carga unidades que estén libres en el valle (potencia del cargador).
        solar = 0.0
        for f in horas:
            if f["hora"] in HORAS_SOL:
                potencia = f[nombre]["unidades_libres"] * valor("potencia_cargador_kw")
                solar += min(f["solar_kwh"], potencia)
        fraccion_solar = min(solar / kwh, 1.0) if kwh else 0.0
        picos = [f for f in horas if f["hora"] in (7, 15)]
        resumen[nombre] = {
            "recorridos": round(sum(f[nombre]["recorridos"] for f in horas)),
            "km": round(km),
            "kwh": round(kwh),
            "kwh_solar": round(min(solar, kwh)),
            "fraccion_solar": round(fraccion_solar, 3),
            "ocupacion_pico_pct": round(max(f[nombre]["ocupacion_pct"] for f in picos), 1),
            "ocupacion_valle_pct": round(min(f[nombre]["ocupacion_pct"] for f in horas), 1),
            "unidades_pico": round(max(f[nombre]["unidades_en_servicio"] for f in horas), 1),
            "unidades_libres_valle": round(min(f[nombre]["unidades_libres"] for f in horas if f["hora"] in HORAS_SOL), 1),
            "impacto": impacto_escenarios(km, kwh, fraccion_solar, carga="dia" if fraccion_solar > 0 else "noche"),
        }

    periodo, semana = demanda_cu.periodo_escolar(fecha)
    return {
        "fecha": fecha.isoformat(),
        "periodo": periodo,
        "semana_semestre": semana,
        "festivo": fecha in demanda_cu.festivos(fecha.year),
        "pasajeros_dia": round(pasajeros_dia),
        "kwp_solar": kwp_solar,
        "horas": horas,
        "resumen": resumen,
        "modelo": modelo.metricas,
        "supuestos": [
            "Pasajeros del día: modelo de gradient boosting con la afluencia real de Metro Universidad y Copilco, calibrado a 27.3 millones de usuarios en 2024.",
            "Reparto por hora: picos de 7–8 h y 15–16 h (Cifuentes 2016); la forma entre picos es supuesta.",
            "Operación actual: frecuencias GPS de 2014 escaladas a 325 mil recorridos al año (Memoria UNAM 2024).",
            f"GenRutas mantiene los mismos recorridos del día y al menos {FRECUENCIA_MINIMA:g} por ruta y hora.",
            "Solar: radiación horaria real de CU (Open-Meteo); solo carga unidades libres entre 9 y 15 h.",
        ],
    }
