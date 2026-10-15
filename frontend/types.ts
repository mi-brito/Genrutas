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
  co2_ahorrado_kg: number;
  steps: RouteStep[]; // Detailed step-by-step itinerary for a single cycle
  dailySteps?: RouteStep[]; // Full-day expanded itinerary
}

export interface CalculationConstants {
  consumo_ev_kwh_per_km: number;
  consumo_fossil_l_per_km: number;
  grid_emission_factor: number;
  fuel_emission_factor: number;
  precio_electricidad_mxn_per_kwh: number;
  precio_combustible_mxn_per_l: number;
}


export interface EnvironmentalImpact {
  energia_total_kWh: number;
  costo_energia_mxn: number;
  costo_combustible_mxn: number;
  co2_electrico_kg: number;
  co2_fosil_kg: number;
  co2_ahorrado_kg: number;
  constants: CalculationConstants;
}

export interface DailySimulation {
  repetitions: number;
  layover_min: number;
  total_distancia_jornada_km: number;
  total_pasajeros_jornada: number;
  environmentalImpact_jornada: EnvironmentalImpact;
}

export interface ParetoSolution {
  id: string;
  label: string;
  distancia: number; // Per cycle
  pasajeros_totales: number; // Per cycle
  tiempo: number; // Per cycle
  routes_serializadas: Route[];
  environmentalImpact: EnvironmentalImpact; // Per cycle
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
  // 'motor' = respuesta del NSGA-II; 'simulado' = respaldo sin backend.
  fuente?: 'motor' | 'simulado';
  aviso?: string | null;
}