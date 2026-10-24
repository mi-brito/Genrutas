"""
Escenario real de Ciudad Universitaria a partir de OpenStreetMap (© OpenStreetMap contributors, ODbL).

- Rutas actuales del Pumabús: paradas en orden, trazo por calle y longitud.
- Paraderos únicos, con las rutas que pasan por cada uno.
- Peso de demanda de cada paradero: matrícula de licenciatura de las facultades cercanas
  (Agenda Estadística UNAM 2025, ciclo 2024-2025).
"""

import json
import math
import os
import re
import unicodedata
from functools import lru_cache

CARPETA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos", "cu")

# Población escolar de licenciatura 2024-2025 (incluye SUAyED). Agenda Estadística UNAM 2025, pp. 18-19.
# https://www.planeacion.unam.mx/Agenda/2025/pdf/AgendaUNAM2025.pdf
MATRICULA = {
    "arquitectura": 6951, "ciencias": 9686, "ciencias politicas": 12974, "contaduria": 16135,
    "derecho": 17677, "economia": 7324, "filosofia": 11010, "ingenieria": 13552, "medicina": 11520,
    "veterinaria": 3288, "odontologia": 2889, "psicologia": 4215, "quimica": 8061, "trabajo social": 3715,
}
# Institutos, centros y espacios sin matrícula de licenciatura: peso fijo (supuesto nuestro).
PESO_OTROS = 400
RADIO_FACULTAD_M = 450


def _normaliza(texto):
    texto = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", texto).strip()


