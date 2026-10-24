import React, { useEffect, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CapaMapaCU, EscenarioImpacto, Node, Parametro } from '../types';
import {
  DisenoCU, EscenarioCU, PlanDia, cargarEscenarioCU, cargarParametros, disenarRutas, planDia,
} from '../services/cu';
import { ROUTE_COLORS, fetchRouteData } from '../services/mockApi';
import EnvironmentalImpact from './EnvironmentalImpact';

interface PanelCUProps {
  onCapa: (capa: CapaMapaCU | null) => void;
}

type Pestana = 'rutas' | 'dia' | 'modelo';

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const n = (x: number | null | undefined, d = 0) =>
  x === null || x === undefined ? '—' : x.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
const mxn = (x: number) => `$${n(x, 0)}`;
const NOMBRE_PERIODO: Record<string, string> = { clases: 'clases', examenes: 'exámenes', vacaciones: 'vacaciones' };

const lineasActuales = (escenario: EscenarioCU, rutas?: number[]) =>
  escenario.rutas
    .filter(r => !rutas || rutas.includes(r.ruta))
    .map(r => ({ id: `actual-${r.ruta}`, color: r.color, trazo: r.trazo, etiqueta: `<b>Ruta ${r.ruta} actual</b><br>${r.longitud_km} km` }));

