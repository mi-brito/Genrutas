import { Node, OptimizationResult, Route, ParetoSolution, RouteStep, EnvironmentalImpact, CalculationConstants, DailySimulation } from '../types';

export const ROUTE_COLORS = ['#38BDF8', '#F97316', '#A855F7', '#EC4899', '#84CC16', '#EAB308'];

const formatTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const timeToSeconds = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 3600 + minutes * 60;
};

const addSecondsToTime = (baseTimeInSeconds: number, secondsToAdd: number): string => {
    const newTimeInSeconds = baseTimeInSeconds + secondsToAdd;
    return formatTime(newTimeInSeconds);
};


const calculateRouteSteps = (route: Omit<Route, 'steps' | 'co2_ahorrado_kg' | 'dailySteps'>, allNodes: Node[], startTime: string, serviceTimeMinutes: number): RouteStep[] => {
    const startTimeInSeconds = timeToSeconds(startTime);
    const serviceTimeSeconds = serviceTimeMinutes * 60;

    const numSegments = route.nodos.length > 1 ? route.nodos.length - 1 : 1;
    const travelTimePerSegment = route.tiempo > 0 ? route.tiempo / numSegments : 0;
    
    let currentTime = startTimeInSeconds;
    let cumulativeLoad = 0;
    const steps: RouteStep[] = [];

    route.nodos.forEach((nodeId, index) => {
        const nodeInfo = allNodes.find(n => n.id === nodeId);
        if (!nodeInfo) return;

        let arrivalTime = currentTime;
        
        if (index > 0) {
            currentTime += travelTimePerSegment;
            arrivalTime = currentTime;
        }

        const demandLoaded = nodeInfo.type === 'container' ? nodeInfo.demand : 0;
        cumulativeLoad += demandLoaded;

        let departureTime = arrivalTime;
        if (nodeInfo.type === 'container' || nodeInfo.type === 'charging_station' || index > 0) {
            let serviceDuration = 0;
            if (nodeInfo.type === 'container') {
                serviceDuration = serviceTimeSeconds;
            } else if (nodeInfo.type === 'charging_station') {
                serviceDuration = 15 * 60; // Assume 15 min charging
            }
            // For all nodes except the very first one at the depot, there's a departure after arrival.
            if (index < route.nodos.length - 1) {
                 departureTime = arrivalTime + serviceDuration;
                 currentTime = departureTime;
            }
        }
        
        steps.push({
            nodeId: nodeId,
            lat: nodeInfo.lat,
            lng: nodeInfo.lng,
            type: nodeInfo.type,
            arrivalTime: formatTime(arrivalTime),
            departureTime: formatTime(departureTime),
            demandLoaded: demandLoaded,
            cumulativeLoad: cumulativeLoad,
        });
    });
    
    return steps;
};

export const fetchRouteData = async (waypoints: Node[]): Promise<{ geometry: [number, number][]; distance: number; duration: number }> => {
    if (waypoints.length < 2) return { geometry: [], distance: 0, duration: 0 };
    const coordsString = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`OSRM request failed: ${response.statusText}`);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            return {
                geometry: route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]),
                distance: route.distance,
                duration: route.duration,
            };
        }
        throw new Error('No routes found in OSRM response');
    } catch (error) {
        console.error("OSRM fetch failed, using straight lines:", error);
        return {
            geometry: waypoints.map(wp => [wp.lat, wp.lng]),
            distance: 0,
            duration: 0,
        };
    }
};

