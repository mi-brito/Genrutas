import { Node, OptimizationResult, ParetoSolution, Route, RouteStep } from '../types';
import { ROUTE_COLORS, construirImpacto, fetchRouteData, generateDevelopmentData } from './mockApi';

// URL del backend FastAPI (local: http://localhost:8080, o la de Cloud Run).
// Se define en frontend/.env.local como VITE_API_URL.
const API_URL: string = (((import.meta as any).env?.VITE_API_URL as string) ?? '').replace(/\/$/, '');

// Respuesta del backend (backend/main.py)
interface PasoBackend {
  nodeId: number | string;
  type?: 'depot' | 'container' | 'charging_station';
  energia_recargada_kWh?: number;
  arrivalTime: string;
  departureTime: string;
  cumulativeLoad: number;
}
interface RutaBackend {
  camionId: number;
  nodos: (number | string)[];
  steps: PasoBackend[];
  distancia_m: number;
  tiempo_s: number;
  energia_kwh?: number;
  recargas?: number;
  carga: number;
}
interface SolucionBackend {
  id: string;
  label: string;
  distancia: number;
  tiempo: number;
  carga_total: number;
  routes: RutaBackend[];
}
interface RespuestaBackend {
  ejemplarId: string;
  fuenteMatriz: string;
  aviso: string | null;
  paretoFront: SolucionBackend[];
  graficas: { progreso_optimizacion: string; soluciones_finales: string };
}

// Geometría de calles (OSRM) solo para dibujar; se guarda para no repetir consultas.
const cacheGeometria = new Map<string, [number, number][]>();
const geometriaRuta = async (puntos: Node[]): Promise<[number, number][]> => {
  const clave = puntos.map(p => p.id).join('-');
  const guardada = cacheGeometria.get(clave);
  if (guardada) return guardada;
  const { geometry } = await fetchRouteData(puntos);
  const resultado = geometry.length > 0 ? geometry : puntos.map(p => [p.lat, p.lng] as [number, number]);
  cacheGeometria.set(clave, resultado);
  return resultado;
};

const adaptarRespuesta = async (
  data: RespuestaBackend,
  nodes: Node[],
  vehicleCapacity: number,
  vehicleAutonomy: number,
  vehicleConsumption: number,
): Promise<OptimizationResult> => {
  const porId = new Map(nodes.map(n => [n.id, n]));
  const paretoFront: ParetoSolution[] = [];

  for (const sol of data.paretoFront) {
    const rutas: Route[] = [];
    for (const [idx, r] of sol.routes.entries()) {
      const ids = r.nodos.map(Number);
      const puntos = ids.map(id => porId.get(id)).filter((n): n is Node => Boolean(n));
      // El backend simula la batería (consumo según carga y recargas); si no viene, se estima.
      const energia = r.energia_kwh ?? (r.distancia_m / 1000) * vehicleConsumption;
      const steps: RouteStep[] = r.steps.map((s, k) => {
        const nodo = porId.get(Number(s.nodeId));
        return {
          nodeId: Number(s.nodeId),
          lat: nodo?.lat ?? 0,
          lng: nodo?.lng ?? 0,
          type: s.type ?? nodo?.type ?? 'container',
          arrivalTime: s.arrivalTime,
          departureTime: s.departureTime,
          demandLoaded: k > 0 && nodo?.type === 'container' ? nodo.demand : 0,
          cumulativeLoad: s.cumulativeLoad,
          energia_recargada_kWh: s.energia_recargada_kWh,
        };
      });
      rutas.push({
        vehiculoId: r.camionId,
        color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
        nodos: ids,
        path: await geometriaRuta(puntos),
        distancia: r.distancia_m,
        tiempo: r.tiempo_s,
        pasajerosTransportados: r.carga,
        ocupacionPromedio: `${vehicleCapacity > 0 ? ((r.carga / vehicleCapacity) * 100).toFixed(1) : '0.0'}%`,
        energia_ruta_kWh: parseFloat(energia.toFixed(2)),
        co2_ahorrado_kg: 0,
        steps,
      });
    }

    const distanciaKm = sol.distancia / 1000;
    const energiaTotal = rutas.reduce((suma, r) => suma + r.energia_ruta_kWh, 0);
    const impacto = construirImpacto(distanciaKm, energiaTotal, vehicleConsumption);
    rutas.forEach(r => {
      const proporcion = distanciaKm > 0 ? r.distancia / 1000 / distanciaKm : 0;
      r.co2_ahorrado_kg = parseFloat((impacto.co2_ahorrado_kg * proporcion).toFixed(2));
    });

    paretoFront.push({
      id: sol.id,
      label: sol.label,
      distancia: sol.distancia,
      tiempo: sol.tiempo,
      pasajeros_totales: sol.carga_total,
      routes_serializadas: rutas,
      environmentalImpact: impacto,
    });
  }

  const avisos: string[] = [];
  if (data.aviso) avisos.push(data.aviso);
  if (data.fuenteMatriz === 'haversine') {
    avisos.push('Distancias estimadas en línea recta con factor urbano (sin Mapbox).');
  }
  const recargas = data.paretoFront[0]?.routes.reduce((suma, r) => suma + (r.recargas ?? 0), 0) ?? 0;
  if (recargas > 0) {
    avisos.push(`La solución A incluye ${recargas} recarga(s) en ruta con batería de ${vehicleAutonomy} kWh.`);
  }

  return {
    id_ejecucion: data.ejemplarId,
    paretoFront,
    coordenadas_puntos: nodes.reduce((acc, n) => ({ ...acc, [n.id]: [n.lat, n.lng] }), {}),
    graficas: data.graficas,
    fuente: 'motor',
    aviso: avisos.length > 0 ? avisos.join(' ') : null,
  };
};

export const optimizeRoutes = async (
  nodes: Node[],
  vehicleCapacity: number,
  timeWindow: [string, string],
  numberOfVehicles: number,
  startTime: string,
  serviceTime: number,
  vehicleAutonomy: number,
  vehicleConsumption: number,
): Promise<OptimizationResult> => {
  const simulado = async (motivo: string): Promise<OptimizationResult> => {
    const r = await generateDevelopmentData(
      nodes, numberOfVehicles, timeWindow, vehicleCapacity, startTime, serviceTime, vehicleAutonomy, vehicleConsumption,
    );
    return { ...r, fuente: 'simulado', aviso: `${motivo} Se muestra un reparto secuencial simulado, no el NSGA-II.` };
  };

  if (!API_URL) {
    return simulado('No hay VITE_API_URL configurada.');
  }

  try {
    const respuesta = await fetch(`${API_URL}/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: nodes.map(n => ({ id: n.id, lat: n.lat, lng: n.lng, demand: n.demand, type: n.type })),
        vehicleCapacity,
        timeWindow,
        numberOfVehicles,
        startTime,
        serviceTime,
        vehicleAutonomy,
        vehicleConsumption,
      }),
    });
    if (!respuesta.ok) {
      throw new Error(`HTTP ${respuesta.status}: ${await respuesta.text()}`);
    }
    const data = (await respuesta.json()) as RespuestaBackend;
    return await adaptarRespuesta(data, nodes, vehicleCapacity, vehicleAutonomy, vehicleConsumption);
  } catch (error) {
    console.error('No se pudo usar el motor NSGA-II:', error);
    return simulado(`No se pudo conectar con el motor NSGA-II (${(error as Error).message}).`);
  }
};