const PanelCU: React.FC<PanelCUProps> = ({ onCapa }) => {
  const [escenario, setEscenario] = useState<EscenarioCU | null>(null);
  const [parametros, setParametros] = useState<Parametro[] | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyLocal());
  const [hora, setHora] = useState(15);
  const [base, setBase] = useState('Metro Universidad');
  const [oleada, setOleada] = useState(10);
  const [maxParadas, setMaxParadas] = useState(12);
  const [solarPct, setSolarPct] = useState(100);
  const [kwp, setKwp] = useState(500);
  const [flota, setFlota] = useState(60); // flota real del Pumabús (Memoria UNAM 2024)
  const [cargando, setCargando] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanDia | null>(null);
  const [diseno, setDiseno] = useState<DisenoCU | null>(null);
  const [pestana, setPestana] = useState<Pestana>('rutas');

  useEffect(() => {
    cargarEscenarioCU()
      .then(e => {
        setEscenario(e);
        onCapa({
          rutasActuales: lineasActuales(e),
          rutasNuevas: [],
          todasParadas: senalesParada(e),
          paraderos: e.paraderos.filter(p => !p.base).map(p => ({
            lat: p.lat, lng: p.lng, nombre: p.nombre, valor: p.peso,
            etiqueta: `Rutas ${p.rutas.join(', ')}<br>Peso por matrícula cercana: ${n(p.peso)}`,
          })),
        });
      })
      .catch(e => setError(`No se pudo cargar el escenario de CU: ${e.message}. Revisa que el backend esté corriendo y que existan los datos (backend/datos/descargar_datos_cu.py).`));
    cargarParametros().then(setParametros).catch(() => undefined);
    return () => onCapa(null);
  }, []);

  const calcularDia = async () => {
    setCargando('Pronosticando el día...');
    setError(null);
    try {
      setPlan(await planDia(fecha, kwp, flota));
      setPestana('dia');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(null);
    }
  };

  const disenar = async () => {
    if (!escenario) return;
    setCargando(maxParadas === 0 ? 'El NSGA-II está diseñando con todos los paraderos (puede tardar unos minutos)...' : 'El NSGA-II está diseñando las rutas (30 a 60 s)...');
    setError(null);
    try {
      const d = await disenarRutas(fecha, hora, base, oleada, solarPct / 100, maxParadas);
      setDiseno(d);
      setPestana('rutas');
      // Trazo por calle de las rutas nuevas (OSRM); si falla, líneas rectas.
      const comoNodo = (p: [number, number]) => ({ id: 0, lat: p[0], lng: p[1], demand: 0, type: 'container' } as Node);
      const nuevas = await Promise.all(d.genrutas.rutas_nsga2.map(async (r, i) => {
        const { geometry } = await fetchRouteData(r.trazo.map(comoNodo));
        return {
          id: `nueva-${r.id}`, color: ROUTE_COLORS[i % ROUTE_COLORS.length], trazo: geometry.length > 1 ? geometry : r.trazo,
          etiqueta: `<b>GenRutas ${r.id}</b><br>${r.paradas.join(' → ')}<br>${r.carga} pasajeros · ${n(r.distancia_m / 1000, 1)} km`,
        };
      }));
      const directos = d.genrutas.directos.map(v => ({
        id: `directo-${v.paradero}`, color: '#0f172a', trazo: v.trazo,
        etiqueta: `<b>Directo a ${v.nombre}</b><br>${v.viajes} autobús(es) lleno(s) por salida`,
      }));
      onCapa({
        rutasActuales: lineasActuales(escenario, d.actual.rutas.map(r => r.ruta)),
        rutasNuevas: [...nuevas, ...directos],
        todasParadas: senalesParada(escenario),
        paraderos: d.paradas.map(p => ({
          lat: p.lat, lng: p.lng, nombre: p.nombre, valor: p.pasajeros_oleada,
          etiqueta: `${p.pasajeros_oleada} pasajeros por salida${p.directos ? ` (${p.directos} directo)` : ''}`,
        })),
        base: { lat: d.punto_base[0], lng: d.punto_base[1], nombre: d.base },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(null);
    }
  };

  const etiqueta = 'block text-xs font-medium text-text-light mb-1';
  const campo = 'w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm';

  return (
    <div className="flex flex-col h-full space-y-4">
      <div>
        <h2 className="text-xl font-bold text-text-main">Pumabús en Ciudad Universitaria</h2>
        <p className="text-xs text-text-light">
          Rutas y paraderos reales (OpenStreetMap), demanda pronosticada con IA y comparación contra la operación actual.
        </p>
      </div>

      {error && <div className="bg-red-50 border-l-4 border-red-400 text-red-800 p-3 rounded text-sm">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div><label className={etiqueta}>Fecha</label><input type="date" className={campo} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        <div>
          <label className={etiqueta}>Hora</label>
          <select className={campo} value={hora} onChange={e => setHora(Number(e.target.value))}>
            {Array.from({ length: 16 }, (_, i) => i + 6).map(h => <option key={h} value={h}>{h}:00 – {h + 1}:00</option>)}
          </select>
        </div>
        <div>
          <label className={etiqueta}>Base</label>
          <select className={campo} value={base} onChange={e => setBase(e.target.value)}>
            {(escenario?.bases ?? ['Metro Universidad']).map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className={etiqueta}>Salidas cada</label>
          <select className={campo} value={oleada} onChange={e => setOleada(Number(e.target.value))}>
            {[5, 10, 15].map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
        <div>
          <label className={etiqueta}>Energía solar: {solarPct}%</label>
          <input type="range" min={0} max={100} step={10} value={solarPct} onChange={e => setSolarPct(Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className={etiqueta}>Paraderos actuales a usar</label>
          <select className={campo} value={maxParadas} onChange={e => setMaxParadas(Number(e.target.value))}>
            <option value={12}>12 con más demanda (rápido)</option>
            <option value={24}>24 con más demanda</option>
            <option value={0}>Todos los de la base</option>
          </select>
        </div>
        <div>
          <label className={etiqueta}>Autobuses en la flota</label>
          <input type="number" min={1} max={500} step={1} className={campo} value={flota} onChange={e => setFlota(Math.max(1, Number(e.target.value) || 60))} />
          <p className="text-[11px] text-gray-500 mt-0.5">Pumabús hoy: 60 (Memoria UNAM 2024). Afecta el plan del día.</p>
        </div>
        <div><label className={etiqueta}>Paneles en bases (kWp)</label><input type="number" min={0} step={100} className={campo} value={kwp} onChange={e => setKwp(Number(e.target.value))} /></div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={calcularDia} disabled={!!cargando || !escenario}
          className="py-2 px-3 border border-primary text-primary rounded-md text-sm font-medium hover:bg-green-50 disabled:opacity-50">
          Pronóstico del día
        </button>
        <button onClick={disenar} disabled={!!cargando || !escenario}
          className="py-2 px-3 bg-primary text-white rounded-md text-sm font-medium hover:bg-green-600 disabled:opacity-50">
          Diseñar rutas (NSGA-II)
        </button>
      </div>

      {cargando && (
        <div className="flex items-center text-sm text-text-light">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mr-2" />{cargando}
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 text-sm">
          {([['rutas', 'Rutas nuevas'], ['dia', 'Día completo'], ['modelo', 'Modelo y fuentes']] as [Pestana, string][]).map(([clave, texto]) => (
            <button key={clave} onClick={() => setPestana(clave)}
              className={`${pestana === clave ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'} py-2 px-1 border-b-2 font-medium`}>
              {texto}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-grow overflow-y-auto pr-1">
        {pestana === 'rutas' && (diseno ? <ResultadoRutas d={diseno} parametros={parametros} /> : (
          <p className="text-sm text-text-light">Elige fecha, hora y base, y pulsa <b>Diseñar rutas</b>. En el mapa, las líneas punteadas son las rutas actuales del Pumabús.</p>
        ))}
        {pestana === 'dia' && (plan ? <ResultadoDia p={plan} /> : (
          <p className="text-sm text-text-light">Pulsa <b>Pronóstico del día</b> para ver la demanda hora por hora y cómo reparte GenRutas los recorridos.</p>
        ))}
        {pestana === 'modelo' && escenario && <Modelo e={escenario} plan={plan} diseno={diseno} />}
      </div>
    </div>
  );
};

// --- Rutas nuevas vs. actuales en una hora ---
const ResultadoRutas: React.FC<{ d: DisenoCU; parametros?: Parametro[] }> = ({ d, parametros }) => {
  const a = d.actual, g = d.genrutas;
  const columnas: [string, EscenarioImpacto, string][] = [
    ['Actual · diésel', a.impacto.escenarios.diesel, 'hoy'],
    ['Actual · eléctrico', a.impacto.escenarios.electrico_red, 'red CFE'],
    ['GenRutas · eléctrico', g.impacto.escenarios.electrico_red, 'red CFE'],
    ['GenRutas · solar', g.impacto.escenarios.electrico_solar, `${Math.round(g.impacto.fraccion_solar * 100)}% solar`],
  ];
  const co2Hoy = a.impacto.escenarios.diesel.co2_kg;
  const filasServicio: [string, number | null, number | null, number, boolean | null][] = [
    ['Recorridos por hora', a.recorridos_hora, g.recorridos_hora, 1, null],
    ['km por hora', a.km_hora, g.km_hora, 0, true],
    ['Autobuses en servicio', a.unidades, g.unidades, 1, true],
    ['Espera promedio (min)', a.espera_prom_min, g.espera_prom_min, 1, true],
    ['Pasajeros por km', a.pasajeros_por_km, g.pasajeros_por_km, 1, false],
    ['kWh por pasajero', a.kwh_por_pasajero, g.kwh_por_pasajero, 3, true],
  ];

  return (
    <div className="space-y-4 text-sm">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-900">
        <b>{n(d.demanda_hora)} pasajeros</b> de {d.hora}:00 a {d.hora + 1}:00 en la base {d.base}
        {' '}({n(d.pasajeros_oleada)} por salida). Pronóstico del día: {n(d.pasajeros_dia)} viajes en todo el Pumabús, periodo de {NOMBRE_PERIODO[d.periodo] ?? d.periodo}.
      </div>

      <div>
        <h3 className="font-semibold text-text-main mb-1">Servicio en esa hora</h3>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-gray-500"><th className="py-1">Indicador</th><th>Rutas actuales</th><th>GenRutas</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {filasServicio.map(([nombre, x, y, dec, menorEsMejor]) => {
              const mejor = menorEsMejor !== null && x !== null && y !== null && (menorEsMejor ? y < x : y > x);
              return (
                <tr key={nombre}>
                  <td className="py-1 text-text-light">{nombre}</td>
                  <td>{n(x, dec)}</td>
                  <td className={mejor ? 'font-bold text-green-700' : ''}>{n(y, dec)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-semibold text-text-main mb-1">Electrificación y energía solar (por hora)</h3>
        <div className="grid grid-cols-2 gap-2">
          {columnas.map(([titulo, e, sub], i) => (
            <div key={titulo} className={`p-2 rounded border ${i === 3 ? 'border-primary bg-green-50' : 'border-gray-200 bg-white'}`}>
              <p className="font-semibold text-text-main text-xs">{titulo} <span className="font-normal text-gray-500">· {sub}</span></p>
              <p className="text-lg font-bold">{n(e.co2_kg, 1)} kg CO₂</p>
              <p className="text-xs text-text-light">{mxn(e.costo_total_mxn)} · {e.litros > 0 ? `${n(e.litros, 0)} L` : `${n(e.kwh, 0)} kWh`}</p>
              {i > 0 && co2Hoy > 0 && <p className="text-xs text-green-700">{n(100 * (1 - e.co2_kg / co2Hoy), 0)}% menos CO₂ que hoy</p>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-text-main mb-1">Rutas que propone GenRutas (cada {g.oleada_min} min)</h3>
        <ul className="space-y-1 text-xs">
          {g.directos.map(v => (
            <li key={`d${v.paradero}`} className="p-2 bg-gray-50 rounded"><b>Directo</b> {d.base} ⇄ {v.nombre}: {v.viajes} autobús lleno por salida, {n(v.km, 1)} km</li>
          ))}
          {g.rutas_nsga2.map((r, i) => (
            <li key={r.id} className="p-2 bg-gray-50 rounded flex">
              <span className="w-3 h-3 rounded-full mr-2 mt-0.5 flex-shrink-0" style={{ backgroundColor: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
              <span>{r.paradas.join(' → ')} · {r.carga} pasajeros · {n(r.distancia_m / 1000, 1)} km · {Math.round(r.tiempo_s / 60)} min{r.reparada ? ' · partida por capacidad' : ''}</span>
            </li>
          ))}
        </ul>
        {g.rutas_reparadas > 0 && (
          <p className="text-xs text-gray-500 mt-1">{g.rutas_reparadas} ruta(s) se partieron en el orden de visita porque el algoritmo genético las dejó por encima de 85 pasajeros.</p>
        )}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-secondary">Impacto con detalle y fuentes</summary>
        <div className="mt-2"><EnvironmentalImpact impacto={g.impacto} parametros={parametros} /></div>
      </details>

      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer text-secondary">Supuestos</summary>
        <ul className="list-disc ml-4 mt-1 space-y-1">{d.supuestos.map(s => <li key={s}>{s}</li>)}</ul>
      </details>
    </div>
  );
};

// --- Día completo ---
const ResultadoDia: React.FC<{ p: PlanDia }> = ({ p }) => {
  const datos = p.horas.map(h => ({
    hora: `${h.hora}h`, demanda: h.demanda, actual: h.base.recorridos, genrutas: h.genrutas.recorridos, solar: h.solar_kwh,
  }));
  const b = p.resumen.base, g = p.resumen.genrutas;
  return (
    <div className="space-y-4 text-sm">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-900">
        <b>{n(p.pasajeros_dia)} viajes</b> pronosticados en todo el Pumabús el {p.fecha} ({NOMBRE_PERIODO[p.periodo]}
        {p.semana_semestre ? `, semana ${p.semana_semestre} del semestre` : ''}{p.festivo ? ', día festivo' : ''}).
      </div>
      <div style={{ height: 230 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="izq" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="der" orientation="right" tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="izq" dataKey="demanda" name="Pasajeros/h" fill="#cbd5e1" />
            <Line yAxisId="der" dataKey="actual" name="Recorridos actuales" stroke="#64748b" strokeDasharray="5 4" dot={false} />
            <Line yAxisId="der" dataKey="genrutas" name="Recorridos GenRutas" stroke="#22C55E" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-gray-500"><th className="py-1">Todo el día</th><th>Actual</th><th>GenRutas</th></tr></thead>
        <tbody className="divide-y divide-gray-100">
          <tr><td className="py-1 text-text-light">Recorridos / km</td><td>{n(b.recorridos)} / {n(b.km)}</td><td>{n(g.recorridos)} / {n(g.km)}</td></tr>
          <tr><td className="py-1 text-text-light">Pasajeros por recorrido en el pico (vs. capacidad)</td><td>{n(b.ocupacion_pico_pct)}%</td><td className="font-bold text-green-700">{n(g.ocupacion_pico_pct)}%</td></tr>
          <tr><td className="py-1 text-text-light">Pasajeros por recorrido en el valle</td><td>{n(b.ocupacion_valle_pct)}%</td><td>{n(g.ocupacion_valle_pct)}%</td></tr>
          <tr><td className="py-1 text-text-light">Autobuses en servicio en el pico</td><td>{n(b.unidades_pico, 1)}</td><td>{n(g.unidades_pico, 1)}</td></tr>
          <tr><td className="py-1 text-text-light">Autobuses libres para cargar (9–15 h)</td><td>{n(b.unidades_libres_valle, 1)}</td><td>{n(g.unidades_libres_valle, 1)}</td></tr>
          <tr><td className="py-1 text-text-light">Energía del día / solar con {n(p.kwp_solar)} kWp</td><td colSpan={2}>{n(g.kwh)} kWh · {n(g.kwh_solar)} kWh solares ({n(g.fraccion_solar * 100)}%)</td></tr>
          <tr><td className="py-1 text-text-light">CO₂ del día: diésel → eléctrico → eléctrico + solar</td>
            <td colSpan={2}>{n(g.impacto.escenarios.diesel.co2_kg / 1000, 2)} → {n(g.impacto.escenarios.electrico_red.co2_kg / 1000, 2)} → <b className="text-green-700">{n(g.impacto.escenarios.electrico_solar.co2_kg / 1000, 2)} t</b></td></tr>
        </tbody>
      </table>
      <p className="text-xs text-gray-500">
        GenRutas no agrega recorridos: mueve los del valle y la noche a los picos. "Pasajeros por recorrido" puede pasar de 100% porque la gente sube y baja a lo largo de la ruta.
      </p>
      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer text-secondary">Supuestos</summary>
        <ul className="list-disc ml-4 mt-1 space-y-1">{p.supuestos.map(s => <li key={s}>{s}</li>)}</ul>
      </details>
    </div>
  );
};

// Todos los paraderos actuales (incluidos los de las bases) como señal de parada en el mapa.
const senalesParada = (e: EscenarioCU) => e.paraderos.map(p => ({
  lat: p.lat, lng: p.lng, nombre: p.nombre,
  rutas: p.rutas.length ? `Rutas ${p.rutas.join(', ')}` : (p.base ? `Base ${p.base}` : ''),
}));

// --- Modelo y fuentes ---
const Modelo: React.FC<{ e: EscenarioCU; plan: PlanDia | null; diseno: DisenoCU | null }> = ({ e, diseno }) => {
  const m = e.modelo;
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="font-semibold text-text-main mb-1">Pronóstico de demanda (IA)</h3>
        <p className="text-xs text-text-light mb-2">
          Gradient boosting entrenado con la afluencia diaria real de Metro Universidad y Copilco (datos abiertos CDMX, hasta {e.datos_hasta}),
          el calendario UNAM, días festivos y clima. Validado con {m.dias_prueba} días que el modelo no vio ({m.prueba_desde} a {m.prueba_hasta}).
        </p>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-gray-500"><th className="py-1">Método</th><th>Error promedio</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            <tr><td className="py-1 font-semibold">GenRutas (gradient boosting)</td><td className="font-bold text-green-700">{m.modelo.mape_pct}%</td></tr>
            <tr><td className="py-1">Mismo día de la semana anterior</td><td>{m.referencia_semana_anterior.mape_pct}%</td></tr>
            <tr><td className="py-1">Promedio por día de la semana</td><td>{m.referencia_promedio_dia_semana.mape_pct}%</td></tr>
          </tbody>
        </table>
      </div>
      <div className="text-xs text-text-light space-y-1">
        <p><b>Rutas actuales:</b> {e.rutas.length} rutas del Pumabús con trazo de OpenStreetMap ({e.rutas.map(r => r.ruta).join(', ')}).</p>
        <p><b>Paraderos:</b> {e.paraderos.length}, con peso según la matrícula de licenciatura de las facultades cercanas (Agenda Estadística UNAM 2025).</p>
        {e.horas_sol_pico && <p><b>Sol en CU:</b> {n(e.horas_sol_pico, 1)} horas solares pico al día (radiación horaria Open-Meteo/ERA5, último año).</p>}
        {diseno?.motor && <p><b>Motor:</b> matriz {diseno.motor.fuenteMatriz}, {diseno.motor.soluciones_frente} soluciones en el frente de Pareto.</p>}
      </div>
      {diseno?.motor?.graficas?.progreso_optimizacion && (
        <div className="space-y-2">
          <h3 className="font-semibold text-text-main">Algoritmo genético (NSGA-II)</h3>
          <p className="text-xs text-text-light">Convergencia en 100 generaciones y frente de Pareto de la última corrida de "Diseñar rutas".</p>
          <img src={diseno.motor.graficas.progreso_optimizacion} alt="Convergencia del NSGA-II" className="w-full rounded border" />
          {diseno.motor.graficas.soluciones_finales && <img src={diseno.motor.graficas.soluciones_finales} alt="Frente de Pareto" className="w-full rounded border" />}
        </div>
      )}
      <p className="text-xs text-gray-500">Datos de OpenStreetMap © colaboradores de OpenStreetMap (ODbL).</p>
    </div>
  );
};

export default PanelCU;
