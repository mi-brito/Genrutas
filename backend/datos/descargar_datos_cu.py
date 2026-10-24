"""
Descarga los datos públicos que usa el escenario de Ciudad Universitaria (CU, UNAM).

Se corre una vez, en una computadora con internet:

    cd backend
    python datos/descargar_datos_cu.py

Guarda en backend/datos/cu/:
  - osm_cu.json                 Paraderos, rutas de autobús y lugares de CU (OpenStreetMap, ODbL)
  - metro_universidad_diario.csv  Afluencia diaria de las estaciones Universidad y Copilco
                                  (STC Metro, Portal de Datos Abiertos CDMX)
  - clima_cu_horario.csv        Temperatura, lluvia y radiación solar por hora en CU (Open-Meteo, ERA5)
  - fuentes_descarga.json       Qué se descargó, de dónde y cuándo

Solo usa la biblioteca estándar de Python. Cada parte es independiente:
si una falla, las demás se guardan igual.
"""

import csv
import io
import json
import os
import ssl
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime

CARPETA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cu")
# El Python de python.org en Mac no trae certificados raíz; certifi (ya instalado con httpx) sí.
try:
    import certifi
    CONTEXTO_SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CONTEXTO_SSL = ssl.create_default_context()

AGENTE = "GenRutas/1.0 (proyecto estudiantil UNAM; descarga única de datos abiertos)"

# Rectángulo que cubre CU con margen: sur, oeste, norte, este
BBOX = (19.300, -99.200, 19.340, -99.163)
CENTRO_CU = (19.3240, -99.1840)

ESTACIONES_METRO = {"universidad", "copilco"}
FECHA_INICIO_CLIMA = "2021-01-01"


