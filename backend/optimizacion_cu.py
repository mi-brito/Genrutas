"""
Rutas nuevas para una base del Pumabús en una hora dada, comparadas con las rutas actuales.

1. Demanda de la hora (pronóstico de demanda_cu) para la base elegida.
2. Se reparte por paradero según la matrícula cercana (escenario_cu) y se divide en oleadas
   (salidas cada N minutos).
3. Los paraderos que llenan un autobús completo reciben viajes directos; el resto lo combina el
   NSGA-II eléctrico en rutas con batería y recarga en la base.
4. Se compara contra las rutas actuales de esa base con sus frecuencias.

Supuesto principal: en horas pico los viajes van hacia o desde la base (Metro Universidad,
Metrobús CU o Estadio), como describe Cifuentes (2016) para 7–8 h y 15–16 h.
"""

import math
from datetime import date

import demanda_cu
import escenario_cu
import operacion_cu
from parametros_cu import impacto_escenarios, valor

SERVICIO_MIN = 2           # minutos para subir o bajar pasajeros en cada parada (supuesto)
FACTOR_DESVIO = 1.3        # calle vs. línea recta (el mismo del motor sin Mapbox)


def _rutas_de_base(base):
    return [r for r, b in operacion_cu.BASE_DE_RUTA.items() if b == base]


def participacion_base(base):
    """Fracción de los recorridos diarios del Pumabús que salen de esa base (frecuencias 2014)."""
    def diarios(r):
        f, _ = operacion_cu.RUTAS_2014[r]
        return 3 * f[0] + 6 * f[1] + 4 * f[2] + 3 * f[3]
    total = sum(diarios(r) for r in operacion_cu.RUTAS_2014)
    return sum(diarios(r) for r in _rutas_de_base(base)) / total


def _punto_base(base):
    puntos = [(p["lat"], p["lng"]) for p in escenario_cu.paraderos() if p["base"] == base]
    if not puntos:
        raise ValueError(f"No hay paraderos de la base {base} en OpenStreetMap")
    return (sum(p[0] for p in puntos) / len(puntos), sum(p[1] for p in puntos) / len(puntos))


def paraderos_de_base(base, max_paradas):
    """Paraderos que hoy atienden las rutas de la base; los menos pesados se suman al más cercano."""
    rutas = set(_rutas_de_base(base))
    candidatos = [dict(p) for p in escenario_cu.paraderos()
                  if p["base"] is None and rutas & set(p["rutas"])]
    candidatos.sort(key=lambda p: -p["peso"])
    elegidos, resto = candidatos[:max_paradas], candidatos[max_paradas:]
    for p in resto:
        destino = min(elegidos, key=lambda e: escenario_cu.distancia_m((e["lat"], e["lng"]), (p["lat"], p["lng"])))
        destino["peso"] += p["peso"]
    return elegidos


def linea_base_hora(base, hora, escala):
    """Rutas actuales de la base en esa hora: recorridos, km, unidades y espera promedio."""
    periodo = operacion_cu._periodo(hora)
    osm = {r["ruta"]: r for r in escenario_cu.rutas_actuales()}
    rutas, km, unidades, espera_ponderada, recorridos_total = [], 0.0, 0.0, 0.0, 0.0
    for r in _rutas_de_base(base):
        frecuencias, longitud_2014 = operacion_cu.RUTAS_2014[r]
        recorridos = frecuencias[periodo] * escala
        longitud = osm[r]["longitud_km"] if r in osm else longitud_2014
        km += recorridos * longitud
        unidades += recorridos * (longitud / valor("velocidad_kmh") + operacion_cu.DESCANSO_MIN / 60)
        espera_ponderada += recorridos * (30 / recorridos if recorridos else 0)
        recorridos_total += recorridos
        rutas.append({"ruta": r, "recorridos_hora": round(recorridos, 1), "longitud_km": longitud,
                      "color": osm.get(r, {}).get("color", "#888888"), "trazo": osm.get(r, {}).get("trazo", []),
                      "paradas": [p["nombre"] for p in osm.get(r, {}).get("paradas", [])]})
    return {
        "rutas": rutas,
        "recorridos_hora": round(recorridos_total, 1),
        "km_hora": round(km, 1),
        "unidades": round(unidades, 1),
        "espera_prom_min": round(espera_ponderada / recorridos_total, 1) if recorridos_total else None,
    }


