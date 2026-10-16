import React, { useState } from 'react';
import { EscenarioImpacto, Impacto, Parametro } from '../types';
import { InformationCircleIcon } from './icons';

interface EnvironmentalImpactProps {
  impacto?: Impacto;
  parametros?: Parametro[];
}

const mxn = (x: number) => `$${x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (x: number, d = 2) => x.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

const COLOR_NIVEL: Record<Parametro['nivel'], string> = {
  oficial: 'bg-green-100 text-green-800',
  academico: 'bg-blue-100 text-blue-800',
  proxy: 'bg-yellow-100 text-yellow-800',
};

const ModalFuentes: React.FC<{ parametros: Parametro[]; onClose: () => void }> = ({ parametros, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
    <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 relative" onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="absolute top-2 right-4 text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
      <h3 className="text-xl font-bold text-text-main mb-2">¿De dónde salen los números?</h3>
      <p className="text-sm text-text-light mb-4">
        <span className={`px-1.5 py-0.5 rounded text-xs ${COLOR_NIVEL.oficial}`}>oficial</span> dato publicado por una dependencia ·{' '}
        <span className={`px-1.5 py-0.5 rounded text-xs ${COLOR_NIVEL.academico}`}>académico</span> estudio con método publicado ·{' '}
        <span className={`px-1.5 py-0.5 rounded text-xs ${COLOR_NIVEL.proxy}`}>proxy</span> dato de otra flota (Metrobús CDMX) o estimación nuestra.
        El costo solar no incluye la inversión en paneles.
      </p>
      <table className="min-w-full text-xs divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-2 text-left">Parámetro</th>
            <th className="px-2 py-2 text-left">Valor</th>
            <th className="px-2 py-2 text-left">Nivel</th>
            <th className="px-2 py-2 text-left">Fuente</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {parametros.map(p => (
            <tr key={p.clave}>
              <td className="px-2 py-2 font-mono text-gray-700">{p.clave}</td>
              <td className="px-2 py-2 whitespace-nowrap">{p.valor === null ? '—' : p.valor.toLocaleString('es-MX')} {p.unidad}</td>
              <td className="px-2 py-2"><span className={`px-1.5 py-0.5 rounded ${COLOR_NIVEL[p.nivel]}`}>{p.nivel}</span></td>
              <td className="px-2 py-2">
                <a href={p.url} target="_blank" rel="noreferrer" className="text-secondary underline">{p.fuente}</a>
                {p.nota && <div className="text-gray-500 mt-0.5">{p.nota}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const Tarjeta: React.FC<{ titulo: string; subtitulo: string; e: EscenarioImpacto; borde: string; destacado?: boolean }> = ({ titulo, subtitulo, e, borde, destacado }) => (
  <div className={`p-3 bg-white rounded-lg shadow-sm border-l-4 ${borde}`}>
    <h4 className="font-bold text-text-main">{titulo}</h4>
    <p className="text-xs text-text-light mb-2">{subtitulo}</p>
    <dl className="space-y-1 text-sm">
      <div><dt className="text-xs text-text-light">Costo (energía + mantenimiento)</dt>
        <dd className={`text-lg font-bold ${destacado ? 'text-primary' : 'text-text-main'}`}>{mxn(e.costo_total_mxn)}</dd></div>
      <div><dt className="text-xs text-text-light">CO₂</dt>
        <dd className={`text-lg font-bold ${destacado ? 'text-primary' : 'text-text-main'}`}>{num(e.co2_kg)} kg</dd></div>
      <div className="text-xs text-text-light">
        {e.litros > 0 ? `${num(e.litros)} L de diésel` : `${num(e.kwh)} kWh${e.kwh_solar ? ` (${num(e.kwh_solar)} solares)` : ''}`}
        {' · '}NOx {num(e.nox_g, 0)} g · PM2.5 {num(e.pm25_g, 1)} g
      </div>
    </dl>
  </div>
);

const EnvironmentalImpact: React.FC<EnvironmentalImpactProps> = ({ impacto, parametros }) => {
  const [verFuentes, setVerFuentes] = useState(false);

  if (!impacto) {
    return (
      <div className="p-4 bg-yellow-100 text-yellow-800 rounded-md border border-yellow-300 text-sm">
        El impacto se calcula en el motor NSGA-II. Arranca el backend y vuelve a optimizar para verlo.
      </div>
    );
  }

  const { escenarios: e, ahorro_vs_diesel: ahorro } = impacto;
  const pctSolar = Math.round(impacto.fraccion_solar * 100);

  return (
    <div className="space-y-4">
      {verFuentes && parametros && <ModalFuentes parametros={parametros} onClose={() => setVerFuentes(false)} />}

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-text-main">Misma operación, tres tecnologías</h3>
        {parametros && (
          <button onClick={() => setVerFuentes(true)} className="flex items-center text-xs text-secondary hover:text-primary">
            <InformationCircleIcon className="h-4 w-4 mr-1" /> Fuentes
          </button>
        )}
      </div>
      <p className="text-xs text-text-light">{num(impacto.km)} km recorridos por esta solución.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Tarjeta titulo="⛽ Diésel actual" subtitulo="Pumabús Euro V" e={e.diesel} borde="border-gray-400" />
        <Tarjeta titulo="⚡ Eléctrico" subtitulo={`Red CFE, carga de ${impacto.carga === 'noche' ? 'noche' : 'día'}`} e={e.electrico_red} borde="border-secondary" />
        <Tarjeta titulo="☀️ Eléctrico + solar" subtitulo={`${pctSolar}% cargado con paneles al mediodía`} e={e.electrico_solar} borde="border-primary" destacado />
      </div>

      <div className="p-3 bg-green-50 rounded-lg border border-green-200 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-text-light">Eléctrico con la red vs. diésel</p>
          <p className="font-bold text-green-700">{num(ahorro.electrico_red.co2_pct, 0)}% menos CO₂ · ahorra {mxn(ahorro.electrico_red.costo_mxn)}</p>
        </div>
        <div>
          <p className="text-text-light">Eléctrico + solar vs. diésel</p>
          <p className="font-bold text-green-700">{num(ahorro.electrico_solar.co2_pct, 0)}% menos CO₂ · ahorra {mxn(ahorro.electrico_solar.costo_mxn)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Consumos eléctricos y de diésel tomados del Metrobús CDMX (proxy); no hay datos publicados del Pumabús eléctrico. Sin NOx ni PM2.5 en el escape del eléctrico.
      </p>
    </div>
  );
};

export default EnvironmentalImpact;
