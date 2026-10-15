import React, { useState } from 'react';
import { EnvironmentalImpact as ImpactData, CalculationConstants } from '../types';
import { CO2Icon, InformationCircleIcon } from './icons';

interface EnvironmentalImpactProps {
  impact: ImpactData;
}

const TransparencyModal: React.FC<{ constants: CalculationConstants; onClose: () => void }> = ({ constants, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4 animate-fade-in-fast">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 relative">
        <button onClick={onClose} className="absolute top-2 right-4 text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
        <h3 className="text-xl font-bold text-text-main mb-4 border-b pb-2">Transparencia de Cálculos</h3>
        <p className="text-sm text-text-light mb-4">
          Los siguientes valores y constantes se utilizan para estimar el impacto ambiental y los costos. Están basados en promedios y pueden ser ajustados en un entorno de producción real.
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between p-2 bg-gray-50 rounded">
            <span className="font-semibold text-text-light">Consumo Vehículo Eléctrico:</span>
            <span className="font-mono text-text-main">{constants.consumo_ev_kwh_per_km} kWh/km</span>
          </li>
          <li className="flex justify-between p-2 bg-gray-50 rounded">
            <span className="font-semibold text-text-light">Consumo Vehículo Fósil (est.):</span>
            <span className="font-mono text-text-main">{constants.consumo_fossil_l_per_km} L/km</span>
          </li>
          <li className="flex justify-between p-2 bg-gray-50 rounded">
            <span className="font-semibold text-text-light">Precio Electricidad:</span>
            <span className="font-mono text-text-main">${constants.precio_electricidad_mxn_per_kwh.toFixed(2)} MXN/kWh</span>
          </li>
          <li className="flex justify-between p-2 bg-gray-50 rounded">
            <span className="font-semibold text-text-light">Precio Combustible:</span>
            <span className="font-mono text-text-main">${constants.precio_combustible_mxn_per_l.toFixed(2)} MXN/L</span>
          </li>
           <li className="flex justify-between p-2 bg-gray-50 rounded">
            <span className="font-semibold text-text-light">Factor Emisión (Red Eléctrica):</span>
            <span className="font-mono text-text-main">{constants.grid_emission_factor} kg CO₂e/kWh</span>
          </li>
          <li className="flex justify-between p-2 bg-gray-50 rounded">
            <span className="font-semibold text-text-light">Factor Emisión (Combustible):</span>
            <span className="font-mono text-text-main">{constants.fuel_emission_factor} kg CO₂e/L</span>
          </li>
        </ul>
      </div>
       <style>{`
        .animate-fade-in-fast {
            animation: fadeIn 0.2s ease-in-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};


const EnvironmentalImpact: React.FC<EnvironmentalImpactProps> = ({ impact }) => {
  const [showModal, setShowModal] = useState(false);

  if (!impact || !impact.constants) {
    return (
      <div className="p-4 bg-yellow-100 text-yellow-800 rounded-md border border-yellow-300">
        <p><span className="font-bold">Datos no disponibles:</span> Los datos de impacto ambiental no se encontraron o están incompletos.</p>
      </div>
    );
  }

  const { costo_energia_mxn, costo_combustible_mxn, co2_electrico_kg, co2_fosil_kg, co2_ahorrado_kg } = impact;
  const ahorro_costo_mxn = costo_combustible_mxn - costo_energia_mxn;

  return (
    <div className="space-y-6 animate-fade-in">
      {showModal && <TransparencyModal constants={impact.constants} onClose={() => setShowModal(false)} />}
      
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-text-main">Análisis Comparativo de Impacto</h3>
        <button onClick={() => setShowModal(true)} className="flex items-center text-xs text-secondary hover:text-primary transition-colors">
          <InformationCircleIcon className="h-4 w-4 mr-1" />
          ¿Cómo se calcula esto?
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Columna Eléctrico */}
        <div className="p-4 bg-white rounded-lg shadow-sm border-l-4 border-primary">
            <h4 className="font-bold text-text-main mb-3">⚡ Flota Eléctrica (Solución)</h4>
            <div className="space-y-3">
                <div>
                    <p className="text-sm text-text-light">Costo Operativo Total</p>
                    <p className="text-2xl font-bold text-primary">${costo_energia_mxn.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} MXN</p>
                </div>
                 <div>
                    <p className="text-sm text-text-light">Emisiones Totales</p>
                    <p className="text-2xl font-bold text-primary">{co2_electrico_kg.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} kg CO₂e</p>
                </div>
            </div>
        </div>

        {/* Columna Fósil */}
         <div className="p-4 bg-white rounded-lg shadow-sm border-l-4 border-gray-400">
            <h4 className="font-bold text-text-main mb-3">⛽ Flota Fósil (Estimación)</h4>
             <div className="space-y-3">
                <div>
                    <p className="text-sm text-text-light">Costo Operativo Total</p>
                    <p className="text-2xl font-bold text-text-main">${costo_combustible_mxn.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} MXN</p>
                </div>
                 <div>
                    <p className="text-sm text-text-light">Emisiones Totales</p>
                    <p className="text-2xl font-bold text-text-main">{co2_fosil_kg.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} kg CO₂e</p>
                </div>
            </div>
        </div>
      </div>
      
      <div>
        <h4 className="font-semibold text-text-main mb-2">Ahorros Totales</h4>
        <div className="p-4 bg-green-50 rounded-lg shadow-inner border border-green-200 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center">
                 <div className="text-3xl mr-3">💰</div>
                 <div>
                    <p className="text-sm text-text-light">Ahorro en Costo</p>
                    <p className="text-2xl font-bold text-green-700">
                      ${ahorro_costo_mxn.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} MXN
                    </p>
                 </div>
            </div>
             <div className="flex items-center">
                <CO2Icon className="h-10 w-10 text-green-700 mr-3" />
                <div>
                    <p className="text-sm text-text-light">Ahorro en Emisiones</p>
                    <p className="text-2xl font-bold text-green-700">
                      {co2_ahorrado_kg.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} kg CO₂e
                    </p>
                </div>
            </div>
        </div>
      </div>

    </div>
  );
};

export default EnvironmentalImpact;