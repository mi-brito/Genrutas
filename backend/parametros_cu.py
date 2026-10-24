"""
Parámetros con fuente para el escenario del Pumabús en Ciudad Universitaria (CU, UNAM)
y cálculo de impacto: diésel actual, eléctrico con la red y eléctrico con carga solar.

Niveles de confianza:
  oficial    dato publicado por una dependencia (UNAM, CRE, SEMARNAT, INECC, CNE/PROFECO)
  academico  estudio o tesis con metodología publicada
  proxy      dato de otra flota (Metrobús CDMX) o derivado por nosotros; cambiarlo por el
             dato real del Pumabús cuando la UNAM lo publique o lo entregue por transparencia
"""

FUENTES = {
    "memoria_unam_2024": ("Memoria UNAM 2024, Dirección General de Servicios Generales y Movilidad",
                          "https://www.planeacion.unam.mx/Memoria/2024/PDF/15.3-DGSGM.pdf"),
    "icct_2022": ("ICCT (2022), Estrategia de despliegue de flota eléctrica, Metrobús Líneas 3 y 4",
                  "https://theicct.org/wp-content/uploads/2022/03/hdv-latam-estrategia-despliegue-flota-electrica-sistema-corredores-transporte-publico-ciudad-mexico-metrobus-lineas-3-y-4.pdf"),
    "icct_dic_2022": ("ICCT (dic. 2022), Análisis de desempeño de buses eléctricos en CDMX",
                      "https://theicct.org/publication/mexico-hvs-zebra-analisis-desempeno-buses-electricos-cdmx-dec22/"),
    "inegycei": ("INECC, INEGYCEI, Anexo E Energía: factor de emisión del diésel",
                 "https://www.snieg.mx/DocAcervoINN/documentacion/inf_nvo_acervo/snigma/Inv_Nal_Gas_Comp_Efect_Inver/NIR_Anexo_E_Energia_EML_4a_lect_21ago18.pdf"),
    "fe_sen_2024": ("CRE/SEMARNAT, Aviso del factor de emisión del Sistema Eléctrico Nacional 2024",
                    "https://www.gob.mx/cms/uploads/attachment/file/981194/aviso_fesen_2024.pdf"),
    "diesel_oct_2026": ("Precio promedio del diésel en CDMX, 11-oct-2026 (CNE/PROFECO vía Infobae)",
                        "https://www.infobae.com/mexico/2026/10/12/precio-de-la-gasolina-en-ciudad-de-mexico-este-11-de-octubre/"),
    "tesis_cifuentes_2016": ("Cifuentes Martínez (2016), tesis de maestría, Instituto de Ingeniería UNAM",
                             "https://tesiunamdocumentos.dgb.unam.mx/ptd2016/septiembre/0750613/0750613.pdf"),
    "fundacion_unam": ("Fundación UNAM, Pumabús estrena 25 unidades",
                       "https://www.fundacionunam.org.mx/vanguardia-unam/pumabus-estrena-25-unidades/"),
    "pvwatts": ("NREL PVWatts, pérdidas del sistema por defecto (14 %)",
                "https://pvwatts.nrel.gov/"),
    "open_meteo": ("Open-Meteo Historical Weather API (reanálisis ERA5), radiación horaria en CU",
                   "https://open-meteo.com/en/docs/historical-weather-api"),
}


def _p(valor, unidad, fuente, nivel, nota=""):
    return {"valor": valor, "unidad": unidad, "fuente": fuente, "nivel": nivel, "nota": nota}


PARAMETROS = {
    # --- Operación del Pumabús ---
    "flota_unidades": _p(60, "unidades", "memoria_unam_2024", "oficial", "Más 2 camionetas para personas con discapacidad."),
    "rutas": _p(13, "rutas", "memoria_unam_2024", "oficial"),
    "km_anuales": _p(2_500_000, "km/año", "memoria_unam_2024", "oficial", "La fuente dice 'aproximadamente'."),
    "usuarios_anuales": _p(27_300_000, "usuarios/año", "memoria_unam_2024", "oficial", "La fuente dice 'aproximadamente'."),
    "capacidad_pasajeros": _p(85, "pasajeros", "fundacion_unam", "oficial", "Unidades Volkswagen de 11 m."),
    "velocidad_kmh": _p(15.0, "km/h", "tesis_cifuentes_2016", "academico", "Mediana medida con GPS en 2014 (rango 7–20)."),

    # --- Autobús eléctrico (proxies del Metrobús CDMX) ---
    "consumo_ev_kwh_km": _p(1.0, "kWh/km", "icct_dic_2022", "proxy",
                            "Metrobús: 0.92 kWh/km vacío y 1.23 al 105 % de carga (18 m); 1.2 preliminar (12 m). Rango de prueba 0.9–1.2."),
    "bateria_kwh": _p(330, "kWh", "icct_2022", "proxy", "Volvo 7900 eléctrico de 12 m, Línea 4 del Metrobús."),
    "potencia_cargador_kw": _p(150, "kW", "icct_2022", "proxy", "Cargadores del patio de la Línea 3 del Metrobús."),
    "reserva_bateria": _p(0.20, "fracción", "icct_2022", "proxy", "Estado de carga mínimo de operación."),

    # --- Autobús diésel ---
    "consumo_diesel_l_km": _p(0.50, "L/km", "icct_2022", "proxy",
                              "Metrobús 12 m: 0.59 L/km; ajustado a unidad de 11 m. Rango 0.45–0.60. No hay dato publicado del Pumabús."),
    "fe_diesel_kg_l": _p(2.596, "kg CO₂/L", "inegycei", "oficial"),
    "precio_diesel_mxn_l": _p(26.97, "MXN/L", "diesel_oct_2026", "oficial", "Precio al público; tope voluntario de 27 MXN/L."),
    "nox_g_km": _p(5.86, "g NOx/km", "icct_2022", "academico", "Autobús 12 m Euro V (HBEFA)."),
    "pm25_g_km": _p(0.08, "g PM2.5/km", "icct_2022", "academico", "Autobús 12 m Euro V (HBEFA)."),

    # --- Red eléctrica y costos ---
    "fe_red_kg_kwh": _p(0.444, "kg CO₂e/kWh", "fe_sen_2024", "oficial",
                        "SEMARNAT indica usar el factor 2024 para reportes de 2026 (el de 2025 sigue en proceso)."),
    "tarifa_noche_mxn_kwh": _p(2.86, "MXN/kWh", "icct_2022", "proxy",
                               "Costo efectivo GDMTH con cargos de capacidad y distribución, carga nocturna: 2.57 MXN/km ÷ 0.9 kWh/km (tarifas 2021)."),
    "tarifa_dia_mxn_kwh": _p(3.71, "MXN/kWh", "icct_2022", "proxy",
                             "Igual que arriba, carga diurna: 3.34 MXN/km ÷ 0.9 kWh/km."),
    "mant_diesel_mxn_km": _p(3.4, "MXN/km", "icct_2022", "proxy", "Contratos del Metrobús, autobús de 12 m."),
    "mant_ev_mxn_km": _p(2.4, "MXN/km", "icct_2022", "proxy", "Contratos del Metrobús, autobús de 12 m."),

    # --- Energía solar ---
    "rendimiento_fv": _p(0.80, "fracción", "pvwatts", "proxy",
                         "14 % de pérdidas del sistema (PVWatts) más ~6 % por temperatura (estimación)."),
    "m2_por_kwp": _p(4.5, "m²/kWp", "pvwatts", "proxy", "Módulos de ~450 W y ~2 m² (estimación)."),
    "horas_sol_pico": _p(None, "kWh/m²/día", "open_meteo", "academico",
                         "Se calcula con la radiación horaria descargada para CU."),
}


