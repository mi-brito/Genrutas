export interface Node {
  id: number;
  lat: number;
  lng: number;
  demand: number; // Represents people for containers, 0 for others
  type: 'depot' | 'container' | 'charging_station';
}

export interface RouteStep {
  nodeId: number;
  lat: number;
  lng: number;
  type: 'depot' | 'container' | 'charging_station';
  arrivalTime: string;
  departureTime: string;
  demandLoaded: number; // People picked up
  cumulativeLoad: number; // People on board
  energia_recargada_kWh?: number;
  cycleNumber?: number; // Added to identify the cycle in a full-day itinerary
}


export interface Route {
  vehiculoId: number;
  color: string;
  nodos: number[]; // Array of node IDs in order of visit
  path: [number, number][]; // The actual geometry for drawing on the map
  distancia: number; // The authoritative distance for this route in meters
  tiempo: number; // The authoritative time for this route in seconds
  pasajerosTransportados: number; // The total passengers transported by this vehicle
  ocupacionPromedio: string; // The average percentage of the vehicle's capacity that was used
  energia_ruta_kWh: number;
  recargas?: number;
  steps: RouteStep[]; // Detailed step-by-step itinerary for a single cycle
  dailySteps?: RouteStep[]; // Full-day expanded itinerary
}

// Impacto calculado por el backend (backend/parametros_cu.py) con parámetros citados.
export interface EscenarioImpacto {
  litros: number;
  kwh: number;
  kwh_solar?: number;
  costo_energia_mxn: number;
  costo_mant_mxn: number;
  costo_total_mxn: number;
  co2_kg: number;
  nox_g: number;
  pm25_g: number;
}

export interface Ahorro {
  costo_mxn: number;
  co2_kg: number;
  co2_pct: number;
}

export interface Impacto {
  km: number;
  fraccion_solar: number;
  carga: 'noche' | 'dia';
  escenarios: {
    diesel: EscenarioImpacto;
    electrico_red: EscenarioImpacto;
    electrico_solar: EscenarioImpacto;
  };
  ahorro_vs_diesel: {
    electrico_red: Ahorro;
    electrico_solar: Ahorro;
  };
}

export interface Parametro {
  clave: string;
  valor: number | null;
  unidad: string;
  nivel: 'oficial' | 'academico' | 'proxy';
  nota: string;
  fuente: string;
  url: string;
}

export interface DailySimulation {
  repetitions: number;
  layover_min: number;
  total_distancia_jornada_km: number;
  total_pasajeros_jornada: number;
}

export interface ParetoSolution {
  id: string;
  label: string;
  distancia: number; // Per cycle
  pasajeros_totales: number; // Per cycle
  tiempo: number; // Per cycle
  routes_serializadas: Route[];
  impacto?: Impacto; // Solo cuando responde el motor
  dailySimulation?: DailySimulation;
}

export interface Graficas {
  progreso_optimizacion: string;
  soluciones_finales: string;
}

export interface OptimizationResult {
  id_ejecucion: string;
  paretoFront: ParetoSolution[];
  coordenadas_puntos: { [key: number]: [number, number] };
  graficas: Graficas;
  parametros?: Parametro[];
  // 'motor' = respuesta del NSGA-II; 'simulado' = respaldo sin backend.
  fuente?: 'motor' | 'simulado';
  aviso?: string | null;
}
// Capa del mapa para el escenario real de CU.
export interface LineaMapa {
  id: string;
  color: string;
  trazo: [number, number][];
  etiqueta: string;
}

export interface CapaMapaCU {
  rutasActuales: LineaMapa[];
  rutasNuevas: LineaMapa[];
  paraderos: { lat: number; lng: number; nombre: string; valor: number; etiqueta: string }[];
  base?: { lat: number; lng: number; nombre: string };
}
