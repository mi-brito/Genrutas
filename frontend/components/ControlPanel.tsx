import React from 'react';
import { Node } from '../types';
import { TrashIcon } from './icons';
import { NodeTypeToAdd } from '../App';

interface ControlPanelProps {
  nodes: Node[];
  onOptimize: () => void;
  onUpdateDemand: (id: number, demand: number) => void;
  onDeleteNode: (id: number) => void;
  onSaveScenario: () => void;
  onLoadScenarioClick: () => void;
  vehicleCapacity: number;
  setVehicleCapacity: (value: number) => void;
  numberOfVehicles: number;
  setNumberOfVehicles: (value: number) => void;
  timeWindow: [string, string];
  setTimeWindow: (value: [string, string]) => void;
  startTime: string;
  setStartTime: (value: string) => void;
  serviceTime: number;
  setServiceTime: (value: number) => void;
  vehicleAutonomy: number;
  setVehicleAutonomy: (value: number) => void;
  vehicleConsumption: number;
  setVehicleConsumption: (value: number) => void;
  nodeTypeToAdd: NodeTypeToAdd;
  setNodeTypeToAdd: (type: NodeTypeToAdd) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  nodes, onOptimize, onUpdateDemand, onDeleteNode, onSaveScenario, onLoadScenarioClick,
  vehicleCapacity, setVehicleCapacity, numberOfVehicles, setNumberOfVehicles, 
  timeWindow, setTimeWindow, startTime, setStartTime, serviceTime, setServiceTime,
  vehicleAutonomy, setVehicleAutonomy, vehicleConsumption, setVehicleConsumption,
  nodeTypeToAdd, setNodeTypeToAdd
}) => {
  
  const handleTimeChange = (index: 0 | 1, value: string) => {
    const newTimeWindow = [...timeWindow] as [string, string];
    newTimeWindow[index] = value;
    setTimeWindow(newTimeWindow);
  };

  const timeOptions = Array.from({ length: 48 }, (_, i) => {
    const hour = Math.floor(i / 2);
    const minute = i % 2 === 0 ? '00' : '30';
    return `${String(hour).padStart(2, '0')}:${minute}`;
  });

  const hasDepot = nodes.some(n => n.type === 'depot');

  const getGuidanceMessage = () => {
    if (!hasDepot) {
      return "¡Bienvenido! Comienza haciendo clic en el mapa para ubicar tu Base (Campus) para los vehículos.";
    }
    if (nodes.length === 1) {
      return "¡Excelente! Ahora añade los Puntos de Concentración de pasajeros o Estaciones de Carga en el mapa.";
    }
    return "Puedes ajustar la demanda (personas) para cada punto. Cuando estés listo, haz clic en 'Optimizar Rutas'.";
  };


  return (
    <div className="flex flex-col h-full">
      <h2 className="text-xl font-bold text-text-main mb-4 border-b pb-2">Configuración de Optimización</h2>
      
      <div className="mb-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="vehicles" className="block text-sm font-medium text-text-light mb-1">
                # de Unidades
              </label>
              <input
                type="number"
                id="vehicles"
                min="1"
                value={numberOfVehicles}
                onChange={(e) => setNumberOfVehicles(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="capacity" className="block text-sm font-medium text-text-light mb-1">
                Capacidad (pasajeros)
              </label>
              <input
                type="number"
                id="capacity"
                min="1"
                value={vehicleCapacity}
                onChange={(e) => setVehicleCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
              />
            </div>
        </div>
        <div>
           <label className="block text-sm font-medium text-text-light mb-1">
            Ventana Operativa
          </label>
          <div className="flex items-center space-x-2">
            <select value={timeWindow[0]} onChange={e => handleTimeChange(0, e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm appearance-none">
              {timeOptions.map(time => <option key={`start-${time}`} value={time}>{time}</option>)}
            </select>
            <span className="text-gray-500">-</span>
            <select value={timeWindow[1]} onChange={e => handleTimeChange(1, e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm appearance-none">
              {timeOptions.map(time => <option key={`end-${time}`} value={time}>{time}</option>)}
            </select>
          </div>
        </div>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-text-light mb-1">
                Hora de Inicio
              </label>
              <select id="startTime" value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm appearance-none">
                {timeOptions.map(time => <option key={`start-time-${time}`} value={time}>{time}</option>)}
              </select>
            </div>
             <div>
              <label htmlFor="serviceTime" className="block text-sm font-medium text-text-light mb-1">
                T. Servicio (min)
              </label>
              <input
                type="number"
                id="serviceTime"
                min="0"
                value={serviceTime}
                onChange={(e) => setServiceTime(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
              />
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gray-50 rounded-md border">
            <div>
                <label htmlFor="vehicleAutonomy" className="block text-sm font-medium text-text-light mb-1">
                    Autonomía (kWh)
                </label>
                <input
                    type="number" id="vehicleAutonomy" min="1" step="1" value={vehicleAutonomy}
                    onChange={(e) => setVehicleAutonomy(Math.max(1, parseFloat(e.target.value)) || 1)}
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                />
            </div>
            <div>
                <label htmlFor="vehicleConsumption" className="block text-sm font-medium text-text-light mb-1">
                    Consumo (kWh/km)
                </label>
                <input
                    type="number" id="vehicleConsumption" min="0.1" step="0.1" value={vehicleConsumption}
                    onChange={(e) => setVehicleConsumption(Math.max(0.1, parseFloat(e.target.value)) || 0.1)}
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                />
            </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto mb-4">
        <h3 className="text-lg font-semibold text-text-main mb-2">Ubicaciones</h3>
        <p className="text-sm text-text-light mb-4 bg-green-50 p-3 rounded-md border border-green-200">
            {getGuidanceMessage()}
        </p>

        <div className="mb-4">
            <label className="block text-sm font-medium text-text-light mb-2">Tipo de punto a añadir:</label>
            <div className="flex rounded-md shadow-sm">
                <button
                    type="button"
                    onClick={() => setNodeTypeToAdd('container')}
                    className={`relative inline-flex items-center px-4 py-2 rounded-l-md border text-sm font-medium focus:z-10 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary ${nodeTypeToAdd === 'container' ? 'bg-primary text-white border-primary' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                    Punto de concentración
                </button>
                <button
                    type="button"
                    onClick={() => setNodeTypeToAdd('charging_station')}
                    className={`-ml-px relative inline-flex items-center px-4 py-2 rounded-r-md border text-sm font-medium focus:z-10 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary ${nodeTypeToAdd === 'charging_station' ? 'bg-primary text-white border-primary' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                    Estación de Carga
                </button>
            </div>
        </div>


        <div className="space-y-3 pr-2">
          {nodes.map((node) => (
            <div key={node.id} className="flex items-center justify-between p-2 rounded-md bg-gray-50 border">
              <span className={`font-semibold ${node.type === 'depot' ? 'text-primary' : (node.type === 'charging_station' ? 'text-accent' : 'text-secondary')}`}>
                {node.type === 'depot' ? `Base ${node.id}` : (node.type === 'container' ? `Punto ${node.id}`: `Cargador ${node.id}`)}
              </span>
              <div className="flex items-center">
                {node.type === 'container' && (
                   <>
                      <label htmlFor={`demand-${node.id}`} className="text-sm mr-2">Demanda (personas):</label>
                      <input
                          type="number"
                          id={`demand-${node.id}`}
                          value={node.demand}
                          onChange={(e) => onUpdateDemand(node.id, Math.max(0, parseInt(e.target.value, 10)))}
                          className="w-20 px-2 py-1 bg-white border border-gray-300 rounded-md shadow-sm sm:text-sm focus:outline-none focus:ring-primary focus:border-primary"
                      />
                   </>
                )}
                 {node.type !== 'depot' && (
                     <button 
                        onClick={() => onDeleteNode(node.id)} 
                        className="ml-3 text-red-500 hover:text-red-700 transition-colors"
                        aria-label={`Borrar punto ${node.id}`}
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                 )}
              </div>
            </div>
          ))}
          {nodes.length === 0 && <p className="text-center text-gray-400">Esperando ubicación de la Base...</p>}
        </div>
      </div>
      
      <div className="mt-auto pt-4 border-t">
        <div className="flex space-x-2 mb-2">
            <button
                onClick={onSaveScenario}
                disabled={nodes.length === 0}
                className="w-full py-2 px-4 border border-secondary text-secondary rounded-md shadow-sm text-sm font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                Guardar Escenario
            </button>
            <button
                onClick={onLoadScenarioClick}
                className="w-full py-2 px-4 border border-secondary text-secondary rounded-md shadow-sm text-sm font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary disabled:opacity-50 transition-colors"
            >
                Cargar Escenario
            </button>
        </div>
        <button
          onClick={onOptimize}
          disabled={nodes.length < 2}
          className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Optimizar Rutas
        </button>
      </div>
    </div>
  );
};

export default ControlPanel;