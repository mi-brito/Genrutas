import React from 'react';

interface ProjectReportProps {
  onClose: () => void;
}

const ProjectReport: React.FC<ProjectReportProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8 lg:p-12 relative font-serif">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-4xl font-light"
          aria-label="Cerrar reporte"
        >
          &times;
        </button>

        <header className="text-center mb-10 border-b pb-6">
            <h3 className="text-sm font-sans tracking-widest text-gray-500 uppercase">Ficha Conceptual del Proyecto</h3>
            <h1 className="text-5xl font-bold text-gray-800 mt-2">OptiRutasComplementarias-IA</h1>
            <p className="text-gray-600 mt-3 font-sans text-base">LOGÍSTICA | MOVILIDAD ELÉCTRICA | INTELIGENCIA ARTIFICIAL</p>
        </header>

        <section className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800 border-l-4 border-primary pl-4 mb-4">OBJETIVO.</h2>
          <p className="text-gray-700 leading-relaxed text-lg">
            Desarrollar un sistema computacional en la nube que emplea inteligencia artificial para optimizar **rutas complementarias de transporte eléctrico**, aplicables a universidades, centros de trabajo u otras comunidades. El sistema busca minimizar la distancia total recorrida y el consumo energético, considerando demanda variable de pasajeros, autonomía de los vehículos y la ubicación de estaciones de carga, para promover una movilidad más sostenible y eficiente.
          </p>
        </section>

        <section className="mb-8">
            <h2 className="text-3xl font-bold text-gray-800 border-l-4 border-primary pl-4 mb-4">ALCANCES.</h2>
            <ul className="list-disc list-inside text-gray-700 space-y-3 leading-relaxed text-lg">
                <li>Reducir los costos operativos a través de la minimización de la distancia y el consumo de energía.</li>
                <li>Optimizar el uso de la flota de vehículos eléctricos, equilibrando la asignación de rutas para maximizar la cobertura y la satisfacción de la demanda.</li>
                <li>Minimizar la huella de carbono de las operaciones de transporte al favorecer la electromovilidad y reducir kilómetros innecesarios.</li>
                <li>Integrar la gestión de la autonomía y las paradas de recarga en la planificación de rutas para garantizar la viabilidad operativa.</li>
                <li>Proveer a los planificadores un conjunto de soluciones óptimas (Frente de Pareto) que equilibren objetivos en conflicto (ej. tiempo vs. consumo energético).</li>
            </ul>
        </section>
        
        <section className="mb-8">
            <h2 className="text-3xl font-bold text-gray-800 border-l-4 border-primary pl-4 mb-4">PÚBLICO OBJETIVO.</h2>
            <p className="text-gray-700 leading-relaxed text-lg">
                El proyecto se dirige a administradores de campus universitarios, gestores de flotas corporativas, y planificadores de transporte en municipios o comunidades que deseen implementar o mejorar sistemas de transporte complementario ('last-mile') utilizando vehículos eléctricos.
            </p>
        </section>
        
        <section className="mb-8">
            <h2 className="text-3xl font-bold text-gray-800 border-l-4 border-primary pl-4 mb-4">PROCESOS TECNOLÓGICOS.</h2>
            <ol className="list-decimal list-inside text-gray-700 space-y-8 leading-relaxed text-lg">
                <li>
                    <strong>Definición Interactiva del Escenario:</strong> El usuario configura el problema logístico definiendo la ubicación de la base, los puntos de concentración de pasajeros y las estaciones de carga en el mapa. El panel de control permite ajustar parámetros clave como la capacidad de los vehículos, la demanda de pasajeros y las especificaciones de la flota eléctrica.
                    <img src="https://i.ibb.co/hR7qG1p/Captura-de-pantalla-2024-07-25-a-la-s-12-14-36.png" alt="Setup Panel and Map" className="w-full rounded-lg shadow-md my-4 border" />
                    <p className="mt-4 text-base font-sans">Los parámetros de entrada que el frontend recopila son:</p>
                    <ul className="list-disc list-inside text-gray-700 space-y-2 mt-2 font-sans text-base">
                      <li><strong>Puntos (Ubicaciones):</strong> Una lista de objetos con ID, latitud, longitud, tipo ('base', 'punto de concentración', 'estación de carga'), y demanda de pasajeros.</li>
                      <li><strong>Número de Unidades:</strong> La cantidad de vehículos eléctricos disponibles.</li>
                      <li><strong>Capacidad del Vehículo (pasajeros):</strong> El número máximo de pasajeros que cada unidad puede transportar.</li>
                      <li><strong>Ventana Operativa y Hora de Inicio:</strong> El rango horario en que se deben completar las rutas.</li>
                      <li><strong>Autonomía y Consumo del Vehículo:</strong> La capacidad de la batería (kWh) y la eficiencia energética (kWh/km).</li>
                    </ul>
                </li>
                
                <li>
                    <strong>Optimización con Algoritmos Genéticos (NSGA-II):</strong> Al solicitar la optimización, el frontend envía los datos a un backend simulado. Este utiliza el algoritmo NSGA-II para explorar miles de combinaciones de rutas, evaluando cada una en función de múltiples objetivos: minimizar la distancia, el tiempo y el consumo energético.
                </li>
                 
                <li>
                    <strong>Visualización y Análisis de Resultados:</strong> El frontend recibe y presenta el "Frente de Pareto" con las mejores soluciones encontradas.
                    <img src="https://i.ibb.co/XzYJ9bT/Captura-de-pantalla-2024-07-25-a-la-s-12-15-23.png" alt="Results map with routes" className="w-full rounded-lg shadow-md my-4 border" />
                    <p className="mt-4 text-base font-sans">El panel de resultados muestra:</p>
                    <ul className="list-disc list-inside text-gray-700 space-y-2 mt-2 font-sans text-base">
                      <li><strong>Gráfico de Pareto:</strong> Un diagrama interactivo para visualizar el trade-off entre tiempo y distancia.</li>
                      <li><strong>Rutas en el Mapa:</strong> Al seleccionar una solución, sus rutas se dibujan en el mapa, codificadas por color.</li>
                      <li><strong>Itinerario Detallado y Métricas Energéticas:</strong> Se puede expandir cada ruta para ver el itinerario, junto con el consumo de energía, el costo y el CO₂ ahorrado.</li>
                    </ul>
                    <img src="https://i.ibb.co/PM9b7gR/Captura-de-pantalla-2024-07-25-a-la-s-12-15-41.png" alt="Results panel with chart and itinerary" className="w-full rounded-lg shadow-md my-4 border" />
                </li>
            </ol>
        </section>
        
        <section>
            <h2 className="text-3xl font-bold text-gray-800 border-l-4 border-primary pl-4 mb-4">RELEVANCIA DEL PROYECTO.</h2>
            <p className="text-gray-700 leading-relaxed text-lg">
                OptiRutasComplementarias-IA aborda la pregunta: <strong>¿Cómo podemos diseñar sistemas de transporte complementario que sean eficientes, económicos y sostenibles?</strong> Al aplicar IA a este desafío, el proyecto ofrece una herramienta práctica para reducir costos operativos y la huella de carbono, empoderando a las organizaciones para adoptar la electromovilidad de manera inteligente y basada en datos.
            </p>
        </section>

      </div>
       <style>{`
        .animate-fade-in {
            animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default ProjectReport;