// Compara el camión eléctrico contra uno a diésel recorriendo la misma distancia.
// Factores supuestos (revisar y citar fuente antes de presentarlos como dato):
// red eléctrica 0.35 kg CO2/kWh y diésel 2.31 kg CO2/L, heredados del prototipo.
export const construirImpacto = (distanciaKm: number, energiaKwh: number, consumoKwhKm: number): EnvironmentalImpact => {
    const constants: CalculationConstants = {
      consumo_ev_kwh_per_km: consumoKwhKm,
      consumo_fossil_l_per_km: 0.12,
      grid_emission_factor: 0.35,
      fuel_emission_factor: 2.31,
      precio_electricidad_mxn_per_kwh: 3.50,
      precio_combustible_mxn_per_l: 24.00,
    };
    const costo_energia_mxn = energiaKwh * constants.precio_electricidad_mxn_per_kwh;
    const co2_electrico_kg = energiaKwh * constants.grid_emission_factor;
    const litros_fosil = distanciaKm * constants.consumo_fossil_l_per_km;
    const costo_combustible_mxn = litros_fosil * constants.precio_combustible_mxn_per_l;
    const co2_fosil_kg = litros_fosil * constants.fuel_emission_factor;
    const r2 = (x: number) => parseFloat(x.toFixed(2));
    return {
        energia_total_kWh: r2(energiaKwh),
        costo_energia_mxn: r2(costo_energia_mxn),
        costo_combustible_mxn: r2(costo_combustible_mxn),
        co2_electrico_kg: r2(co2_electrico_kg),
        co2_fosil_kg: r2(co2_fosil_kg),
        co2_ahorrado_kg: r2(co2_fosil_kg - co2_electrico_kg),
        constants,
    };
};

