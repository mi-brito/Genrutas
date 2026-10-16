import React, { useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { OptimizationResult, ParetoSolution, RouteStep } from '../types';
import AlgorithmInsights from './AlgorithmInsights';
import EnvironmentalImpact from './EnvironmentalImpact';
import { TableIcon, SparklesIcon } from './icons';
import SmartAssistant from './SmartAssistant';


interface ResultsDisplayProps {
  result: OptimizationResult;
  selectedSolution: ParetoSolution | null;
  onSelectSolution: (solution: ParetoSolution) => void;
  onReset: () => void;
  onHighlightRoute: (routeId: number | null) => void;
  onSaveScenario: () => void;
  onLoadScenarioClick: () => void;
}

declare global {
  interface Window {
    html2canvas: any;
  }
}

type ResultTab = 'routes' | 'environment' | 'assistant';

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ 
  result, selectedSolution, onSelectSolution, onReset, onHighlightRoute,
  onSaveScenario, onLoadScenarioClick 
}) => {
  const [showInsights, setShowInsights] = useState(false);
  const [expandedRouteId, setExpandedRouteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>('routes');

  const chartData = result.paretoFront.map(s => ({
    ...s,
    x: s.tiempo,
    y: s.distancia,
    z: s.pasajeros_totales,
  }));
    
  const handleSaveMapImage = () => {
    const mapElement = document.getElementById('map');
    if (mapElement && window.html2canvas) {
        window.html2canvas(mapElement, {
            useCORS: true,
            logging: false,
        }).then((canvas: any) => {
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
            link.download = `optirutas-mapa-${timestamp}.png`;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }).catch((err: any) => {
            console.error("Falló al capturar la imagen del mapa:", err);
            alert("Lo sentimos, hubo un error al capturar la imagen del mapa.");
        });
    } else {
        alert("No se pudo encontrar el elemento del mapa o la librería de captura de imágenes.");
    }
  };

  const handleExportCSV = () => {
    if (!selectedSolution) return;

    const headers = [
      'ID_Solucion', 'Etiqueta_Solucion', 'ID_Vehiculo', 'Num_Ciclo', 'Num_Parada_en_Ciclo', 
      'ID_Ubicacion', 'Tipo_Ubicacion', 'Hora_Llegada', 'Hora_Salida', 
      'Pasajeros_al_Llegar', 'Pasajeros_Recogidos', 'Pasajeros_al_Salir', 
      'Latitud', 'Longitud'
    ].join(',');
    
    const rows = selectedSolution.routes_serializadas.flatMap(route => {
        const stepsToExport = route.dailySteps && route.dailySteps.length > 0 ? route.dailySteps : route.steps;
        
        let stopCounter = 1;
        let currentCycle = 1;

        return stepsToExport.map((step) => {
            if(step.cycleNumber && step.cycleNumber !== currentCycle) {
                currentCycle = step.cycleNumber;
                stopCounter = 1;
            }
            
            const loadOnArrival = step.cumulativeLoad - step.demandLoaded;
            const rowData = [
              selectedSolution.id,
              selectedSolution.label,
              route.vehiculoId,
              step.cycleNumber ?? 1,
              stopCounter++,
              `${step.type.charAt(0).toUpperCase() + step.type.slice(1)} ${step.nodeId}`,
              step.type,
              step.arrivalTime,
              step.departureTime,
              loadOnArrival,
              step.demandLoaded,
              step.cumulativeLoad,
              step.lat,
              step.lng
            ];
            return rowData.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        });
    }).join('\n');

    const csvContent = `${headers}\n${rows}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    link.download = `optirutas-itinerario-${timestamp}.csv`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const ItineraryTable = ({ steps }: { steps: RouteStep[] }) => (
    <div className="overflow-x-auto text-xs bg-white rounded">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {steps[0]?.cycleNumber && <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Ciclo</th>}
            <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Parada</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Llegada</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Salida</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Pasajeros</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {steps.map((step, index) => (
            <tr key={index}>
              {step.cycleNumber && <td className="px-3 py-2 whitespace-nowrap text-gray-500">{step.cycleNumber}</td>}
              <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{step.type === 'depot' ? 'Base' : (step.type === 'container' ? `Punto ${step.nodeId}` : `Cargador ${step.nodeId}`)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{step.arrivalTime}</td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{step.departureTime}</td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{step.cumulativeLoad}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-start mb-2">
        <h2 className="text-xl font-bold text-text-main">Resultados de Optimización</h2>
        <div className="flex space-x-2 flex-shrink-0">
          <button onClick={onSaveScenario} className="py-1 px-3 border border-secondary text-secondary rounded-md shadow-sm text-xs font-medium hover:bg-gray-100">Guardar</button>
          <button onClick={onLoadScenarioClick} className="py-1 px-3 border border-secondary text-secondary rounded-md shadow-sm text-xs font-medium hover:bg-gray-100">Cargar</button>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-md font-semibold text-text-light mb-1">Frente de Pareto: Soluciones Óptimas</h3>
        <p className="text-xs text-gray-500 mb-2">Cada punto es una solución. Haz clic para explorar sus rutas. El punto rojo está seleccionado.</p>
        <ResponsiveContainer width="100%" height={180}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="x" name="Tiempo" unit="s" domain={['dataMin', 'dataMax']} tickFormatter={(tick) => `${Math.round(tick / 60)}m`} />
            <YAxis type="number" dataKey="y" name="Distancia" unit="m" domain={['dataMin', 'dataMax']} tickFormatter={(tick) => `${(tick / 1000).toFixed(1)}km`} />
            <ZAxis type="number" dataKey="z" name="Pasajeros" unit="" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value: number, name: string) => {
              if (name === 'Tiempo') return [`${Math.round(value / 60)} min`, 'Tiempo'];
              if (name === 'Distancia') return [`${(value / 1000).toFixed(2)} km`, 'Distancia'];
              return [value, 'Pasajeros'];
            }} />
            <Scatter name="Soluciones" data={chartData} fill="#A8A29E" onClick={(data) => onSelectSolution(data.payload as ParetoSolution)} style={{ cursor: 'pointer' }} />
            {selectedSolution && <Scatter name="Seleccionada" data={[{ ...selectedSolution, x: selectedSolution.tiempo, y: selectedSolution.distancia, z: selectedSolution.pasajeros_totales }]} fill="#EF4444" />}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4" aria-label="Tabs">
          <button onClick={() => setActiveTab('routes')} className={`${activeTab === 'routes' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
            Rutas e Itinerarios
          </button>
          <button onClick={() => setActiveTab('environment')} className={`${activeTab === 'environment' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
            Impacto Ambiental
          </button>
           <button onClick={() => setActiveTab('assistant')} className={`${activeTab === 'assistant' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center`}>
            <SparklesIcon className="h-4 w-4 mr-1"/> Asistente IA
          </button>
        </nav>
      </div>

      <div className="flex-grow overflow-y-auto py-4 pr-2">
        {activeTab === 'routes' && selectedSolution && (
          <div className="space-y-3">
            {selectedSolution.dailySimulation && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
                <p>Simulación de jornada completa ({selectedSolution.dailySimulation.repetitions} ciclos) con {selectedSolution.dailySimulation.layover_min} min de descanso. <strong>Distancia total: {selectedSolution.dailySimulation.total_distancia_jornada_km} km.</strong></p>
              </div>
            )}
            {selectedSolution.routes_serializadas.map(route => (
              <div key={route.vehiculoId} className="border rounded-md bg-white shadow-sm" onMouseEnter={() => onHighlightRoute(route.vehiculoId)} onMouseLeave={() => onHighlightRoute(null)}>
                <button onClick={() => setExpandedRouteId(expandedRouteId === route.vehiculoId ? null : route.vehiculoId)} className="w-full text-left p-3 hover:bg-gray-50 flex justify-between items-center transition-colors">
                  <div className="flex items-center">
                    <span className="w-4 h-4 rounded-full mr-3" style={{ backgroundColor: route.color }}></span>
                    <span className="font-semibold text-text-main">Unidad {route.vehiculoId}</span>
                  </div>
                  <div className="text-xs text-text-light text-right">
                    <span>{(route.distancia / 1000).toFixed(2)} km</span> | <span>{route.pasajerosTransportados} pax</span> | <span>{Math.round(route.tiempo / 60)} min</span>
                  </div>
                </button>
                {expandedRouteId === route.vehiculoId && (
                  <div className="p-3 border-t bg-gray-50 animate-fade-in">
                    <ItineraryTable steps={route.dailySteps && route.dailySteps.length > 0 ? route.dailySteps : route.steps} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {activeTab === 'environment' && selectedSolution && (
            <EnvironmentalImpact impacto={selectedSolution.impacto} parametros={result.parametros} />
        )}
        {activeTab === 'assistant' && selectedSolution && (
          <SmartAssistant solution={selectedSolution} onClose={() => {}}/>
        )}
      </div>

      <div className="mt-auto pt-4 border-t space-y-2">
        <div className="flex space-x-2">
          <button onClick={handleSaveMapImage} className="w-full py-2 px-4 border border-secondary text-secondary rounded-md shadow-sm text-sm font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors">Exportar Mapa (.png)</button>
          <button onClick={handleExportCSV} className="w-full py-2 px-4 border border-secondary text-secondary rounded-md shadow-sm text-sm font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors"><TableIcon className="h-4 w-4 inline -mt-1 mr-1" /> Exportar Itinerario (.csv)</button>
        </div>
        <button onClick={() => setShowInsights(!showInsights)} className="w-full text-left text-sm text-secondary hover:text-primary p-1">
          {showInsights ? 'Ocultar' : 'Mostrar'} detalles del algoritmo...
        </button>
        {showInsights && <AlgorithmInsights graficas={result.graficas} />}
        <button onClick={onReset} className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">
          Nueva Simulación
        </button>
      </div>
       <style>{`
        .animate-fade-in {
            animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default ResultsDisplay;
