import React, { useState, useRef } from 'react';
import Header from './components/Header';
import InteractiveMap from './components/InteractiveMap';
import ControlPanel from './components/ControlPanel';
import ResultsDisplay from './components/ResultsDisplay';
import { CapaMapaCU, Node, OptimizationResult, ParetoSolution } from './types';
import { optimizeRoutes } from './services/api';
import ProjectReport from './components/ProjectReport';
import PanelCU from './components/PanelCU';

// Defines the structure of the scenario file for saving and loading.
export interface Scenario {
  nodes: Node[];
  vehicleCapacity: number;
  numberOfVehicles: number;
  timeWindow: [string, string];
  startTime: string;
  serviceTime: number;
  // Old property for backward compatibility
  vehicleMPG?: number;
  // New properties for electric vehicles
  vehicleAutonomy?: number;
  vehicleConsumption?: number;
}


type AppPhase = 'setup' | 'loading' | 'results';
export type NodeTypeToAdd = 'container' | 'charging_station';


const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase>('setup');
  const [nodes, setNodes] = useState<Node[]>([]);
  
  // State for optimization parameters
  const [vehicleCapacity, setVehicleCapacity] = useState(85); // Pumabús Volkswagen 11 m (Fundación UNAM)
  const [numberOfVehicles, setNumberOfVehicles] = useState(3);
  const [timeWindow, setTimeWindow] = useState<[string, string]>(['06:00', '10:00']);
  const [startTime, setStartTime] = useState('06:30');
  const [serviceTime, setServiceTime] = useState(5); // in minutes
  const [vehicleAutonomy, setVehicleAutonomy] = useState(330); // kWh, autobús eléctrico 12 m del Metrobús (ICCT 2022)
  const [vehicleConsumption, setVehicleConsumption] = useState(1.0); // kWh/km, proxy del Metrobús (ICCT 2022)

  const [nodeTypeToAdd, setNodeTypeToAdd] = useState<NodeTypeToAdd>('container');
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [selectedSolution, setSelectedSolution] = useState<ParetoSolution | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null); 
  const [highlightedRouteId, setHighlightedRouteId] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);
  // 'cu': escenario real de Ciudad Universitaria; 'libre': puntos marcados a mano en el mapa.
  const [modo, setModo] = useState<'cu' | 'libre'>('cu');
  const [capaCU, setCapaCU] = useState<CapaMapaCU | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);


  const handleAddNode = (lat: number, lng: number) => {
    setNodes(prevNodes => {
      const isDepotPlacement = prevNodes.length === 0;
      const type = isDepotPlacement ? 'depot' : nodeTypeToAdd;
      
      const newNode: Node = {
        id: prevNodes.length + 1,
        lat,
        lng,
        demand: type === 'container' ? 10 : 0, // Only containers have demand
        type,
      };
      return [...prevNodes, newNode];
    });
  };

  const handleUpdateDemand = (id: number, demand: number) => {
    setNodes(prevNodes =>
      prevNodes.map(node => (node.id === id ? { ...node, demand } : node))
    );
  };
  
  const handleDeleteNode = (idToDelete: number) => {
    setNodes(prevNodes => {
      const newNodes = prevNodes.filter(node => node.id !== idToDelete);
      
      let nodeCounter = 2;
      return newNodes.map(node => {
        if (node.type === 'depot') {
          return { ...node, id: 1 };
        } else {
          return { ...node, id: nodeCounter++ };
        }
      });
    });
  };


  const handleOptimize = async () => {
    if (nodes.length < 2) {
      alert("Por favor, añada al menos una base y un punto de concentración.");
      return;
    }
    setPhase('loading');
    setInfoMessage(null);
    setSelectedSolution(null);
    try {
      const result = await optimizeRoutes(
        nodes, 
        vehicleCapacity, 
        timeWindow, 
        numberOfVehicles,
        startTime,
        serviceTime,
        vehicleAutonomy,
        vehicleConsumption
      );
      
      setOptimizationResult(result);
      setInfoMessage(result.aviso ?? null);
      if (result.paretoFront.length > 0) {
        setSelectedSolution(result.paretoFront[0]);
      }
      setPhase('results');
    } catch (error) {
      console.error("La optimización falló inesperadamente:", error);
      alert("Ocurrió un error inesperado durante la optimización.");
      setPhase('setup');
    }
  };

  // --- SCENARIO MANAGEMENT LOGIC ---
  
  const handleSaveScenario = () => {
    const scenario: Scenario = {
      nodes,
      vehicleCapacity,
      numberOfVehicles,
      timeWindow,
      startTime,
      serviceTime,
      vehicleAutonomy,
      vehicleConsumption
    };
    const dataStr = JSON.stringify(scenario, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    link.download = `optirutas-escenario-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error("File is not readable");
        const loadedScenario = JSON.parse(text) as Scenario;
        
        if (loadedScenario.nodes && loadedScenario.vehicleCapacity && loadedScenario.numberOfVehicles && loadedScenario.timeWindow) {
            setPhase('setup');
            setNodes(loadedScenario.nodes);
            setVehicleCapacity(loadedScenario.vehicleCapacity);
            setNumberOfVehicles(loadedScenario.numberOfVehicles);
            setTimeWindow(loadedScenario.timeWindow);
            setStartTime(loadedScenario.startTime ?? '06:30');
            setServiceTime(loadedScenario.serviceTime ?? 5);
            setVehicleAutonomy(loadedScenario.vehicleAutonomy ?? 80);
            setVehicleConsumption(loadedScenario.vehicleConsumption ?? 0.5);
            setOptimizationResult(null);
            setSelectedSolution(null);
            setInfoMessage(null);
        } else {
            alert("Archivo de escenario inválido. Por favor, seleccione un archivo JSON válido de OptiRutas-IA.");
        }
      } catch (error) {
        console.error("Falló al parsear el archivo de escenario:", error);
        alert("No se pudo leer el archivo de escenario. Podría estar corrupto o en el formato incorrecto.");
      }
    };
    reader.readAsText(file);
    
    if(event.target) event.target.value = '';
  };

  const handleReset = () => {
    setNodes([]);
    setOptimizationResult(null);
    setSelectedSolution(null);
    setInfoMessage(null); 
    setPhase('setup');
  };

  const routesToShow = selectedSolution?.routes_serializadas ?? [];

  return (
    <div className="flex flex-col h-screen font-sans text-text-main">
      {showReport && <ProjectReport onClose={() => setShowReport(false)} />}
      <Header onShowReport={() => setShowReport(true)} />
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" style={{ display: 'none' }} />

      <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
        <div className="lg:col-span-1 bg-white rounded-lg shadow-md p-6 overflow-y-auto flex flex-col">
          <div className="flex mb-4 rounded-md border border-gray-200 overflow-hidden text-sm">
            {([['cu', 'Pumabús CU (datos reales)'], ['libre', 'Escenario libre']] as ['cu' | 'libre', string][]).map(([clave, texto]) => (
              <button key={clave} onClick={() => setModo(clave)}
                className={`flex-1 py-2 font-medium ${modo === clave ? 'bg-primary text-white' : 'bg-white text-text-light hover:bg-gray-50'}`}>
                {texto}
              </button>
            ))}
          </div>
          {modo === 'cu' && <PanelCU onCapa={setCapaCU} />}
          {modo === 'libre' && phase === 'setup' && (
            <ControlPanel
              nodes={nodes}
              onOptimize={handleOptimize}
              onUpdateDemand={handleUpdateDemand}
              onDeleteNode={handleDeleteNode}
              onSaveScenario={handleSaveScenario}
              onLoadScenarioClick={handleLoadClick}
              vehicleCapacity={vehicleCapacity}
              setVehicleCapacity={setVehicleCapacity}
              numberOfVehicles={numberOfVehicles}
              setNumberOfVehicles={setNumberOfVehicles}
              timeWindow={timeWindow}
              setTimeWindow={setTimeWindow}
              startTime={startTime}
              setStartTime={setStartTime}
              serviceTime={serviceTime}
              setServiceTime={setServiceTime}
              vehicleAutonomy={vehicleAutonomy}
              setVehicleAutonomy={setVehicleAutonomy}
              vehicleConsumption={vehicleConsumption}
              setVehicleConsumption={setVehicleConsumption}
              nodeTypeToAdd={nodeTypeToAdd}
              setNodeTypeToAdd={setNodeTypeToAdd}
            />
          )}
          {modo === 'libre' && phase === 'loading' && (
             <div className="flex flex-col justify-center items-center h-full">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
                <p className="mt-4 text-text-light">Ejecutando Algoritmo NSGA-II...</p>
                <p className="text-sm text-secondary">Optimizando rutas para ti.</p>
            </div>
          )}
          {modo === 'libre' && phase === 'results' && optimizationResult && (
            <>
              {infoMessage && (
                <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 mb-4 rounded-md shadow-sm" role="alert">
                  <p className="font-bold">Nota</p>
                  <p className="text-sm">{infoMessage}</p>
                </div>
              )}
              <ResultsDisplay
                result={optimizationResult}
                selectedSolution={selectedSolution}
                onSelectSolution={setSelectedSolution}
                onReset={handleReset}
                onHighlightRoute={setHighlightedRouteId}
                onSaveScenario={handleSaveScenario}
                onLoadScenarioClick={handleLoadClick}
              />
            </>
          )}
        </div>
        <div className="lg:col-span-2 bg-white rounded-lg shadow-md min-h-[50vh] lg:min-h-0">
          <InteractiveMap
            nodes={modo === 'libre' ? nodes : []}
            routes={modo === 'libre' ? routesToShow : []}
            onAddNode={modo === 'libre' && phase === 'setup' ? handleAddNode : undefined}
            highlightedRouteId={highlightedRouteId}
            capaCU={modo === 'cu' ? capaCU : null}
          />
        </div>
      </main>
    </div>
  );
};

export default App;