export const generateDevelopmentData = async (
    nodes: Node[], 
    numberOfVehicles: number, 
    timeWindow: [string, string], 
    vehicleCapacity: number,
    startTime: string,
    serviceTime: number,
    vehicleAutonomy: number,
    vehicleConsumption: number
): Promise<OptimizationResult> => {
    console.warn(`Generando datos simulados dinámicos. Esto es un fallback ya que el backend no pudo ser alcanzado.`);

    const graficas = {
        progreso_optimizacion: "https://almacengraficas.blob.core.windows.net/resultados-optimizacion-53442/progreso_optimizacion.png",
        soluciones_finales: "https://almacengraficas.blob.core.windows.net/resultados-optimizacion-53442/soluciones_finales.png"
    };
    const coordenadas_puntos = nodes.reduce((acc, n) => ({ ...acc, [n.id]: [n.lat, n.lng] }), {});

    const depot = nodes.find(n => n.type === 'depot');
    const containers = nodes.filter(n => n.type === 'container');
    if (!depot || containers.length === 0) {
        return { id_ejecucion: 'MOCK-INCOMPLETE-SETUP', paretoFront: [], coordenadas_puntos, graficas };
    }

    const routeDefinitions = [];
    const containersPerVehicle = Math.ceil(containers.length / numberOfVehicles);
    for (let i = 0; i < numberOfVehicles; i++) {
        const assigned = containers.slice(i * containersPerVehicle, (i + 1) * containersPerVehicle);
        if (assigned.length > 0) {
            routeDefinitions.push({ vehiculoId: i + 1, color: ROUTE_COLORS[i % ROUTE_COLORS.length], nodes: [depot, ...assigned, depot] });
        }
    }

    const routePromises = routeDefinitions.map(async (def) => {
        const { geometry, distance, duration } = await fetchRouteData(def.nodes);
        const pasajerosTransportados = def.nodes.slice(1, -1).reduce((sum, n) => sum + n.demand, 0);
        const ocupacionPromedio = vehicleCapacity > 0 ? `${((pasajerosTransportados / (def.nodes.length-2)) / vehicleCapacity * 100).toFixed(1)}%` : '0.0%';
        const distancia_km = distance / 1000;
        const energia_ruta_kWh = distancia_km * vehicleConsumption;
        
        const basicRoute: Omit<Route, 'steps' | 'co2_ahorrado_kg' | 'dailySteps'> = {
            vehiculoId: def.vehiculoId,
            color: def.color,
            nodos: def.nodes.map(n => n.id),
            path: geometry,
            distancia: distance,
            tiempo: duration,
            pasajerosTransportados,
            ocupacionPromedio,
            energia_ruta_kWh: parseFloat(energia_ruta_kWh.toFixed(2)),
        };
        const steps = calculateRouteSteps(basicRoute, nodes, startTime, serviceTime);
        return { ...basicRoute, steps, co2_ahorrado_kg: 0 }; // co2 saved will be calculated in summary
    });

    const mockRoutes: Route[] = await Promise.all(routePromises);

    const total_distancia_km = mockRoutes.reduce((sum, r) => sum + r.distancia, 0) / 1000;
    const total_energia_kwh = mockRoutes.reduce((sum, r) => sum + r.energia_ruta_kWh, 0);
    const mockEnvironmentalImpact = construirImpacto(total_distancia_km, total_energia_kwh, vehicleConsumption);
    const co2_ahorrado_kg = mockEnvironmentalImpact.co2_ahorrado_kg;

    mockRoutes.forEach(route => {
      const distance_proportion = total_distancia_km > 0 ? (route.distancia / 1000) / total_distancia_km : 0;
      route.co2_ahorrado_kg = parseFloat((co2_ahorrado_kg * distance_proportion).toFixed(2));
    });

    const mockSolution: ParetoSolution = {
        id: 'sol-mock-dynamic-1', label: 'A',
        distancia: total_distancia_km * 1000,
        tiempo: mockRoutes.reduce((max, r) => Math.max(max, r.tiempo), 0),
        pasajeros_totales: containers.reduce((sum, c) => sum + c.demand, 0),
        routes_serializadas: mockRoutes,
        environmentalImpact: mockEnvironmentalImpact,
    };

    // --- Daily Simulation Calculation ---
    const totalOperatingSeconds = timeToSeconds(timeWindow[1]) - timeToSeconds(timeWindow[0]);
    const layover_min = 10;
    const layoverSeconds = layover_min * 60;
    const cycleTimeSeconds = mockSolution.tiempo + layoverSeconds;
    
    if (cycleTimeSeconds > 0 && totalOperatingSeconds > 0) {
        const repetitions = Math.max(1, Math.floor(totalOperatingSeconds / cycleTimeSeconds));

        const environmentalImpact_jornada: EnvironmentalImpact = {
            ...mockEnvironmentalImpact,
            energia_total_kWh: parseFloat((mockEnvironmentalImpact.energia_total_kWh * repetitions).toFixed(2)),
            costo_energia_mxn: parseFloat((mockEnvironmentalImpact.costo_energia_mxn * repetitions).toFixed(2)),
            costo_combustible_mxn: parseFloat((mockEnvironmentalImpact.costo_combustible_mxn * repetitions).toFixed(2)),
            co2_electrico_kg: parseFloat((mockEnvironmentalImpact.co2_electrico_kg * repetitions).toFixed(2)),
            co2_fosil_kg: parseFloat((mockEnvironmentalImpact.co2_fosil_kg * repetitions).toFixed(2)),
            co2_ahorrado_kg: parseFloat((mockEnvironmentalImpact.co2_ahorrado_kg * repetitions).toFixed(2)),
        };

        mockSolution.dailySimulation = {
            repetitions,
            layover_min,
            total_distancia_jornada_km: parseFloat(((mockSolution.distancia / 1000) * repetitions).toFixed(2)),
            total_pasajeros_jornada: mockSolution.pasajeros_totales * repetitions,
            environmentalImpact_jornada,
        };

        // --- Generate Full Day Itinerary (dailySteps) ---
        mockSolution.routes_serializadas.forEach(route => {
            const fullDayItinerary: RouteStep[] = [];
            for (let i = 0; i < repetitions; i++) {
                const timeOffsetSeconds = i * cycleTimeSeconds;
                route.steps.forEach(step => {
                    fullDayItinerary.push({
                        ...step,
                        arrivalTime: addSecondsToTime(timeToSeconds(step.arrivalTime), timeOffsetSeconds),
                        departureTime: addSecondsToTime(timeToSeconds(step.departureTime), timeOffsetSeconds),
                        cycleNumber: i + 1,
                    });
                });
            }
            route.dailySteps = fullDayItinerary;
        });
    }

    return {
        id_ejecucion: `MOCK-${new Date().getTime()}`,
        paretoFront: [mockSolution],
        coordenadas_puntos,
        graficas,
    };
};

// La llamada real al motor NSGA-II está en services/api.ts; este archivo es solo el respaldo simulado.
