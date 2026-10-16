import { Impacto, Parametro } from '../types';

// Escenario real de Ciudad Universitaria (backend: /cu/*).
const API_URL: string = (((import.meta as any).env?.VITE_API_URL as string) ?? '').replace(/\/$/, '');

export interface RutaActual {
  ruta: number;
  nombre: string;
  color: string;
  base: string | null;
  paradas: { nombre: string; lat: number; lng: number }[];
  trazo: [number, number][];
  longitud_km: number;
}

export interface Paradero {
  id: number;
  nombre: string;
  lat: number;
  lng: number;
  rutas: number[];
  base: string | null;
  peso: number;
  facultades: string[];
}

export interface MetricasModelo {
  variables: string[];
  prueba_desde: string;
  prueba_hasta: string;
  dias_entrenamiento: number;
  dias_prueba: number;
  modelo: { mae: number; mape_pct: number };
  referencia_semana_anterior: { mae: number; mape_pct: number };
  referencia_promedio_dia_semana: { mae: number; mape_pct: number };
}

export interface EscenarioCU {
  rutas: RutaActual[];
  paraderos: Paradero[];
  bases: string[];
  modelo: MetricasModelo;
  datos_hasta: string;
  horas_sol_pico: number | null;
}

export interface OperacionHora {
  recorridos: number;
  km: number;
  pasajeros_por_recorrido: number | null;
  ocupacion_pct: number | null;
  unidades_en_servicio: number;
  unidades_libres: number;
}

export interface ResumenOperacion {
  recorridos: number;
  km: number;
  kwh: number;
  kwh_solar: number;
  fraccion_solar: number;
  ocupacion_pico_pct: number;
  ocupacion_valle_pct: number;
  unidades_pico: number;
  unidades_libres_valle: number;
  impacto: Impacto;
}

export interface PlanDia {
  fecha: string;
  periodo: 'clases' | 'examenes' | 'vacaciones';
  semana_semestre: number;
  festivo: boolean;
  pasajeros_dia: number;
  kwp_solar: number;
  horas: { hora: number; demanda: number; base: OperacionHora; genrutas: OperacionHora; solar_kwh: number }[];
  resumen: { base: ResumenOperacion; genrutas: ResumenOperacion };
  modelo: MetricasModelo;
  supuestos: string[];
}

export interface RutaNueva {
  id: number;
  nodos: number[];
  paradas: string[];
  trazo: [number, number][];
  carga: number;
  distancia_m: number;
  tiempo_s: number;
  energia_kwh: number;
  recargas: unknown[] | number;
  reparada: boolean;
}

export interface ViajeDirecto {
  paradero: number;
  nombre: string;
  viajes: number;
  km: number;
  kwh: number;
  minutos: number;
  trazo: [number, number][];
}

export interface OperacionComparada {
  recorridos_hora: number;
  km_hora: number;
  kwh_hora: number;
  unidades: number;
  espera_prom_min: number | null;
  pasajeros_por_km: number | null;
  kwh_por_pasajero: number | null;
  impacto: Impacto;
}

export interface DisenoCU {
  fecha: string;
  hora: number;
  base: string;
  periodo: string;
  pasajeros_dia: number;
  demanda_hora: number;
  participacion_base: number;
  pasajeros_oleada: number;
  punto_base: [number, number];
  paradas: { id: number; nombre: string; lat: number; lng: number; peso: number; pasajeros_oleada: number; directos: number; resto: number; facultades: string[] }[];
  genrutas: OperacionComparada & {
    oleada_min: number;
    directos: ViajeDirecto[];
    rutas_nsga2: RutaNueva[];
    rutas_reparadas: number;
  };
  actual: OperacionComparada & {
    rutas: { ruta: number; recorridos_hora: number; longitud_km: number; color: string; trazo: [number, number][]; paradas: string[] }[];
  };
  motor: { aviso: string | null; fuenteMatriz: string; graficas: { progreso_optimizacion: string; soluciones_finales: string }; soluciones_frente: number } | null;
  supuestos: string[];
}

const obtener = async <T,>(ruta: string, parametros: Record<string, string | number> = {}): Promise<T> => {
  if (!API_URL) throw new Error('Falta VITE_API_URL en frontend/.env.local');
  const query = new URLSearchParams(Object.entries(parametros).map(([k, v]) => [k, String(v)])).toString();
  const respuesta = await fetch(`${API_URL}${ruta}${query ? `?${query}` : ''}`);
  if (!respuesta.ok) {
    let detalle = respuesta.statusText;
    try { detalle = (await respuesta.json()).detail ?? detalle; } catch { /* sin cuerpo JSON */ }
    throw new Error(detalle);
  }
  return respuesta.json() as Promise<T>;
};

export const cargarEscenarioCU = () => obtener<EscenarioCU>('/cu/escenario');
export const planDia = (fecha: string, kwpSolar: number) => obtener<PlanDia>('/cu/dia', { fecha, kwp_solar: kwpSolar });
export const disenarRutas = (fecha: string, hora: number, base: string, oleadaMin: number, fraccionSolar: number) =>
  obtener<DisenoCU>('/cu/disenar', { fecha, hora, base, oleada_min: oleadaMin, fraccion_solar: fraccionSolar });
export const cargarParametros = async () => (await obtener<{ parametros: Parametro[] }>('/parametros')).parametros;