def valor(clave):
    return PARAMETROS[clave]["valor"]


def tabla_parametros():
    """Lista para mostrar en la app: parámetro, valor, fuente, URL y nivel."""
    filas = []
    for clave, p in PARAMETROS.items():
        titulo, url = FUENTES[p["fuente"]]
        filas.append({"clave": clave, "valor": p["valor"], "unidad": p["unidad"], "nivel": p["nivel"],
                      "nota": p["nota"], "fuente": titulo, "url": url})
    return filas


def impacto_escenarios(km, kwh, fraccion_solar=1.0, carga="noche"):
    """
    Compara la misma operación (km) en tres escenarios:
      diesel           la flota actual
      electrico_red    autobús eléctrico cargado con la red de CFE
      electrico_solar  autobús eléctrico con una fracción de la energía cargada con paneles
                       al mediodía (el resto, de la red)
    kwh es la energía que calculó el simulador de batería para esa operación.
    El costo solar no incluye la inversión en paneles: se reporta aparte el tamaño necesario.
    """
    fraccion_solar = min(max(fraccion_solar, 0.0), 1.0)
    tarifa = valor("tarifa_noche_mxn_kwh") if carga == "noche" else valor("tarifa_dia_mxn_kwh")

    litros = km * valor("consumo_diesel_l_km")
    diesel = {
        "litros": litros,
        "kwh": 0.0,
        "costo_energia_mxn": litros * valor("precio_diesel_mxn_l"),
        "costo_mant_mxn": km * valor("mant_diesel_mxn_km"),
        "co2_kg": litros * valor("fe_diesel_kg_l"),
        "nox_g": km * valor("nox_g_km"),
        "pm25_g": km * valor("pm25_g_km"),
    }

    def electrico(fraccion):
        kwh_red = kwh * (1 - fraccion)
        return {
            "litros": 0.0,
            "kwh": kwh,
            "kwh_solar": kwh * fraccion,
            "costo_energia_mxn": kwh_red * tarifa,
            "costo_mant_mxn": km * valor("mant_ev_mxn_km"),
            "co2_kg": kwh_red * valor("fe_red_kg_kwh"),
            "nox_g": 0.0,
            "pm25_g": 0.0,
        }

    escenarios = {"diesel": diesel, "electrico_red": electrico(0.0), "electrico_solar": electrico(fraccion_solar)}
    for e in escenarios.values():
        e["costo_total_mxn"] = e["costo_energia_mxn"] + e["costo_mant_mxn"]
        for k, v in list(e.items()):
            e[k] = round(v, 2)
    return {
        "km": round(km, 2),
        "fraccion_solar": fraccion_solar,
        "carga": carga,
        "escenarios": escenarios,
        "ahorro_vs_diesel": {
            nombre: {
                "costo_mxn": round(diesel["costo_total_mxn"] - escenarios[nombre]["costo_total_mxn"], 2),
                "co2_kg": round(diesel["co2_kg"] - escenarios[nombre]["co2_kg"], 2),
                "co2_pct": round(100 * (1 - escenarios[nombre]["co2_kg"] / diesel["co2_kg"]), 1) if diesel["co2_kg"] else 0.0,
            }
            for nombre in ("electrico_red", "electrico_solar")
        },
    }


def dimensionar_solar(kwh_dia, horas_sol_pico):
    """Paneles necesarios para cargar kwh_dia con sol: kWp y m² aproximados."""
    if not horas_sol_pico:
        return None
    kwp = kwh_dia / (horas_sol_pico * valor("rendimiento_fv"))
    return {"kwh_dia": round(kwh_dia, 1), "horas_sol_pico": round(horas_sol_pico, 2),
            "kwp": round(kwp, 1), "m2": round(kwp * valor("m2_por_kwp"))}