def disenar(fecha: date, hora: int, base: str = "Metro Universidad", oleada_min: int = 10,
            fraccion_solar: float = 1.0, max_paradas: int = 12, consumo_kwh_km: float = None):
    from main import OptimizeRequest, optimizar  # import aquí para evitar el ciclo con main

    consumo = consumo_kwh_km or valor("consumo_ev_kwh_km")
    capacidad = int(valor("capacidad_pasajeros"))
    velocidad = valor("velocidad_kmh")
    oleadas_hora = 60 / oleada_min

    # 1. Demanda
    modelo = demanda_cu.modelo()
    pasajeros_dia = modelo.pasajeros_pumabus_dia(fecha)
    demanda_hora = pasajeros_dia * demanda_cu.fraccion_hora(hora) * participacion_base(base)
    por_oleada = round(demanda_hora / oleadas_hora)

    # 2. Paraderos y reparto
    paradas = paraderos_de_base(base, max_paradas)
    reparto = demanda_cu.repartir_por_paradero(por_oleada, {p["id"]: p["peso"] for p in paradas})
    punto_base = _punto_base(base)
    for p in paradas:
        p["pasajeros_oleada"] = reparto[p["id"]]
        p["directos"] = reparto[p["id"]] // capacidad
        p["resto"] = reparto[p["id"]] % capacidad

    # 3a. Viajes directos (autobús lleno, base ↔ paradero)
    directos = []
    for p in paradas:
        if p["directos"]:
            km = 2 * escenario_cu.distancia_m(punto_base, (p["lat"], p["lng"])) * FACTOR_DESVIO / 1000
            minutos = km / velocidad * 60 + 2 * SERVICIO_MIN
            kwh = km * consumo * (1 + 0.10 * 0.5)  # lleno de ida, vacío de regreso
            directos.append({"paradero": p["id"], "nombre": p["nombre"], "viajes": p["directos"],
                             "trazo": [list(punto_base), [p["lat"], p["lng"]], list(punto_base)],
                             "km": round(km * p["directos"], 2), "kwh": round(kwh * p["directos"], 2),
                             "minutos": round(minutos, 1)})

    # 3b. NSGA-II para lo que no llena un autobús
    con_resto = [p for p in paradas if p["resto"] > 0]
    vrp = None
    if con_resto:
        fin = min(hora + 1, 23)
        estacion = (punto_base[0] + 0.00005, punto_base[1] + 0.00005)  # cargador en la base
        nodos = ([{"id": 0, "lat": punto_base[0], "lng": punto_base[1], "demand": 0, "type": "depot"}]
                 + [{"id": p["id"], "lat": p["lat"], "lng": p["lng"], "demand": p["resto"], "type": "container"}
                    for p in con_resto]
                 + [{"id": 999, "lat": estacion[0], "lng": estacion[1], "demand": 0, "type": "charging_station"}])
        solicitud = OptimizeRequest(
            nodes=nodos, vehicleCapacity=capacidad, timeWindow=(f"{hora:02d}:00", f"{fin:02d}:00"),
            # Hasta un autobús por paradero: así siempre existe una solución factible y el
            # NSGA-II decide cuáles juntar.
            numberOfVehicles=len(con_resto),
            startTime=f"{hora:02d}:00", serviceTime=SERVICIO_MIN,
            vehicleAutonomy=valor("bateria_kwh"), vehicleConsumption=consumo,
            chargingPowerKw=valor("potencia_cargador_kw"), batteryReserve=valor("reserva_bateria"),
            speedKmh=velocidad, solarFraction=fraccion_solar, chargingPeriod="dia",
        )
        vrp = optimizar(solicitud)

    # 4. Rutas del NSGA-II. Si alguna excede la capacidad (el algoritmo genético no siempre
    #    llega a una solución factible), se parte en el orden de visita: reparación de capacidad.
    elegida = vrp["paretoFront"][0] if vrp and vrp["paretoFront"] else None
    resto_por_id = {p["id"]: p["resto"] for p in paradas}
    posicion = {p["id"]: (p["lat"], p["lng"]) for p in paradas}
    rutas_nuevas = []
    for r in (elegida["routes"] if elegida else []):
        if r["carga"] <= capacidad:
            rutas_nuevas.append({"nodos": r["nodos"], "carga": r["carga"], "distancia_m": r["distancia_m"],
                                 "tiempo_s": r["tiempo_s"], "energia_kwh": r["energia_kwh"],
                                 "recargas": r["recargas"], "reparada": False})
            continue
        grupo, carga = [], 0
        grupos = []
        for i in [n for n in r["nodos"] if n in resto_por_id]:
            if grupo and carga + resto_por_id[i] > capacidad:
                grupos.append(grupo)
                grupo, carga = [], 0
            grupo.append(i)
            carga += resto_por_id[i]
        if grupo:
            grupos.append(grupo)
        for g in grupos:
            puntos = [punto_base] + [posicion[i] for i in g] + [punto_base]
            km = sum(escenario_cu.distancia_m(puntos[k], puntos[k + 1]) for k in range(len(puntos) - 1)) * FACTOR_DESVIO / 1000
            rutas_nuevas.append({
                "nodos": [0] + g + [0], "carga": sum(resto_por_id[i] for i in g),
                "distancia_m": round(km * 1000, 1), "tiempo_s": round((km / velocidad + len(g) * SERVICIO_MIN / 60) * 3600, 1),
                "energia_kwh": round(km * consumo * (1 + 0.10 * 0.5), 2), "recargas": 0, "reparada": True,
            })
    nombres = {p["id"]: p["nombre"] for p in paradas}
    for k, r in enumerate(rutas_nuevas, start=1):
        r["id"] = k
        r["paradas"] = [nombres.get(i, base) for i in r["nodos"]]
        r["trazo"] = [list(punto_base if i == 0 else posicion[i]) for i in r["nodos"] if i == 0 or i in posicion]

    # 5. Totales por hora
    km_oleada = sum(d["km"] for d in directos) + sum(r["distancia_m"] for r in rutas_nuevas) / 1000
    kwh_oleada = sum(d["kwh"] for d in directos) + sum(r["energia_kwh"] for r in rutas_nuevas)
    horas_bus_oleada = (sum(d["viajes"] * d["minutos"] for d in directos) / 60
                        + sum(r["tiempo_s"] for r in rutas_nuevas) / 3600)
    km_hora = km_oleada * oleadas_hora
    kwh_hora = kwh_oleada * oleadas_hora
    genrutas = {
        "oleada_min": oleada_min,
        "recorridos_hora": round((sum(d["viajes"] for d in directos) + len(rutas_nuevas)) * oleadas_hora, 1),
        "km_hora": round(km_hora, 1),
        "kwh_hora": round(kwh_hora, 1),
        "unidades": round(horas_bus_oleada * oleadas_hora, 1),
        "espera_prom_min": round(oleada_min / 2, 1),
        "pasajeros_por_km": round(demanda_hora / km_hora, 2) if km_hora else None,
        "kwh_por_pasajero": round(kwh_hora / demanda_hora, 3) if demanda_hora else None,
        "directos": directos,
        "rutas_nsga2": rutas_nuevas,
        "rutas_reparadas": sum(r["reparada"] for r in rutas_nuevas),
        "impacto": impacto_escenarios(km_hora, kwh_hora, fraccion_solar, carga="dia"),
    }

    escala = (operacion_cu.RECORRIDOS_ANUALES * pasajeros_dia / demanda_cu.USUARIOS_PUMABUS_2024
              / sum(operacion_cu.recorridos_base_por_hora().values()))
    actual = linea_base_hora(base, hora, escala)
    actual["kwh_hora"] = round(actual["km_hora"] * consumo, 1)
    actual["pasajeros_por_km"] = round(demanda_hora / actual["km_hora"], 2) if actual["km_hora"] else None
    actual["kwh_por_pasajero"] = round(actual["kwh_hora"] / demanda_hora, 3) if demanda_hora else None
    actual["impacto"] = impacto_escenarios(actual["km_hora"], actual["kwh_hora"], fraccion_solar, carga="dia")

    periodo, semana = demanda_cu.periodo_escolar(fecha)
    return {
        "fecha": fecha.isoformat(), "hora": hora, "base": base, "periodo": periodo, "semana_semestre": semana,
        "pasajeros_dia": round(pasajeros_dia), "demanda_hora": round(demanda_hora),
        "participacion_base": round(participacion_base(base), 3), "pasajeros_oleada": por_oleada,
        "punto_base": punto_base,
        "paradas": [{k: p[k] for k in ("id", "nombre", "lat", "lng", "peso", "pasajeros_oleada", "directos", "resto", "facultades")}
                    for p in paradas],
        "genrutas": genrutas,
        "actual": actual,
        "motor": None if not vrp else {"aviso": vrp["aviso"], "fuenteMatriz": vrp["fuenteMatriz"],
                                       "graficas": vrp["graficas"], "soluciones_frente": len(vrp["paretoFront"])},
        "supuestos": [
            "Demanda de la hora: pronóstico diario (Metro Universidad + Copilco, calibrado a 27.3 M de usuarios) × perfil horario × participación de la base en los recorridos de 2014.",
            "En la hora analizada los viajes van hacia o desde la base (patrón de picos de Cifuentes 2016).",
            f"GenRutas sale cada {oleada_min} min; los paraderos que llenan un autobús reciben viajes directos y el resto lo combina el NSGA-II.",
            "Rutas actuales: trazo de OpenStreetMap y frecuencias GPS de 2014 escaladas a la Memoria UNAM 2024.",
            f"{SERVICIO_MIN} min por parada para subir o bajar; distancias en línea recta × {FACTOR_DESVIO} a {velocidad:g} km/h.",
        ],
    }
