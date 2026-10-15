import React from 'react';
import { Graficas } from '../types';

interface AlgorithmInsightsProps {
  graficas: Graficas;
}

const AlgorithmInsights: React.FC<AlgorithmInsightsProps> = ({ graficas }) => {
  const hasValidGraphs = graficas && graficas.progreso_optimizacion && graficas.soluciones_finales;

  return (
    <div className="space-y-6 p-4 bg-gray-50 rounded-lg border animate-fade-in">
      <h3 className="text-lg font-semibold text-text-main border-b pb-2">Cómo Funciona el Algoritmo</h3>
      
      {!hasValidGraphs ? (
        <div className="p-4 bg-yellow-100 text-yellow-800 rounded-md border border-yellow-300">
          <p><span className="font-bold">Error de Visualización:</span> Las gráficas de detalles del algoritmo no están disponibles en la respuesta de la API. Por favor, verifique el servicio de backend.</p>
        </div>
      ) : (
        <>
          <div className="insight-item">
            <h4 className="font-semibold mb-2 text-text-light">Progreso de la Optimización</h4>
            <p className="text-xs text-gray-500 mb-2">
              Este gráfico muestra cómo el algoritmo mejoró sus soluciones a lo largo de 100 generaciones. La 'Mejor' solución (línea azul) mejora progresivamente, demostrando convergencia.
            </p>
            <img src={graficas.progreso_optimizacion} alt="Gráfico de Progreso de Optimización" className="w-full rounded-md border shadow-sm" />
          </div>

          <div className="insight-item">
            <h4 className="font-semibold mb-2 text-text-light">Espacio de Soluciones Finales</h4>
            <p className="text-xs text-gray-500 mb-2">
              Esto muestra todas las soluciones finales consideradas. La que está resaltada en rojo es la mejor solución global encontrada, que se selecciona automáticamente en el gráfico interactivo de arriba.
            </p>
            <img src={graficas.soluciones_finales} alt="Gráfico del Espacio de Soluciones Finales" className="w-full rounded-md border shadow-sm" />
          </div>
        </>
      )}

      <style>{`
        .animate-fade-in {
            animation: fadeIn 0.5s ease-in-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default AlgorithmInsights;