def descargar(url, datos=None, intentos=3, espera=5, timeout=180):
    """GET o POST con reintentos. Devuelve bytes."""
    ultimo_error = None
    for intento in range(1, intentos + 1):
        try:
            peticion = urllib.request.Request(url, data=datos, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(peticion, timeout=timeout, context=CONTEXTO_SSL) as respuesta:
                return respuesta.read()
        except Exception as error:  # noqa: BLE001
            ultimo_error = error
            print(f"    intento {intento} falló: {error}")
            time.sleep(espera * intento)
    raise RuntimeError(f"No se pudo descargar {url}: {ultimo_error}")


# --------------------------------------------------------------------------
# 1. OpenStreetMap: paraderos, rutas y lugares
# --------------------------------------------------------------------------
SERVIDORES_OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def consulta_overpass():
    s, o, n, e = BBOX
    caja = f"({s},{o},{n},{e})"
    return f"""
[out:json][timeout:120];
(
  relation["route"="bus"]{caja};
)->.rutas;
.rutas out body geom;
(
  node["highway"="bus_stop"]{caja};
  node["public_transport"~"platform|stop_position"]{caja};
)->.paradas;
.paradas out body;
(
  nwr["name"~"^(Facultad|Escuela Nacional|Instituto de|Biblioteca Central|Torre de Rector|Rector|Estadio Ol|Centro Cultural|Universum|Sala Nezahualc|Tienda UNAM|Alberca Ol|Frontón|Unidad de Posgrado|Anexo de Ingenier|Conjunto Sur|Metro Universidad|Copilco|Ciudad Universitaria|Investigación Científica)",i]{caja};
  nwr["amenity"~"university|college|library|charging_station"]["name"]{caja};
  nwr["railway"="station"]{caja};
  nwr["amenity"="bus_station"]{caja};
)->.lugares;
.lugares out center tags;
"""


def descargar_osm():
    print("1/3 OpenStreetMap (paraderos, rutas y lugares de CU)...")
    datos = urllib.parse.urlencode({"data": consulta_overpass()}).encode()
    for servidor in SERVIDORES_OVERPASS:
        try:
            crudo = descargar(servidor, datos=datos, intentos=2, espera=10, timeout=240)
            resultado = json.loads(crudo)
            elementos = resultado.get("elements", [])
            rutas = [x for x in elementos if x.get("type") == "relation" and x.get("tags", {}).get("route") == "bus"]
            paradas = [x for x in elementos if x.get("type") == "node" and (
                x.get("tags", {}).get("highway") == "bus_stop" or "public_transport" in x.get("tags", {}))]
            ruta_archivo = os.path.join(CARPETA, "osm_cu.json")
            with open(ruta_archivo, "w", encoding="utf-8") as archivo:
                json.dump(resultado, archivo, ensure_ascii=False)
            pumabus = [r for r in rutas if "puma" in json.dumps(r.get("tags", {}), ensure_ascii=False).lower()]
            print(f"    OK: {len(elementos)} elementos, {len(rutas)} rutas de autobús "
                  f"({len(pumabus)} con 'Puma' en sus etiquetas), {len(paradas)} paradas")
            return {"archivo": "osm_cu.json", "servidor": servidor, "elementos": len(elementos),
                    "rutas_bus": len(rutas), "rutas_pumabus": len(pumabus), "paradas": len(paradas),
                    "licencia": "© OpenStreetMap contributors, ODbL"}
        except Exception as error:  # noqa: BLE001
            print(f"    {servidor} no respondió: {error}")
    raise RuntimeError("Ningún servidor de Overpass respondió")


# --------------------------------------------------------------------------
# 2. Afluencia diaria del Metro (Universidad y Copilco)
# --------------------------------------------------------------------------
CKAN = "https://datos.cdmx.gob.mx/api/3/action/"


def _normaliza(texto):
    reemplazos = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
    return (texto or "").strip().lower().translate(reemplazos)


def recursos_metro():
    """Busca en el portal de datos abiertos los CSV de afluencia diaria del Metro."""
    candidatos = []
    for paquete in ("afluencia-diaria-del-metro-cdmx", "afluencia-diaria-del-metro"):
        try:
            info = json.loads(descargar(CKAN + "package_show?id=" + paquete, intentos=2))
            if info.get("success"):
                candidatos = info["result"].get("resources", [])
                break
        except Exception as error:  # noqa: BLE001
            print(f"    package_show {paquete}: {error}")
    if not candidatos:
        busqueda = json.loads(descargar(CKAN + "package_search?q=" + urllib.parse.quote("afluencia metro") + "&rows=10"))
        for paquete in busqueda.get("result", {}).get("results", []):
            titulo = _normaliza(paquete.get("title", ""))
            if "afluencia" in titulo and "metro" in titulo and "metrobus" not in titulo:
                candidatos = paquete.get("resources", [])
                break
    csvs = [r for r in candidatos if (r.get("format", "").lower() == "csv" or r.get("url", "").lower().endswith(".csv"))]
    # Primero la versión simple (más ligera); luego la desglosada por forma de pago.
    csvs.sort(key=lambda r: (0 if "simple" in (r.get("name", "") + r.get("url", "")).lower() else 1,
                             -int(r.get("size") or 0)))
    return csvs


def descargar_metro():
    print("2/3 Afluencia diaria del Metro (Universidad y Copilco)...")
    recursos = recursos_metro()
    if not recursos:
        raise RuntimeError("No se encontraron CSV de afluencia del Metro en datos.cdmx.gob.mx")
    print(f"    {len(recursos)} archivos CSV encontrados")
    totales = {}
    usados = []
    for recurso in recursos:
        url = recurso["url"]
        print(f"    leyendo {recurso.get('name') or url} (puede tardar unos minutos)...")
        del_archivo = {}
        try:
            peticion = urllib.request.Request(url, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(peticion, timeout=600, context=CONTEXTO_SSL) as respuesta:
                # Se lee línea por línea para no cargar el archivo completo en memoria.
                lector = csv.DictReader(io.TextIOWrapper(respuesta, encoding="utf-8-sig", errors="replace"))
                columnas = {_normaliza(c): c for c in (lector.fieldnames or [])}
                if not {"fecha", "estacion", "afluencia"} <= set(columnas):
                    print(f"    columnas inesperadas: {lector.fieldnames}")
                    continue
                for fila in lector:
                    estacion = _normaliza(fila[columnas["estacion"]])
                    if estacion not in ESTACIONES_METRO:
                        continue
                    try:
                        valor = int(float(fila[columnas["afluencia"]] or 0))
                    except ValueError:
                        continue
                    clave = (fila[columnas["fecha"]].strip()[:10], estacion)
                    # El archivo desglosado trae una fila por forma de pago: se suman.
                    del_archivo[clave] = del_archivo.get(clave, 0) + valor
        except Exception as error:  # noqa: BLE001
            print(f"    no se pudo: {error}")
            continue
        nuevos = 0
        for clave, valor in del_archivo.items():
            if clave not in totales:  # si dos archivos repiten un día, se queda el primero
                totales[clave] = valor
                nuevos += 1
        if nuevos:
            usados.append(url)
            print(f"    {nuevos} días-estación nuevos")
        dias = {f for f, _ in totales}
        if len(dias) >= 3 * 365:
            break
    if not totales:
        raise RuntimeError("Ningún CSV del Metro tenía las estaciones Universidad o Copilco")
    ruta_archivo = os.path.join(CARPETA, "metro_universidad_diario.csv")
    with open(ruta_archivo, "w", newline="", encoding="utf-8") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(["fecha", "estacion", "afluencia"])
        for (fecha, estacion), valor in sorted(totales.items()):
            escritor.writerow([fecha, estacion, valor])
    fechas = sorted({f for f, _ in totales})
    print(f"    OK: {len(totales)} filas, de {fechas[0]} a {fechas[-1]}")
    return {"archivo": "metro_universidad_diario.csv", "urls": usados, "filas": len(totales),
            "desde": fechas[0], "hasta": fechas[-1],
            "fuente": "STC Metro, Portal de Datos Abiertos de la CDMX"}


# --------------------------------------------------------------------------
# 3. Clima horario (Open-Meteo, reanálisis ERA5)
# --------------------------------------------------------------------------
def descargar_clima():
    print("3/3 Clima horario de CU (Open-Meteo)...")
    fin = date.fromordinal(date.today().toordinal() - 7).isoformat()  # el archivo histórico tarda ~5 días
    parametros = urllib.parse.urlencode({
        "latitude": CENTRO_CU[0], "longitude": CENTRO_CU[1],
        "start_date": FECHA_INICIO_CLIMA, "end_date": fin,
        "hourly": "temperature_2m,precipitation,shortwave_radiation",
        "timezone": "America/Mexico_City",
    })
    url = "https://archive-api.open-meteo.com/v1/archive?" + parametros
    datos = json.loads(descargar(url, timeout=300))
    horas = datos["hourly"]["time"]
    temperatura = datos["hourly"]["temperature_2m"]
    lluvia = datos["hourly"]["precipitation"]
    radiacion = datos["hourly"]["shortwave_radiation"]  # W/m2, promedio de la hora anterior
    ruta_archivo = os.path.join(CARPETA, "clima_cu_horario.csv")
    with open(ruta_archivo, "w", newline="", encoding="utf-8") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(["fecha_hora", "temperatura_c", "lluvia_mm", "radiacion_w_m2"])
        for fila in zip(horas, temperatura, lluvia, radiacion):
            escritor.writerow(fila)
    print(f"    OK: {len(horas)} horas, de {horas[0]} a {horas[-1]}")
    return {"archivo": "clima_cu_horario.csv", "url": url, "horas": len(horas),
            "fuente": "Open-Meteo Historical Weather API (ERA5), CC BY 4.0"}


def main():
    os.makedirs(CARPETA, exist_ok=True)
    resumen = {"descargado": datetime.now().isoformat(timespec="seconds")}
    for nombre, funcion in (("osm", descargar_osm), ("metro", descargar_metro), ("clima", descargar_clima)):
        try:
            resumen[nombre] = funcion()
        except Exception as error:  # noqa: BLE001
            print(f"    ERROR en {nombre}: {error}")
            resumen[nombre] = {"error": str(error)}
    with open(os.path.join(CARPETA, "fuentes_descarga.json"), "w", encoding="utf-8") as archivo:
        json.dump(resumen, archivo, ensure_ascii=False, indent=2)
    errores = [k for k, v in resumen.items() if isinstance(v, dict) and "error" in v]
    print("\nListo." if not errores else f"\nTerminó con errores en: {', '.join(errores)}")
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