def distancia_m(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6_371_000 * 2 * math.asin(math.sqrt(h))


@lru_cache(maxsize=1)
def cargar_osm():
    ruta = os.path.join(CARPETA, "osm_cu.json")
    if not os.path.exists(ruta):
        raise RuntimeError("Falta osm_cu.json: corre backend/datos/descargar_datos_cu.py")
    with open(ruta, encoding="utf-8") as archivo:
        return json.load(archivo)["elements"]


def _encadenar(tramos):
    """Une los tramos (listas de puntos) de una ruta en un solo trazo, volteando los que vengan al revés."""
    trazo = []
    for tramo in tramos:
        if not tramo:
            continue
        if trazo:
            fin = trazo[-1]
            if distancia_m(fin, tramo[-1]) < distancia_m(fin, tramo[0]):
                tramo = tramo[::-1]
            if distancia_m(fin, tramo[0]) < 1:
                tramo = tramo[1:]
        trazo.extend(tramo)
    return trazo


def _base_de(nombre_parada):
    n = _normaliza(nombre_parada)
    if n.startswith("universidad r-") or "metro universidad" in n:
        return "Metro Universidad"
    if "metrobus" in n:
        return "Metrobús CU"
    if "estadio" in n or "estacionamiento" in n or n == "e1":
        return "Estadio Olímpico"
    return None


@lru_cache(maxsize=1)
def rutas_actuales():
    elementos = cargar_osm()
    nodos = {e["id"]: e for e in elementos if e["type"] == "node"}
    rutas = []
    for rel in elementos:
        etiquetas = rel.get("tags", {})
        if rel["type"] != "relation" or etiquetas.get("route") != "bus":
            continue
        if "puma" not in _normaliza(etiquetas.get("network", "") + etiquetas.get("name", "")):
            continue
        numero = re.search(r"(\d+)", etiquetas.get("ref") or etiquetas.get("name", ""))
        if not numero:
            continue
        paradas, tramos = [], []
        for miembro in rel.get("members", []):
            rol = miembro.get("role", "")
            if miembro["type"] == "node" and rol.startswith("stop") and "lat" in miembro:
                nombre = nodos.get(miembro["ref"], {}).get("tags", {}).get("name") or "Parada sin nombre"
                paradas.append({"osm_id": miembro["ref"], "nombre": nombre,
                                "lat": miembro["lat"], "lng": miembro["lon"]})
            elif miembro["type"] == "way" and rol == "" and miembro.get("geometry"):
                tramos.append([(p["lat"], p["lon"]) for p in miembro["geometry"]])
        trazo = _encadenar(tramos)
        longitud = sum(distancia_m(trazo[i], trazo[i + 1]) for i in range(len(trazo) - 1)) / 1000
        if len(paradas) < 3 or longitud < 1:
            continue  # relación incompleta en OSM (p. ej. la ruta 12)
        base = _base_de(paradas[0]["nombre"]) or _base_de(paradas[-1]["nombre"])
        rutas.append({
            "ruta": int(numero.group(1)),
            "nombre": etiquetas.get("name"),
            "color": etiquetas.get("colour", "#888888"),
            "base": base,
            "paradas": paradas,
            "trazo": [[round(a, 6), round(b, 6)] for a, b in trazo],
            "longitud_km": round(longitud, 2),
            "osm_relacion": rel["id"],
        })
    return sorted(rutas, key=lambda r: r["ruta"])


@lru_cache(maxsize=1)
def lugares():
    """Facultades e institutos con su punto central."""
    salida = []
    for e in cargar_osm():
        nombre = e.get("tags", {}).get("name")
        if not nombre or e["type"] == "relation" and e["tags"].get("route") == "bus":
            continue
        punto = (e.get("lat"), e.get("lon")) if e["type"] == "node" else (
            (e["center"]["lat"], e["center"]["lon"]) if "center" in e else (None, None))
        if punto[0] is None:
            continue
        salida.append({"nombre": nombre, "lat": punto[0], "lng": punto[1]})
    return salida


def _matricula_de(nombre):
    n = _normaliza(nombre)
    if not (n.startswith("facultad") or n.startswith("escuela nacional de trabajo")):
        return None
    # La clave más larga primero para no confundir "ciencias" con "ciencias politicas".
    for clave in sorted(MATRICULA, key=len, reverse=True):
        if clave in n:
            return clave
    return None


@lru_cache(maxsize=1)
def paraderos():
    """Paraderos únicos (se juntan los que tienen el mismo nombre a menos de 80 m)."""
    unicos = []
    for ruta in rutas_actuales():
        for p in ruta["paradas"]:
            existente = next((u for u in unicos if _normaliza(u["nombre"]) == _normaliza(p["nombre"])
                              and distancia_m((u["lat"], u["lng"]), (p["lat"], p["lng"])) < 80), None)
            if existente is None:
                existente = {"id": len(unicos) + 1, "nombre": p["nombre"], "lat": p["lat"], "lng": p["lng"],
                             "rutas": [], "base": _base_de(p["nombre"])}
                unicos.append(existente)
            if ruta["ruta"] not in existente["rutas"]:
                existente["rutas"].append(ruta["ruta"])
    _asignar_pesos(unicos)
    return unicos


def _asignar_pesos(lista):
    """Cada facultad reparte su matrícula entre los paraderos a menos de 450 m (inverso de la distancia)."""
    for p in lista:
        p["peso"] = 0.0
        p["facultades"] = []
    facultades = {}
    for lugar in lugares():
        clave = _matricula_de(lugar["nombre"])
        if not clave:
            continue
        # Un punto por facultad: se prefiere el edificio principal (nombre sin anexo ni " - ...").
        principal = " - " not in lugar["nombre"] and "anexo" not in _normaliza(lugar["nombre"])
        if clave not in facultades or (principal and not facultades[clave][1]):
            facultades[clave] = (lugar, principal)
    facultades = {clave: lugar for clave, (lugar, _) in facultades.items()}
    for clave, lugar in facultades.items():
        cercanos = [(distancia_m((lugar["lat"], lugar["lng"]), (p["lat"], p["lng"])), p) for p in lista]
        cercanos = [(d, p) for d, p in cercanos if d <= RADIO_FACULTAD_M] or [min(cercanos, key=lambda x: x[0])]
        inversos = [(1 / max(d, 50), p) for d, p in cercanos]
        suma = sum(i for i, _ in inversos)
        for i, p in inversos:
            p["peso"] += MATRICULA[clave] * i / suma
            p["facultades"].append(clave)
    for p in lista:
        if p["peso"] == 0:
            p["peso"] = PESO_OTROS
        p["peso"] = round(p["peso"], 1)


def resumen():
    rutas = rutas_actuales()
    return {
        "rutas": [{k: r[k] for k in ("ruta", "nombre", "color", "base", "longitud_km")} | {"paradas": len(r["paradas"])}
                  for r in rutas],
        "paraderos": len(paraderos()),
        "bases": sorted({r["base"] for r in rutas if r["base"]}),
    }
