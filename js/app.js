// app.js — Ensayos de Campo v2 (rubros, roles, control de parcela, mediciones, aplicaciones, análisis).
// Todo se guarda en este equipo (IndexedDB, ver db.js) y funciona sin internet.
import {anovaDBCA, tukey, interpretarCV, anovaCombinado, ladoALado, welch} from './estadistica.js';
import {enRect, enCuad, distancia, areaM2, svgMapa, desdeMerc, mover} from './lib/geo.js';
import * as DB from './db.js';
import {abrirLector, COL as COL_GOTA, NOMCL} from './papel.js';
import {combinarTarjetas, histDe, OBJETIVOS, claseASABE, CLASES, homografia, rectificar} from './lib/hidro.js';
import {crearZip, crearDocx, crearXlsx, crearCsv, crearGeojson, crearQml, crearKml, poligonosCroquis, graficoBarras} from './exportar.js';

/* ================= utilidades ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = (v, d = 2) => v == null || v === '' || isNaN(v) ? '—' : Number(v).toLocaleString('es-PY', {minimumFractionDigits: d, maximumFractionDigits: d});
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const HOY = hoyISO();
const fechaTxt = f => f ? f.split('-').reverse().join('/') : '';
const ahora = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2200); }
function seg(host, opts, val, on) {
  const el = typeof host === 'string' ? $(host) : host;
  el.innerHTML = opts.map(([v, l]) => `<button type="button" aria-pressed="${v === val}" data-v="${v}">${l}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if (!b) return; el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); on(b.dataset.v); };
}
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const PALETA = ['#8d8d8d', '#2f7fd1', '#e0a21a', '#c2410c', '#7c3aed', '#0f9d77', '#d6336c', '#5c6f2b', '#1c7ed6', '#a0522d'];

/* ================= datos ================= */
const [E0, CAT, MET, EJ] = await Promise.all(['./datos/ensayo_demo.json', './datos/catalogo.json', './datos/metodos.json', './datos/ensayos_ejemplo.json'].map(u => fetch(u).then(r => r.json())));
const catIdx = CAT.cols.reduce((o, c, i) => (o[c] = i, o), {});
const catByReg = new Map(CAT.rows.map(r => [Number(r[catIdx.reg]), r]));
const ALTERNATIVAS = {
  sev_roya: ['10 folíolos del tercio medio por parcela; % de área afectada con la escala diagramática de Godoy et al. (2006).', 'Índice de McKinney: escala 0–4 en 20 plantas por parcela.', 'Estimación visual del % de área foliar afectada en toda el área útil.'],
  severidad: ['10 hojas del tercio medio por parcela, % de área afectada con escala diagramática; a los 21 días de la aplicación.', 'Índice de McKinney: escala 0–4 en 20 plantas por parcela.', 'Estimación visual en toda el área útil.'],
  rend_kg: ['Cosechar las 2 hileras centrales × 5 m (sin cabeceras), trillar, pesar y medir humedad. Corregir a 13 % de humedad: P × (100 − H) / 87 y llevar a hectárea.', 'Cosecha con microcosechadora de parcelas y balanza integrada; humedad del equipo.', 'Monitor de rendimiento calibrado (franjas y lado a lado).'],
  rendimiento: ['Suma de todas las cosechas de las plantas útiles; kg/planta × plantas/ha / 1000.', 'Cosecha única del área útil pesada en balanza de campo.'],
  dap: ['Diámetro a 1,30 m con cinta diamétrica en los árboles útiles (sin borde); en pendiente, desde el lado de arriba.', 'Forcípula: promedio de dos lecturas perpendiculares.', 'Circunferencia (CAP) con cinta métrica; DAP = CAP / π.'],
  altura_m: ['Hipsómetro (Vertex, Suunto) en los árboles útiles o submuestra + relación hipsométrica.', 'Vara telescópica (árboles jóvenes, hasta 12 m).', 'Altura estimada desde modelo digital de superficie del dron.'],
  plantas_m: ['Contar plantas en 2 tramos de 1 m en las hileras centrales; se promedia.', 'Contar todas las plantas de las hileras útiles y dividir por los metros.'],
  ms: ['Cortar a la altura de corte todo el forraje dentro de un marco de 0,25 m² (2 marcos por parcela, al azar dentro del área útil). Pesar en verde, secar una submuestra de unos 300 g en estufa a 60–65 °C hasta peso constante (48–72 h). kg MS/ha = peso verde (g) ÷ área del marco (m²) × MS % ÷ 100 × 10.',
    'Cortar toda el área útil con motosegadora a la altura de corte, pesar el total en verde y secar una submuestra para el % de MS.',
    'Plato medidor de forraje calibrado con cortes (doble muestreo): 20 lecturas por parcela y la ecuación de calibración del ensayo.',
    'Estimación visual con doble muestreo: el evaluador puntúa la parcela y se calibra con cortes en algunas parcelas.'],
  altura_f: ['Regla graduada o bastón medidor: 10 lecturas por parcela en el área útil, desde el suelo hasta la curvatura de las hojas más altas (sin contar panojas), justo antes de cortar.', 'Altura comprimida con plato medidor (20 lecturas por parcela).', 'Altura del modelo digital de superficie del dron menos el suelo.'],
  pb: ['Nitrógeno Kjeldahl × 6,25 (o NIRS calibrado) en la submuestra seca y molida a 1 mm del corte elegido; en base seca. Indicar el corte o la edad de rebrote.', 'Combustión (Dumas) × 6,25.', 'NIRS con curva de calibración para gramíneas tropicales.'],
  comp_leg: ["Rango en peso seco ('t Mannetje y Haydock, 1963): en 20 marcos se anota qué especie ocupa el 1.º, 2.º y 3.º lugar en peso; % = 70,2 × fracción de 1.º + 21,1 × fracción de 2.º + 8,7 × fracción de 3.º.", 'Separación manual del forraje cortado en 2 marcos de 0,25 m² por parcela, secado por fracción.', 'Estimación visual del % de leguminosa calibrada con separación manual.']
};
const RUBROS = {
  agricola: {nombre: 'Agrícola', clase: 'r-agricola', texto: 'Granos, oleaginosas, algodón, caña y abonos verdes.', ej: 'Cultivares, fungicidas, herbicidas, fertilización, lado a lado',
    tipos: ['Cultivares (RNCC)', 'Eficacia de fungicida', 'Eficacia de insecticida', 'Eficacia de herbicida', 'Fertilización', 'Inoculante / bioinsumo', 'Densidad o época', 'Lado a lado'],
    cultivos: ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Canola', 'Arroz', 'Sésamo', 'Chía', 'Algodón', 'Sorgo'],
    icono: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 44V14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M24 20c-7-1-11-6-11-12 7 1 11 6 11 12Zm0 0c7-1 11-6 11-12-7 1-11 6-11 12Zm0 10c-7-1-11-6-11-12 7 1 11 6 11 12Zm0 0c7-1 11-6 11-12-7 1-11 6-11 12Z" fill="currentColor"/></svg>'},
  horticola: {nombre: 'Hortícola', clase: 'r-horticola', texto: 'Hortalizas y frutales, a campo o bajo cubierta.', ej: 'Híbridos, sanidad, fertirriego, sustratos, poscosecha',
    tipos: ['Cultivares / híbridos', 'Eficacia de fungicidas', 'Eficacia de insecticidas', 'Fertirriego', 'Sustratos', 'Cobertura del suelo', 'Poscosecha', 'Plantines'],
    cultivos: ['Tomate', 'Locote', 'Lechuga', 'Cebolla', 'Zanahoria', 'Frutilla', 'Melón', 'Sandía', 'Papa', 'Frutal en hileras'],
    icono: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="28" r="14" fill="currentColor"/><path d="M24 14c0-5 3-8 8-9M24 14c-4-4-9-4-12-2 3 3 8 4 12 2Z" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>'},
  forestal: {nombre: 'Forestal', clase: 'r-forestal', texto: 'Plantaciones, clones, nativas y silvopastoril.', ej: 'Clones, progenies, espaciamiento, fertilización, vivero',
    tipos: ['Clones', 'Procedencias', 'Progenies', 'Espaciamiento', 'Fertilización', 'Control de hormigas', 'Raleo y poda', 'Vivero'],
    cultivos: ['Eucalyptus grandis', 'Eucalyptus urograndis', 'Pinus taeda', 'Paraíso gigante', 'Kiri', 'Lapacho', 'Peterevy'],
    icono: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 10 24h8L8 36h32L30 24h8Z" fill="currentColor"/><rect x="21" y="36" width="6" height="8" rx="1" fill="currentColor"/></svg>'},
  pasturas: {nombre: 'Pasturas', clase: 'r-pasturas', texto: 'Gramíneas y leguminosas forrajeras, bajo corte o pastoreo.', ej: 'Cultivares, fertilización, frecuencia de corte, mezclas, pastoreo',
    tipos: ['Cultivares / especies forrajeras', 'Fertilización de pasturas', 'Frecuencia y altura de corte', 'Establecimiento y densidad de siembra', 'Mezclas gramínea–leguminosa', 'Control de malezas en pasturas', 'Control de salivazo', 'Recuperación de pasturas degradadas', 'Pastoreo y producción animal', 'Silvopastoril'],
    cultivos: ['Urochloa brizantha (Marandu)', 'Urochloa híbrida (Mulato II)', 'Megathyrsus maximus (Gatton panic)', 'Megathyrsus maximus (Mombaça)', 'Cenchrus ciliaris (Buffel)', 'Chloris gayana (Grama Rhodes)', 'Digitaria (Pangola)', 'Cynodon (Tifton 85)', 'Pennisetum purpureum (Camerún)', 'Avena o raigrás (invierno)', 'Alfalfa', 'Leucaena', 'Mezcla gramínea–leguminosa', 'Gramíneas tropicales'],
    icono: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 44c0-12 2-22 8-30M18 44c0-10 0-20-4-30M24 44c0-13 3-26 10-34M30 44c0-9 2-17 8-24M38 44c0-8-1-14-6-20" stroke="currentColor" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M6 44h36" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'}
};
const PERFILES = {independiente: 'Independiente', gerente: 'Gerente', operador: 'Operador', observador: 'Observador'};
const EQUIPOS = {eq1: {nombre: 'Equipo Itapúa', codigo: 'ITA-4821', ejemplo: true}};
const USERS = {
  marta: {id: 'marta', nombre: 'Marta Ortiz', perfil: 'gerente', equipo: 'eq1', color: '#1f6b52', ejemplo: true},
  ana: {id: 'ana', nombre: 'Ana Ramírez', perfil: 'operador', equipo: 'eq1', color: '#0e7490', ejemplo: true},
  luis: {id: 'luis', nombre: 'Luis Acosta', perfil: 'operador', equipo: 'eq1', color: '#b45309', ejemplo: true},
  carlos: {id: 'carlos', nombre: 'Carlos Giménez', perfil: 'independiente', equipo: null, color: '#7c3aed', ejemplo: true},
  pedro: {id: 'pedro', nombre: 'Pedro Duarte', perfil: 'operador', equipo: 'eq1', color: '#be185d', ejemplo: true},
  lucia: {id: 'lucia', nombre: 'Lucía Gómez', perfil: 'observador', equipo: null, color: '#475569', ejemplo: true}
};
const ini = n => n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
const avatar = u => `<span class="av" style="background:${u.color}">${ini(u.nombre)}</span>`;
const CUSTOM = []; // indicadores propios creados por el usuario
const PULV = []; // pulverizadoras (equipos de aplicación) con su calibración

const REFN = {'01': 'Guía de planificación', '04': 'Guía agrícola', '05': 'Guía hortícola', '06': 'Guía forestal', '12': 'Guía de dron', '14': 'Guía de pasturas'};
const refTxt = r => String(r || '').split(';').map(x => x.trim().replace(/^(\d\d)(_[a-z_]+)?/, (m, n) => REFN[n] || m)).join('; ');
function varDef(rubro, id) { const v = MET[rubro].find(m => m.id === id) || CUSTOM.find(m => m.id === id); return v ? structuredClone(v) : null; }

/* ----- ensayo rico (hortícola con dron) ----- */
function ensayoRico(E) {
  const T = {id: E.id, rubro: 'horticola', titulo: E.titulo, cultivo: E.cultivo, tipo: 'Eficacia de fungicidas', campana: E.campana,
    lugar: 'Imagen de ejemplo (EE. UU.)', owner: 'marta', equipo: 'eq1', bloques: E.bloques,
    parcela: {forma: 'dimensiones', ancho: E.parcela.ancho_m, largo: E.parcela.largo_m, area_m2: E.parcela.area_m2, area_util_m2: E.parcela.area_util_m2},
    tratamientos: E.tratamientos.map(t => ({...t})), imagen: E.imagen, dron: true, caldo: E.caldo_L_ha,
    variables: ['rendimiento', 'severidad', 'brix', 'ndvi', 'cobertura', 'temp'].map(id => varDef('horticola', id)),
    parcelas: E.parcelas.map(p => ({parcela: p.parcela, bloque: p.bloque, trat: p.trat, px: p.px, geo: p.geo,
      valores: {rendimiento: p.rendimiento, severidad: p.severidad, ndvi: p.ndvi, cobertura: p.cobertura, temp: p.temp}, sub: {}})),
    asig: {}, compartido: {carlos: 'lector'}, notas: [], cambios: []};
  T.parcelas.forEach(p => T.asig[p.parcela] = p.bloque <= 2 ? 'ana' : 'luis'); T.trabajo = {ana: 'parcelas', luis: 'parcelas'};
  T.notas.push(
    {nivel: 'parcela', ref: 204, texto: 'Sector norte con encharcamiento después de la lluvia del 12/11; revisar raíces.', autor: 'ana', fecha: '13/11 08:10'},
    {nivel: 'tratamiento', ref: 'T4', texto: 'El mancozeb deja residuo visible en las hojas hasta 3 días después de aplicar.', autor: 'marta', fecha: '06/11 17:40'},
    {nivel: 'bloque', ref: 3, texto: 'Bloque con pendiente: escurrimiento hacia el camino después de 45 mm.', autor: 'luis', fecha: '12/11 19:05'});
  T.cambios.push(
    {fecha: '14/11 09:42', usuario: 'ana', parcela: 204, variable: 'severidad', antes: 13.0, despues: T.parcelas.find(p => p.parcela === 204).valores.severidad, estado: 'pendiente'},
    {fecha: '14/11 10:15', usuario: 'luis', parcela: 305, variable: 'severidad', antes: null, despues: T.parcelas.find(p => p.parcela === 305).valores.severidad, estado: 'pendiente'},
    {fecha: '10/11 16:20', usuario: 'ana', parcela: 101, variable: 'rendimiento', antes: 25.9, despues: T.parcelas.find(p => p.parcela === 101).valores.rendimiento, estado: 'aprobado'});
  return T;
}
function ensayoSimple(J) {
  const T = {...J, dron: false, variables: J.variables.map(id => { const v = varDef(J.rubro, id); if (v && J.momentos?.[id]) v.momento = J.momentos[id]; return v; }).filter(Boolean),
    parcelas: J.parcelas.map(p => ({...p, valores: {...p.valores}, sub: structuredClone(p.sub || {})})), tratamientos: J.tratamientos.map(t => ({productos: [], ...t})),
    asig: Object.fromEntries(Object.entries(J.asig).map(([k, v]) => [Number(k), v])), trabajo: Object.fromEntries([...new Set(Object.values(J.asig))].map(u => [u, 'parcelas'])),
    notas: structuredClone(J.notas || []), cambios: structuredClone(J.cambios || []), aplicaciones: structuredClone(J.aplicaciones || []), compartido: {...(J.compartido || {})}};
  if (T.cortes) { T.porCorte = [...(T.porCorte || [])]; T.cortes = structuredClone(T.cortes); armarCortes(T); }
  return T;
}
/* ----- pasturas: variables por corte y calculadas ----- */
function armarCortes(T) {
  const base = T.variables.filter(v => !v.corte && v.origen !== 'calc'), nuevas = [];
  T.porCorte.forEach(b => { const d = varDef(T.rubro, b); if (!d) return;
    T.cortes.forEach(c => nuevas.push({...structuredClone(d), id: `${b}_c${c.n}`, base: b, corte: c.n, nombre: `${d.nombre} · corte ${c.n}`, momento: `Corte ${c.n} · ${fechaTxt(c.fecha)} · ${c.dias} días de rebrote`})); });
  if (T.porCorte.includes('ms') && T.cortes.length) {
    const u = varDef(T.rubro, 'ms');
    nuevas.push({id: 'ms_total', nombre: 'Producción acumulada de forraje', unidad: 'kg MS/ha', tipo: 'numero', dec: 0, sub: 1, origen: 'calc', calc: 'suma', metodo: `Suma de la materia seca de los ${T.cortes.length} cortes; se calcula sola cuando están todos cargados.`, ref: u.ref});
    nuevas.push({id: 'tasa', nombre: 'Tasa de crecimiento media', unidad: 'kg MS/ha/día', tipo: 'numero', dec: 1, sub: 1, origen: 'calc', calc: 'tasa', metodo: 'Producción acumulada ÷ días de rebrote sumados de todos los cortes.', ref: u.ref});
  }
  T.variables = [...nuevas, ...base]; recalc(T);
}
function recalc(T) {
  const calc = T.variables.filter(v => v.origen === 'calc'); if (!calc.length) return;
  const ms = T.variables.filter(v => v.base === 'ms'), dias = (T.cortes || []).reduce((s, c) => s + c.dias, 0);
  T.parcelas.forEach(p => { const vals = ms.map(v => p.valores[v.id]), ok = vals.length && vals.every(x => x != null && x !== ''), tot = ok ? vals.reduce((s, x) => s + +x, 0) : null;
    calc.forEach(v => { p.valores[v.id] = tot == null ? null : v.calc === 'suma' ? tot : +(tot / dias).toFixed(2); }); });
}
const TRIALS = [ensayoRico(E0), ...EJ.map(ensayoSimple)];
const byId = id => TRIALS.find(T => T.id === id);
byId('DEMO-AG-01').notas.push({nivel: 'bloque', ref: 'S1|1', texto: 'Bloque 1 junto a la cortina de árboles: sombra por la tarde en las primeras parcelas.', autor: 'marta', fecha: '02/12 11:30'});
byId('DEMO-FO-01').notas.push({nivel: 'tratamiento', ref: 'CL5', texto: 'Material de semilla con más fallas y rebrotes desparejos.', autor: 'carlos', fecha: '20/08 15:00'});
/* registro de aplicaciones y labores (lo que se va aplicando) */
TRIALS[0].aplicaciones = [
  {id: 1, tipo: 'Aplicación de tratamientos', fecha: '2026-09-09', estado: 'realizada', trats: ['T2', 'T3', 'T4', 'T5'], estadio: 'Inicio de floración', caldo: 400, cond: {t: 27, hr: 68, viento: 6}, resp: 'ana', obs: 'Mochila a presión constante, pastilla de cono hueco.'},
  {id: 2, tipo: 'Aplicación de tratamientos', fecha: '2026-10-03', estado: 'planificada', trats: ['T2', 'T3', 'T4', 'T5'], estadio: 'Fruto cuajado (2.ª aplicación, 24 días después)', caldo: 400, resp: 'ana'},
  {id: 3, tipo: 'Riego', fecha: '2026-09-18', estado: 'realizada', trats: 'todos', producto: 'Riego por goteo', dosis: '12 mm', resp: 'luis'}];
byId('DEMO-AG-01').aplicaciones = [
  {id: 1, tipo: 'Siembra o plantación', fecha: '2026-09-20', estado: 'realizada', trats: 'todos', producto: 'Semilla tratada', dosis: '14 semillas/m', estadio: 'Siembra', resp: 'ana', obs: 'Sembradora de parcelas; suelo con buena humedad.'},
  {id: 2, tipo: 'Fertilización', fecha: '2026-09-20', estado: 'realizada', trats: 'todos', producto: 'Fertilizante 0-20-20', dosis: '200 kg/ha', estadio: 'En la línea de siembra', resp: 'ana'},
  {id: 3, tipo: 'Fungicida', fecha: '2026-11-20', estado: 'planificada', trats: 'todos', producto: 'Fungicida de manejo general', dosis: 'según etiqueta', estadio: 'R3', resp: 'luis', obs: 'Igual en todo el ensayo, para no confundir el efecto de los cultivares.'}];
byId('DEMO-FO-01').aplicaciones = [
  {id: 1, tipo: 'Siembra o plantación', fecha: '2023-09-12', estado: 'realizada', trats: 'todos', producto: 'Plantines clonales', dosis: '1667 plantas/ha', estadio: 'Plantación', resp: 'carlos'},
  {id: 2, tipo: 'Control de plagas', fecha: '2026-09-01', estado: 'realizada', trats: 'todos', producto: 'Cebo hormiguicida', dosis: '8 g por hormiguero', estadio: '36 meses', cond: {t: 24, hr: 63, viento: 4}, resp: 'carlos', obs: 'Tres hormigueros activos en el bloque 2.'},
  {id: 3, tipo: 'Fertilización', fecha: '2026-10-15', estado: 'planificada', trats: 'todos', producto: 'NPK 10-20-10', dosis: '150 g por árbol', estadio: '37 meses', resp: 'carlos'}];
TRIALS.forEach(T => T.aplicaciones = T.aplicaciones || []);
TRIALS.forEach(T => T.ejemplo = true);
/* ================= datos guardados en este equipo ================= */
PULV.push(
  {id: 'pv-ej1', ejemplo: true, nombre: 'Barra de parcelas CO₂ (4 picos)', tipo: 'Mochila de presión constante (CO₂ o batería)', marca: 'Barra experimental', tanque: 2, picos: 4, sep: 50, altura: 50, faja: 2,
    boqTipo: 'Cono hueco', boqISO: '01', boqAng: 80, boqModelo: 'TXA 8001', presion: 2.8, vel: 3, caudales: [0.38, 0.37, 0.39, 0.4], fechaCal: '2026-01-05', obs: 'Presión regulada con manómetro a la salida del cilindro. Paso de 0,83 m/s (12 s cada 10 m).'},
  {id: 'pv-ej2', ejemplo: true, nombre: 'Pulverizador de arrastre 600 L', tipo: 'Pulverizador de arrastre o montado', marca: 'Barra de 12 m', tanque: 600, picos: 24, sep: 50, altura: 50, faja: 12,
    boqTipo: 'Abanico plano de baja deriva (preorificio)', boqISO: '02', boqAng: 110, boqModelo: 'AD 11002', presion: 3, vel: 12, caudales: [], fechaCal: '2025-10-15', obs: 'Para el manejo general del lote.'});
const SEMILLA = JSON.stringify({trials: TRIALS, users: USERS, equipos: EQUIPOS, pulv: PULV});
const META = {};
let ESTADO_DB = 'ok', SESION = null;
const GUARD = await DB.cargarTodo().catch(e => { console.error(e); ESTADO_DB = 'error'; return null; });
function cargarEstado(ensayos, cfg) {
  TRIALS.length = 0; ensayos.forEach(T => TRIALS.push(T));
  Object.keys(USERS).forEach(k => delete USERS[k]); Object.assign(USERS, cfg.perfiles || {});
  Object.keys(EQUIPOS).forEach(k => delete EQUIPOS[k]); Object.assign(EQUIPOS, cfg.equipos || {});
  CUSTOM.length = 0; CUSTOM.push(...(cfg.custom || []));
  PULV.length = 0; PULV.push(...(cfg.pulv || []));
  Object.keys(META).forEach(k => delete META[k]); Object.assign(META, cfg.meta || {});
  SESION = cfg.sesion || null;
}
if (GUARD?.config) cargarEstado(GUARD.ensayos, GUARD.config);
else META.creado = new Date().toISOString();
const EJ_ = () => byId('DEMO-AG-02'), PA_ = () => byId('DEMO-PA-01'), RED_ = () => byId('DEMO-AG-01'), LAL_ = () => byId('DEMO-LAL-01');

/* ================= estado y permisos ================= */
const S = {user: null, rubro: null, T: null, paso: 0, sel: null, sitio: null};
var ULT_LISTO = false;
try { const r = localStorage.getItem('ec-rubro'); if (r && RUBROS[r]) S.rubro = r; } catch (e) {}

const sitioDe = (T, pn) => T.sitios?.find(s => s.n === Math.floor(pn / 1000));
const tieneOp = (T, pn, uid) => T.asig[pn] === uid || T.trabajo?.[uid] === 'ensayo' || !!sitioDe(T, pn)?.ops?.includes(uid);
const asigDe = (T, pn) => USERS[T.asig[pn]] || USERS[sitioDe(T, pn)?.ops?.[0]] || USERS[Object.keys(T.trabajo || {}).find(k => T.trabajo[k] === 'ensayo')];
const sitiosDeOp = (T, uid) => (T.sitios || []).filter(s => s.ops?.includes(uid));
const refBloque = (T, p) => T.sitios ? `${p.sitio}|${p.bloque}` : p.bloque;
const nomSitio = (T, id) => T.sitios?.find(s => s.id === id)?.nombre || id;
const etiq = (T, p) => T.sitios ? `${nomSitio(T, p.sitio)} · ${p.parcela % 1000}` : String(p.parcela);
const enSitio = (T, lista = T.parcelas) => T.sitios && S.sitio && S.sitio !== 'todos' ? lista.filter(p => p.sitio === S.sitio) : lista;
function vistaS(T, sid = S.sitio) { if (!T.sitios || !sid || sid === 'todos') return T; const v = Object.create(T); v.parcelas = T.parcelas.filter(p => p.sitio === sid); v.__vista = sid; return v; }
function avance(T, ps) { const vars = T.variables.filter(v => !auto(v) && v.tipo !== 'texto'), tot = vars.length * ps.length; return tot ? ps.reduce((s, p) => s + vars.filter(v => p.valores[v.id] != null && p.valores[v.id] !== '').length, 0) / tot : 1; }
/* ----- ensayo en varios lugares (red) ----- */
function croquisSitio(T, n, sid) { const rnd = mulberry((Date.now() + n * 7919) % 100000), out = [];
  for (let b = 1; b <= T.bloques; b++) { const orden = T.tratamientos.map(t => t.cod).sort(() => rnd() - 0.5); orden.forEach((c, i) => out.push({parcela: n * 1000 + b * 100 + i + 1, bloque: b, trat: c, sitio: sid, valores: {}, sub: {}})); }
  return out; }
async function convertirARed(T) {
  if (T.sitios) return; const mapa = new Map(T.parcelas.map(p => [p.parcela, 1000 + p.parcela]));
  T.sitios = [{id: 'S1', n: 1, nombre: (T.lugar || 'Lugar 1').split(',')[0], lugar: T.lugar || '', ops: Object.keys(T.trabajo || {}).filter(u => T.trabajo[u]), geo: T.geo || null}];
  T.parcelas.forEach(p => { p.parcela = mapa.get(p.parcela); p.sitio = 'S1'; });
  T.asig = Object.fromEntries(Object.entries(T.asig).map(([k, v]) => [mapa.get(+k) || k, v]));
  T.notas.forEach(n => { if (n.nivel === 'parcela' && mapa.has(+n.ref)) n.ref = mapa.get(+n.ref); if (n.nivel === 'bloque' && !String(n.ref).includes('|')) n.ref = `S1|${n.ref}`; });
  T.cambios.forEach(c => { if (mapa.has(+c.parcela)) c.parcela = mapa.get(+c.parcela); });
  T.aplicaciones.forEach(a => { if (!a.sitio) a.sitio = 'S1'; }); delete T.geo;
  try { for (const im of await DB.imagenesDe(T.id)) if (im.parcela != null && mapa.has(+im.parcela)) await DB.guardarImagen({...im, parcela: mapa.get(+im.parcela)}); } catch (e) { console.warn(e); }
}
async function agregarSitio(T, nombre, lugar, ops = []) {
  await convertirARed(T); const n = Math.max(...T.sitios.map(x => x.n)) + 1, id = 'S' + n;
  T.sitios.push({id, n, nombre: nombre || `Lugar ${n}`, lugar: lugar || '', ops, geo: null});
  T.parcelas.push(...croquisSitio(T, n, id)); T.lugar = `${T.sitios.length} lugares (red)`;
  T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: 'Lugar agregado', antes: null, despues: `${nombre} (${lugar})`, estado: 'aprobado'});
  return id;
}
function infoSitio(T, st) {
  const ps = T.parcelas.filter(p => p.sitio === st.id), pend = T.cambios.filter(c => c.estado === 'pendiente' && Math.floor(+c.parcela / 1000) === st.n).length;
  const ap = T.aplicaciones.filter(a => a.sitio === st.id || !a.sitio || a.sitio === 'todos'), hechas = ap.filter(a => a.estado === 'realizada').sort((a, b) => b.fecha.localeCompare(a.fecha)), prox = ap.filter(a => a.estado !== 'realizada').sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  return {ps, pr: avance(T, ps), pend, ult: hechas[0], prox};
}
function tablaSitios(T) {
  const gestion = puede.asignar(T), cand = operadoresEquipo(T);
  return `<div class="sitios">${T.sitios.map(st => { const i = infoSitio(T, st);
    return `<div class="card sitio"><div class="row" style="justify-content:space-between"><h3>${esc(st.nombre)}</h3><span class="chip ${i.pr >= 1 ? 'ok' : i.pr > 0 ? 'acc' : 'neu'}">${Math.round(i.pr * 100)} %</span></div>
      <span class="note">${esc(st.lugar || '')}</span><span class="bar"><i style="width:${Math.round(i.pr * 100)}%"></i></span>
      <div class="row" style="gap:6px">${(st.ops || []).map(id => USERS[id] ? `<span class="row" style="gap:5px">${avatar(USERS[id])}<span style="font-size:.86rem">${esc(USERS[id].nombre)}</span></span>` : '').join('') || '<span class="note">Sin operador asignado</span>'}</div>
      <span class="note">${i.ult ? `Última: ${esc(i.ult.tipo)} ${cuando(i.ult.fecha)}` : 'Sin aplicaciones registradas'}${i.prox ? ` · Próxima: ${esc(i.prox.tipo)} ${cuando(i.prox.fecha)}` : ''}${i.pend ? ` · <b>${i.pend} cambio${i.pend > 1 ? 's' : ''} por revisar</b>` : ''}</span>
      <div class="row" style="gap:6px"><button class="btn small" data-ver-sitio="${st.id}">Ver croquis y datos</button>
        ${gestion ? `<select data-sitio-op="${st.id}" aria-label="Operador de ${esc(st.nombre)}"><option value="">Asignar operador…</option>${cand.map(u => `<option value="${u.id}" ${(st.ops || []).includes(u.id) ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select>` : ''}
        ${gestion && (st.ops || []).length ? `<button class="btn small" data-enviar="${st.ops[0]}" data-sitio="${st.id}">📤 Enviar a ${esc(USERS[st.ops[0]]?.nombre.split(' ')[0] || '')}</button>` : ''}</div></div>`; }).join('')}</div>`;
}
function clicSitios(e, T) {
  const v = e.target.closest('[data-ver-sitio]'); if (v) { S.sitio = v.dataset.verSitio; irPaso(PASOS.findIndex(x => x[0] === 'campo')); scrollTo({top: 0}); return true; }
  const en = e.target.closest('[data-enviar]'); if (en) { enviarPaquete(T, en.dataset.enviar); return true; }
  return false;
}
function cambioSitioOp(e, T) {
  const sel = e.target.dataset.sitioOp; if (sel == null) return false; const st = T.sitios.find(x => x.id === sel), id = e.target.value;
  st.ops = id ? [id] : []; if (id && !T.equipo) T.invitados = [...new Set([...(T.invitados || []), id])];
  T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: `Operador de ${st.nombre}`, antes: null, despues: id ? USERS[id].nombre : 'Sin operador', estado: 'aprobado'});
  toast(id ? `${USERS[id].nombre} asignado a ${st.nombre}` : `${st.nombre} sin operador`); return true;
}
function barraSitios(T) {
  const b = $('#e-sitios'); if (!T.sitios) { b.hidden = true; b.innerHTML = ''; return; }
  if (!S.sitio || (S.sitio !== 'todos' && !T.sitios.some(x => x.id === S.sitio))) S.sitio = rolEn(T) === 'operador' ? (sitiosDeOp(T, S.user.id)[0]?.id || T.sitios[0].id) : 'todos';
  b.hidden = false; b.innerHTML = `<span class="note">Lugar:</span><div class="seg" id="seg-sitio"></div>`;
  seg('#seg-sitio', [['todos', `Todos (${T.sitios.length})`], ...T.sitios.map(x => [x.id, x.nombre + (sitiosDeOp(T, S.user.id).some(y => y.id === x.id) ? ' ★' : '')])], S.sitio, v => { S.sitio = v; cerrarDrawer(); mapa.reset(); RENDER[PASOS[S.paso][0]](S.T); vozEn(P()); });
}
function rolEn(T, u = S.user) {
  if (!u || !T) return null;
  if (T.owner === u.id) return 'dueño';
  if (T.equipo && u.equipo === T.equipo && u.perfil === 'gerente') return 'gerente';
  if (u.perfil === 'operador' && (Object.values(T.asig).includes(u.id) || T.trabajo?.[u.id] || sitiosDeOp(T, u.id).length)) return 'operador';
  if (T.compartido?.[u.id]) return T.compartido[u.id];
  return null;
}
const ROLNOM = {dueño: 'Dueño', gerente: 'Gerente', operador: 'Operador', lector: 'Observador', editor: 'Editor'};
const puede = {
  diseno: T => ['dueño', 'gerente', 'editor'].includes(rolEn(T)),
  asignar: T => ['dueño', 'gerente'].includes(rolEn(T)),
  revisar: T => ['dueño', 'gerente'].includes(rolEn(T)),
  datos: (T, p) => { const r = rolEn(T); return ['dueño', 'gerente', 'editor'].includes(r) || (r === 'operador' && tieneOp(T, p, S.user.id)); },
  nota: (T, nivel, ref) => { const r = rolEn(T); if (!r || r === 'lector') return false; if (r !== 'operador') return true;
    if (nivel === 'parcela') return tieneOp(T, ref, S.user.id);
    if (nivel === 'bloque') return T.parcelas.some(p => String(refBloque(T, p)) === String(ref) && tieneOp(T, p.parcela, S.user.id));
    return T.parcelas.some(p => p.trat === ref && tieneOp(T, p.parcela, S.user.id)); }
};
const visibles = rubro => TRIALS.filter(T => T.rubro === rubro && rolEn(T));
const colTrat = T => Object.fromEntries(T.tratamientos.map((t, i) => [t.cod, T.modo === 'lal' ? ({A: '#2563eb', B: '#d97706', C: '#6b7280', D: '#16a34a'}[t.cod] || PALETA[i % PALETA.length]) : PALETA[i % PALETA.length]]));
const tratNom = (T, c) => T.tratamientos.find(t => t.cod === c)?.nombre || c;
const vis = T => T.variables.filter(v => T.dron || v.origen !== 'dron');
const auto = v => v.origen === 'dron' || v.origen === 'calc';
const pendientes = (T, p) => T.variables.filter(v => !auto(v) && v.tipo !== 'texto' && (p.valores[v.id] == null || p.valores[v.id] === ''));
const operadoresEquipo = T => T.equipo ? Object.values(USERS).filter(u => u.perfil === 'operador' && u.equipo === T.equipo) : (T.invitados || []).map(id => USERS[id]).filter(Boolean);

/* ================= navegación ================= */
function pantalla(id) {
  ['bienvenida', 'rubro', 'inicio', 'nuevo', 'ensayo'].forEach(s => $('#s-' + s).hidden = s !== id);
  $('#appbar').hidden = id === 'bienvenida';
  if (S.user) {
    $('#bar-user').innerHTML = `${avatar(S.user)}<span>${esc(S.user.nombre)}</span><span class="chip neu">${PERFILES[S.user.perfil]}</span>`;
    $('#bar-rubro').innerHTML = S.rubro ? `<span class="swatch" style="background:var(--${S.rubro.slice(0, 3)})"></span>${RUBROS[S.rubro].nombre}` : 'Elegir rubro';
  }
  scrollTo({top: 0}); if (typeof guardarPronto === 'function' && ULT_LISTO) guardarPronto();
}
$('#bar-user').onclick = () => { cerrarDrawer(); S.user = null; S.T = null; pantalla('bienvenida'); };
$('#bar-rubro').onclick = () => { cerrarDrawer(); irRubro(); };

/* ================= bienvenida ================= */
function segAcceso(v) { seg('#seg-acceso', [['ingresar', 'Elegir perfil'], ['crear', 'Crear perfil']], v, x => segAcceso(x));
  $('#acc-ingresar').hidden = v !== 'ingresar'; $('#acc-crear').hidden = v !== 'crear'; }
const DESCR = {marta: 'Equipo Itapúa · asigna parcelas y revisa cambios', ana: 'Equipo Itapúa · Hohenau y bloques 1-2 del ensayo de fungicidas', luis: 'Equipo Itapúa · Naranjal y bloques 3-4 del ensayo de fungicidas', pedro: 'Equipo Itapúa · lugar de San Pedro', lucia: 'Observadora: ve los avances sin modificar', carlos: 'Trabaja por su cuenta (forestal y pasturas) · ve ensayos de Marta como lector'};
function listaCuentas() {
  const propios = Object.values(USERS).filter(u => !u.ejemplo), ej = Object.values(USERS).filter(u => u.ejemplo);
  const b = u => `<button class="acct" data-u="${u.id}">${avatar(u)}<span><b>${esc(u.nombre)}</b><br><span class="note">${esc((u.ejemplo && DESCR[u.id]) || (u.equipo ? EQUIPOS[u.equipo]?.nombre || 'Equipo' : 'Trabaja por su cuenta'))}</span></span><span class="chip neu">${PERFILES[u.perfil]}</span></button>`;
  $('#cuentas-txt').innerHTML = propios.length ? 'Elegí tu perfil para entrar.' : '<button class="btn primary" type="button" id="btn-crear-perfil" style="width:100%;box-sizing:border-box">+ Crear mi perfil</button><span style="display:block;margin-top:8px">O mirá cómo funciona entrando con un perfil de ejemplo:</span>';
  const bc = $('#btn-crear-perfil'); if (bc) bc.onclick = () => { segAcceso('crear'); $('#nc-nombre').focus(); };
  $('#lista-cuentas').innerHTML = propios.map(b).join('') + (ej.length ? `<div class="cuentas-tit">Perfiles de ejemplo</div>${ej.map(b).join('')}` : '');
  segAcceso(propios.length || ej.length ? 'ingresar' : 'crear');
}
listaCuentas();
$('#lista-cuentas').onclick = e => { const b = e.target.closest('[data-u]'); if (b) entrar(USERS[b.dataset.u]); };
let ncPerfil = 'independiente';
const PERF_TXT = {observador: 'Miro los avances de los ensayos que me comparten, sin modificar nada', independiente: 'Trabajo solo y puedo sumar operadores', gerente: 'Organizo un equipo y reviso', operador: 'Cargo datos de parcelas asignadas'};
function perfilesUI() { $('#nc-perfiles').innerHTML = Object.entries(PERFILES).map(([k, v]) => `<button type="button" class="perfil" aria-pressed="${k === ncPerfil}" data-p="${k}"><b>${v}</b>${PERF_TXT[k]}</button>`).join(''); $('#nc-codigo-l').hidden = ncPerfil !== 'operador'; }
perfilesUI();
$('#nc-perfiles').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { ncPerfil = b.dataset.p; perfilesUI(); } };
$('#acc-crear').addEventListener('submit', e => {
  e.preventDefault();
  const nombre = $('#nc-nombre').value.trim(); if (!nombre) { $('#nc-msg').textContent = 'Escribí tu nombre para crear la cuenta.'; return; }
  let equipo = null;
  if (ncPerfil === 'operador') { const c = $('#nc-codigo').value.trim().toUpperCase(); equipo = Object.keys(EQUIPOS).find(k => EQUIPOS[k].codigo === c);
    if (!equipo) { $('#nc-msg').textContent = 'Ese código no corresponde a ningún equipo de este equipo. Pedíselo a tu gerente (en los ejemplos: ITA-4821).'; return; } }
  if (ncPerfil === 'gerente') { equipo = 'eq' + (Object.keys(EQUIPOS).length + 1); EQUIPOS[equipo] = {nombre: 'Equipo de ' + nombre.split(' ')[0], codigo: 'EQ-' + Math.floor(1000 + Math.random() * 9000)}; }
  const id = 'u' + Date.now(); USERS[id] = {id, nombre, perfil: ncPerfil, equipo, color: PALETA[(Object.keys(USERS).length + 3) % PALETA.length], creado: new Date().toISOString()};
  $('#nc-nombre').value = ''; $('#nc-codigo').value = ''; $('#nc-msg').textContent = ''; listaCuentas(); entrar(USERS[id]); toast('Perfil creado'); guardarAhora();
});
function entrar(u) { S.user = u; irRubro(); }

/* ================= rubro ================= */
function irRubro() {
  $('#rubro-hola').textContent = `Hola, ${S.user.nombre.split(' ')[0]}. ¿En qué rubro vas a trabajar?`;
  $('#rubros').innerHTML = Object.entries(RUBROS).map(([k, r]) => { const n = visibles(k).length;
    return `<button class="rubro ${r.clase}" data-r="${k}">${r.icono}<h2>${r.nombre}</h2><p>${r.texto}</p><p class="ej">${r.ej}</p><span class="chip neu" style="justify-self:start">${n ? n + (n === 1 ? ' ensayo' : ' ensayos') : 'Sin ensayos todavía'}</span></button>`; }).join('');
  pantalla('rubro');
}
$('#rubros').onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; S.rubro = b.dataset.r; try { localStorage.setItem('ec-rubro', S.rubro); } catch (x) {} irInicio(); };

/* ================= inicio del rubro ================= */
function progreso(T) { const vars = T.variables.filter(v => !auto(v) && v.tipo !== 'texto'); const tot = vars.length * T.parcelas.length; if (!tot) return 1;
  return T.parcelas.reduce((s, p) => s + vars.filter(v => p.valores[v.id] != null && p.valores[v.id] !== '').length, 0) / tot; }
function irInicio() {
  const R = RUBROS[S.rubro], u = S.user, lista = visibles(S.rubro), op = u.perfil === 'operador', obs = u.perfil === 'observador';
  let h = `<div class="row" style="justify-content:space-between"><div style="display:grid;gap:4px"><span class="chip neu" style="justify-self:start">${R.nombre}</span><h1>${op ? 'Mis tareas' : obs ? 'Ensayos que observás' : 'Mis ensayos'}</h1></div>
    <div class="row"><button class="btn" id="btn-recibir">📥 Recibir archivo</button>${op || obs ? '' : '<button class="btn primary" id="btn-nuevo">+ Nuevo ensayo</button>'}</div></div>`;
  if (op) {
    const tareas = lista.map(T => ({T, ps: T.parcelas.filter(p => tieneOp(T, p.parcela, u.id))}));
    h += tareas.length ? tareas.map(({T, ps}) => { const pend = ps.filter(p => pendientes(T, p).length);
      if (!ps.length) return `<div class="card"><div class="trial"><div><h3>${esc(T.titulo)}</h3><div class="note">${T.id} · te sumó ${esc(USERS[T.owner]?.nombre || '')} a este trabajo</div></div><button class="btn" data-abrir="${T.id}">Ver ensayo</button></div><p class="note" style="margin:0">Todavía no tenés parcelas asignadas en este ensayo.</p></div>`;
      return `<div class="card"><div class="trial"><div><h3>${esc(T.titulo)}</h3><div class="note">${T.id} · asignado por ${esc(USERS[T.owner]?.nombre || '')} · ${sitiosDeOp(T, u.id).length ? 'Lugar: ' + sitiosDeOp(T, u.id).map(x => esc(x.nombre + (x.lugar ? ' (' + x.lugar + ')' : ''))).join(', ') : T.trabajo?.[u.id] === 'ensayo' ? 'todo el ensayo' : ps.length + ' parcelas'}</div></div>
        <button class="btn" data-abrir="${T.id}">Abrir ensayo</button></div>
        <div>${[...ps].sort((x, y) => (pendientes(T, y).length > 0) - (pendientes(T, x).length > 0)).slice(0, 6).map(p => { const pe = pendientes(T, p); return `<div class="task"><span class="pnum">${T.sitios ? p.parcela % 1000 : p.parcela}</span><span>Bloque ${p.bloque} · ${esc(tratNom(T, p.trat))}<br><span class="note">${pe.length ? 'Falta: ' + pe.map(v => v.nombre).join(', ') : 'Todo cargado'}</span></span>
          <button class="btn small ${pe.length ? 'primary' : ''}" data-ctl="${T.id}|${p.parcela}">Controlar</button></div>`; }).join('')}</div>
        <p class="note" style="margin:0">${pend.length} de ${ps.length} parcelas con mediciones pendientes.${ps.length > 6 ? ` Se muestran las primeras 6; el resto está en “Abrir ensayo” → Carga de datos.` : ''}</p></div>`; }).join('')
      : `<div class="card"><h3>Todavía no tenés parcelas asignadas en ${R.nombre.toLowerCase()}</h3><p class="note" style="margin:0">${u.equipo ? `Tu gerente del ${esc(EQUIPOS[u.equipo].nombre)} te asigna parcelas y aparecen acá.` : 'Uní tu cuenta a un equipo con el código de tu gerente.'} Probá con otro rubro desde el botón de arriba.</p></div>`;
  } else {
    const rev = lista.filter(T => puede.revisar(T)).reduce((s, T) => s + T.cambios.filter(c => c.estado === 'pendiente').length, 0);
    if (lista.length) {
      h += `<div class="grid2">${lista.map(T => { const r = rolEn(T), pr = progreso(T), pc = T.cambios.filter(c => c.estado === 'pendiente').length;
        return `<div class="card"><div class="trial"><div><h3>${esc(T.titulo)}</h3><div class="note">${T.id} · ${esc(T.cultivo)} · ${esc(T.lugar || '')}</div></div><span class="chip ${r === 'lector' ? 'neu' : 'acc'}">${ROLNOM[r]}</span></div>
        <div class="row note">${T.tratamientos.length} tratamientos × ${T.bloques} bloques${r === 'lector' ? ` · compartido por ${esc(USERS[T.owner].nombre)}` : ''}${puede.revisar(T) && pc ? ` · <span class="chip warn">${pc} cambios por revisar</span>` : ''}</div>
        <div style="display:grid;gap:4px"><div class="bar"><i style="width:${Math.round(pr * 100)}%"></i></div><span class="note">${Math.round(pr * 100)} % de las mediciones cargadas</span></div>
        ${T.sitios ? `<div class="mini-sitios">${T.sitios.map(st => { const x = avance(T, T.parcelas.filter(p => p.sitio === st.id)); return `<span><b>${esc(st.nombre)}</b> ${Math.round(x * 100)} %<span class="bar"><i style="width:${Math.round(x * 100)}%"></i></span></span>`; }).join('')}</div>` : ''}
        <div class="row"><button class="btn primary" data-abrir="${T.id}">Abrir</button>${puede.revisar(T) ? `<button class="btn" data-abrir="${T.id}" data-paso="equipo">Equipo y cambios</button>` : ''}</div></div>`; }).join('')}</div>`;
    } else if (obs) h += `<div class="card"><h3>Todavía no observás ensayos de ${R.nombre.toLowerCase()}</h3><p class="note" style="margin:0">Cuando el gerente o el responsable te comparta un ensayo, aparece acá. Si te lo mandó como archivo (por WhatsApp o correo), tocá <b>📥 Recibir archivo</b>. Probá también otro rubro desde el botón de arriba.</p></div>`;
    else h += `<div class="card como"><h3>Así se trabaja un ensayo</h3><ol class="pasos3">
        <li><b>Crealo</b><span>Tocá <b>+ Nuevo ensayo</b>: nombre, cultivo, tratamientos y qué vas a medir. La app sortea el croquis.</span></li>
        <li><b>Cargá en el campo</b><span>Tocá cada parcela para anotar lo que medís, sacar fotos y dejar notas. Registrá cada aplicación.</span></li>
        <li><b>Mirá los resultados</b><span>Con todo cargado, la app hace el análisis y arma el informe en Word, Excel o PDF.</span></li></ol>
        <div class="row"><button class="btn primary" id="btn-nuevo-2">+ Crear mi primer ensayo</button><button class="btn" id="btn-ver-ej">Ver cómo funciona</button></div></div>`;
    if (u.equipo && u.perfil === 'gerente') {
      const eq = EQUIPOS[u.equipo], miembros = Object.values(USERS).filter(x => x.equipo === u.equipo);
      h += `<div class="card"><div class="row" style="justify-content:space-between"><h3>${esc(eq.nombre)}</h3><span class="note">Código de invitación <b class="code">${eq.codigo}</b></span></div>
        <div class="row">${miembros.map(m => `<span class="row" style="gap:6px">${avatar(m)}<span>${esc(m.nombre)} <span class="note">· ${PERFILES[m.perfil]}</span></span></span>`).join('')}</div>
        <p class="note" style="margin:0">Los operadores se suman con el código. ${rev ? `Tenés <b>${rev}</b> cambios por revisar en este rubro.` : ''}</p></div>`;
    }
  }
  $('#s-inicio').innerHTML = bannerInstalar() + h;
  pantalla('inicio');
}
$('#s-inicio').addEventListener('click', e => {
  const n = e.target.closest('#btn-nuevo, #btn-nuevo-2'); if (n) return nuevoEnsayo();
  if (e.target.closest('#btn-recibir')) return recibirArchivo();
  if (e.target.closest('#btn-ver-ej')) return tourEmpezar(0);
  if (e.target.closest('#ban-cerrar')) { META.ocultarInstalar = true; guardarPronto(); return e.target.closest('.banner').remove(); }
  if (e.target.closest('#ban-como')) return abrirInstalar();
  const a = e.target.closest('[data-abrir]'); if (a) return abrir(TRIALS.find(T => T.id === a.dataset.abrir), a.dataset.paso || null);
  const c = e.target.closest('[data-ctl]'); if (c) { const [id, p] = c.dataset.ctl.split('|'); const T = TRIALS.find(x => x.id === id); abrir(T, 'campo'); abrirDrawer(Number(p)); }
});

/* ================= nuevo ensayo ================= */
const NV = {};
const opsDisponibles = () => (S.user.perfil === 'gerente' ? Object.values(USERS).filter(u => u.perfil === 'operador' && u.equipo === S.user.equipo) : S.user.perfil === 'operador' ? [] : Object.values(USERS).filter(u => u.perfil === 'operador')).filter(u => !u.ejemplo || S.user.ejemplo);
function nuevoEnsayo() {
  const R = RUBROS[S.rubro];
  Object.assign(NV, {paso: 1, titulo: '', cultivo: R.cultivos[0], tipo: R.tipos[0], lugar: '', otros: '', bloques: 4,
    trats: S.rubro === 'forestal' ? 'Testigo comercial\nClon A\nClon B\nClon C' : S.rubro === 'pasturas' ? 'Marandu (testigo)\nCultivar 2\nCultivar 3\nCultivar 4\nCultivar 5' : 'Testigo sin tratar\nTratamiento 2\nTratamiento 3\nTratamiento 4\nTratamiento 5',
    par: S.rubro === 'agricola' ? {hileras: 4, dist: 0.45, largo: 5, util: 2} : S.rubro === 'horticola' ? {plantas: 20, utiles: 12, entre: 1.2, sobre: 0.4} : S.rubro === 'pasturas' ? {ancho: 3, largo: 5, borde: 0.5, marco: 0.25, marcos: 2, altura_corte: 20} : {filas: 5, columnas: 5, e1: 3, e2: 2, borde: 1},
    vars: new Set(MET[S.rubro].filter(v => v.origen !== 'dron').slice(0, 3).map(v => v.id)), ops: new Set(), modoOps: 'bloques', dron: false,
    modo: 'dbca', productor: '', lote: '', escala: 'macro', testigo: false, pares: 1, puntos: ESCALAS.macro.puntos, lal: {...ESCALAS.macro, sep: 0},
    lados: [{nombre: 'Producto a probar', prod: '', dosis: '', unidad: 'L/ha'}, {nombre: 'Producto del productor', prod: '', dosis: '', unidad: 'L/ha'}]});
  renderNuevo(); pantalla('nuevo');
}
function areaNueva() {
  const p = NV.par;
  if (S.rubro === 'agricola') return {area: p.hileras * p.dist * p.largo, util: p.util * p.dist * Math.max(0, p.largo - 1), txt: `${p.hileras} hileras × ${p.dist} m × ${p.largo} m`};
  if (S.rubro === 'horticola') return {area: p.plantas * p.entre * p.sobre, util: p.utiles * p.entre * p.sobre, txt: `${p.plantas} plantas a ${p.entre} × ${p.sobre} m`};
  if (S.rubro === 'pasturas') return {area: p.ancho * p.largo, util: Math.max(0, p.ancho - 2 * p.borde) * Math.max(0, p.largo - 2 * p.borde), txt: `${p.ancho} × ${p.largo} m, ${p.marcos} marcos de ${p.marco} m² por corte, corte a ${p.altura_corte} cm`};
  return {area: p.filas * p.columnas * p.e1 * p.e2, util: Math.max(0, p.filas - 2 * p.borde) * Math.max(0, p.columnas - 2 * p.borde) * p.e1 * p.e2, txt: `${p.filas} × ${p.columnas} árboles a ${p.e1} × ${p.e2} m`};
}
function renderNuevo() {
  const R = RUBROS[S.rubro], trs = NV.trats.split('\n').map(s => s.trim()).filter(Boolean), gl = (trs.length - 1) * (NV.bloques - 1), A = areaNueva();
  const lal = NV.modo === 'lal', pasos = lal ? ['Datos', 'Productos y franjas', 'Qué vas a medir'] : ['Datos', 'Parcela y tratamientos', 'Qué vas a medir'];
  let h = `<div class="row" style="justify-content:space-between"><div style="display:grid;gap:4px"><button class="linkbtn" id="nv-cancel" style="justify-self:start">← Cancelar</button><h1>${lal ? 'Nuevo lado a lado' : 'Nuevo ensayo'} ${R.nombre.toLowerCase()}</h1></div>
    <div class="row">${pasos.map((p, i) => `<span class="chip ${i + 1 === NV.paso ? 'acc' : 'neu'}">${i + 1}. ${p}</span>`).join('')}</div></div><div class="card" style="gap:14px">`;
  if (NV.paso === 1) {
    h += `<div class="modos" role="radiogroup" aria-label="Qué querés hacer">
      <label class="modo ${!lal ? 'on' : ''}"><input type="radio" name="nv-modo-t" value="dbca" ${!lal ? 'checked' : ''}><b>🧪 Ensayo experimental</b><span>Varios tratamientos en bloques al azar, con análisis estadístico (ANAVA y Tukey).</span></label>
      <label class="modo ${lal ? 'on' : ''}"><input type="radio" name="nv-modo-t" value="lal"><b>↔️ Lado a lado en la parcela del productor</b><span>Para probar la eficacia de un producto contra el que usa el productor, en macroparcelas o microparcelas. No es un ensayo experimental.</span></label></div>`;
  }
  if (NV.paso === 1 && lal) {
    h += `<div class="grid2"><label class="f">Nombre<input type="text" id="nv-titulo" value="${esc(NV.titulo)}" placeholder="Ej.: Fungicida nuevo vs. el del productor, soja"></label>
      <label class="f">Productor<input type="text" id="nv-productor" value="${esc(NV.productor)}" placeholder="Nombre del productor o empresa"></label>
      <label class="f">Establecimiento o lote<input type="text" id="nv-lote" value="${esc(NV.lote)}" placeholder="Ej.: Estancia San José, lote 4"></label>
      <label class="f">Lugar<input type="text" id="nv-lugar" value="${esc(NV.lugar)}" placeholder="Distrito, departamento"></label>
      <label class="f">Cultivo o especie<input type="text" id="nv-cultivo" list="nv-cult-l" value="${esc(NV.cultivo)}"><datalist id="nv-cult-l">${R.cultivos.map(c => `<option value="${c}">`).join('')}</datalist></label>
      <label class="f">Escala<select id="nv-escala">${Object.entries(ESCALAS).map(([k, e]) => `<option value="${k}" ${k === NV.escala ? 'selected' : ''}>${e.n}</option>`).join('')}</select><span class="note">${NV.escala === 'macro' ? 'Franjas del ancho de la máquina, a lo largo del lote (100 m o más).' : 'Parcelas chicas dentro del lote del productor, aplicadas con mochila.'}</span></label>
      <label class="f">¿Se prueba en otras chacras? (opcional, una por renglón)<textarea id="nv-otros" rows="2" placeholder="Ej.: Chacra Benítez, Naranjal&#10;Chacra Ortiz, Santa Rosa">${esc(NV.otros || '')}</textarea><span class="note">Con varias chacras la app calcula en cuántas ganó el producto y la ganancia media.</span></label>
      <label class="f">Dron<select id="nv-dron"><option value="no" ${NV.dron ? '' : 'selected'}>Sin dron, o solo una foto aérea general</option><option value="si" ${NV.dron ? 'selected' : ''}>Sí, también imágenes multiespectrales</option></select></label></div>`;
  } else if (NV.paso === 1) {
    h += `<div class="grid2"><label class="f">Nombre del ensayo<input type="text" id="nv-titulo" value="${esc(NV.titulo)}" placeholder="Ej.: Fungicidas en ${esc(R.cultivos[0].toLowerCase())}, zafra 2026"></label>
      <label class="f">Cultivo o especie<input type="text" id="nv-cultivo" list="nv-cult-l" value="${esc(NV.cultivo)}"><datalist id="nv-cult-l">${R.cultivos.map(c => `<option value="${c}">`).join('')}</datalist></label>
      <label class="f">Tipo de ensayo<select id="nv-tipo">${R.tipos.filter(t => t !== 'Lado a lado').map(t => `<option ${t === NV.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f">Lugar<input type="text" id="nv-lugar" value="${esc(NV.lugar)}" placeholder="Departamento, distrito o establecimiento"></label>
      <label class="f">¿Se repite en otros lugares? (opcional, uno por renglón)<textarea id="nv-otros" rows="2" placeholder="Ej.: Naranjal, Alto Paraná&#10;Santa Rosa, San Pedro">${esc(NV.otros || '')}</textarea><span class="note">Cada lugar tiene su croquis sorteado y puede tener su propio operador.</span></label>
      <label class="f">Imágenes de dron<select id="nv-dron"><option value="no" ${NV.dron ? '' : 'selected'}>Sin dron, o solo una foto aérea general</option><option value="si" ${NV.dron ? 'selected' : ''}>Sí, también imágenes multiespectrales (índices)</option></select></label></div>
      <p class="note" style="margin:0">El dron es opcional: sin él, el ensayo se centra en lo que medís a campo y en lo que vas aplicando. Una foto aérea general se puede cargar siempre, en “Croquis”.</p>`;
  }
  if (NV.paso === 1) {
    const cand = opsDisponibles();
    h += `<div style="display:grid;gap:8px"><h3>Operadores de este trabajo</h3>
      ${cand.length ? `<p class="note" style="margin:0">${S.user.perfil === 'gerente' ? `Operadores del ${esc(EQUIPOS[S.user.equipo].nombre)}.` : 'Se les envía una invitación; al aceptarla ven el ensayo.'} También podés asignarlos después.</p>
        <div class="row">${cand.map(u => `<label class="pill" style="cursor:pointer"><input type="checkbox" data-nvop="${u.id}" ${NV.ops.has(u.id) ? 'checked' : ''}>${avatar(u)}${esc(u.nombre)}</label>`).join('')}</div>
        <label class="f" style="max-width:460px">Cómo trabajan<select id="nv-modo"><option value="bloques" ${NV.modoOps === 'bloques' ? 'selected' : ''}>${lal ? 'Repartir los pares de franjas entre ellos' : 'Repartir los bloques entre ellos'}</option><option value="ensayo" ${NV.modoOps === 'ensayo' ? 'selected' : ''}>Todos cargan en todo el ensayo</option><option value="despues" ${NV.modoOps === 'despues' ? 'selected' : ''}>Asignar parcelas después</option></select></label>`
        : `<p class="note" style="margin:0">${S.user.perfil === 'gerente' ? 'Tu equipo todavía no tiene operadores: compartí el código ' + esc(EQUIPOS[S.user.equipo]?.codigo || '') + '.' : 'Vas a trabajar solo. Podés invitar operadores más adelante desde “Equipo y cambios”.'}</p>`}</div>`;
  } else if (NV.paso === 2 && lal) {
    const L = NV.lal, ha = L.ancho * L.largo / 10000, util = Math.max(0, L.anchoCos ?? L.ancho) * Math.max(0, L.largo - 2 * (L.cab || 0));
    const lado = (l, i) => `<div class="card" style="gap:8px;border-left:5px solid ${['#2563eb', '#d97706'][i]}"><b>${i ? 'Lado B · producto del productor' : 'Lado A · producto a probar'}</b>
      <label class="f">Nombre del lado<input type="text" data-lado="${i}|nombre" value="${esc(l.nombre)}"></label>
      <div class="grid3"><label class="f" style="grid-column:span 2">Producto (nombre comercial)<input type="text" data-lado="${i}|prod" value="${esc(l.prod)}" list="nv-prods" placeholder="${i ? 'El que usa siempre el productor' : 'El producto que se quiere probar'}"></label>
      <label class="f">Dosis<span class="row" style="flex-wrap:nowrap;gap:4px"><input type="number" step="any" data-lado="${i}|dosis" value="${esc(l.dosis)}" style="width:80px"><select data-lado="${i}|unidad">${UNIDADES.map(u => `<option ${u === l.unidad ? 'selected' : ''}>${u}</option>`).join('')}</select></span></label></div></div>`;
    h += `<p class="lead" style="font-size:.92rem;margin:0">Se compara el producto que querés probar contra el que usa el productor, en franjas pegadas, con todo el resto del manejo igual. Después podés sumar más productos por lado y buscarlos en el listado SENAVE.</p>
      <div class="grid2">${NV.lados.map(lado).join('')}</div>
      <label class="opchk"><input type="checkbox" id="nv-testigo" ${NV.testigo ? 'checked' : ''}><span><b>Sumar una franja testigo sin aplicar (lado C)</b><br><span class="note">Permite calcular la eficacia de cada producto (control respecto del testigo).</span></span></label>
      <h3>Medidas de cada franja</h3><div class="grid3">
        <label class="f">Ancho (m)<input type="number" step="any" min="0" data-lal="ancho" value="${L.ancho}"></label><label class="f">Largo (m)<input type="number" step="any" min="0" data-lal="largo" value="${L.largo}"></label>
        <label class="f">Separación entre franjas (m)<input type="number" step="any" min="0" data-lal="sep" value="${L.sep ?? 0}"></label>
        <label class="f">Cabeceras que no se evalúan (m)<input type="number" step="any" min="0" data-lal="cab" value="${L.cab ?? 0}"></label>
        <label class="f">Ancho cosechado o evaluado (m)<input type="number" step="any" min="0" data-lal="anchoCos" value="${L.anchoCos ?? L.ancho}"></label>
        <label class="f">Repeticiones (pares de franjas)<select id="nv-pares">${[1, 2, 3, 4].map(n => `<option ${n === NV.pares ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <p class="note" style="margin:0" id="nv-lal-area">Cada franja: ${fmt(L.ancho * L.largo, 0)} m² (${fmt(ha, ha < 0.1 ? 3 : 2)} ha) · se evalúan ${fmt(util, 0)} m². ${NV.pares > 1 ? `El orden se alterna en cada par (A-B, B-A…) para no favorecer un lado.` : 'Con un solo par la comparación es directa; con 2 o más pares (o varias chacras) se puede saber si la diferencia es confiable.'} La ubicación se marca después con el GPS.</p>`;
  } else if (NV.paso === 2) {
    const p = NV.par, num = (id, l, v, st = 1) => `<label class="f">${l}<input type="number" data-par="${id}" value="${v}" step="${st}" min="0"></label>`;
    const campos = S.rubro === 'agricola' ? num('hileras', 'Hileras por parcela', p.hileras) + num('dist', 'Distancia entre hileras (m)', p.dist, 0.05) + num('largo', 'Largo (m)', p.largo, 0.5) + num('util', 'Hileras cosechadas', p.util)
      : S.rubro === 'horticola' ? num('plantas', 'Plantas por parcela', p.plantas) + num('utiles', 'Plantas útiles', p.utiles) + num('entre', 'Entre hileras (m)', p.entre, 0.05) + num('sobre', 'Entre plantas (m)', p.sobre, 0.05)
      : S.rubro === 'pasturas' ? num('ancho', 'Ancho (m)', p.ancho, 0.5) + num('largo', 'Largo (m)', p.largo, 0.5) + num('borde', 'Borde sin evaluar (m)', p.borde, 0.25) + num('marco', 'Marco de corte (m²)', p.marco, 0.05) + num('marcos', 'Marcos por parcela', p.marcos) + num('altura_corte', 'Altura de corte (cm)', p.altura_corte)
        : num('filas', 'Filas de árboles', p.filas) + num('columnas', 'Árboles por fila', p.columnas) + num('e1', 'Entre filas (m)', p.e1, 0.5) + num('e2', 'Entre árboles (m)', p.e2, 0.5) + num('borde', 'Filas de borde', p.borde);
    h += `<h3>Parcela</h3><div class="grid3">${campos}</div><p class="note" style="margin:0">${A.txt}: ${fmt(A.area, 1)} m² por parcela, ${fmt(A.util, 1)} m² útiles.</p>
      <h3>Tratamientos y bloques</h3><div class="grid2"><label class="f">Un tratamiento por renglón (el primero es el testigo)<textarea id="nv-trats" rows="6">${esc(NV.trats)}</textarea></label>
      <div style="display:grid;gap:10px;align-content:start"><label class="f">Bloques (repeticiones)<select id="nv-bloques">${[3, 4, 5, 6].map(b => `<option ${b === NV.bloques ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
      <div><span class="chip ${gl >= 12 ? 'ok' : 'warn'}">${gl >= 12 ? '✓' : '!'}</span> ${trs.length} tratamientos × ${NV.bloques} bloques = ${trs.length * NV.bloques} parcelas · ${gl} gl de error ${gl >= 12 ? '(suficiente)' : '(conviene ≥ 12: sumá bloques)'}</div>
      <div class="note">Diseño: bloques completos al azar. El croquis se sortea al crear el ensayo.${S.rubro === 'pasturas' ? ' Las fechas de corte se cargan después, en “Mediciones”.' : ''}</div></div></div>`;
  } else {
    const lista = [...MET[S.rubro], ...CUSTOM.filter(c => c.rubro === S.rubro)].filter(v => NV.dron || v.origen !== 'dron');
    if (lal) h += `<label class="f" style="max-width:340px">Puntos de muestreo por franja<input type="number" min="1" max="30" id="nv-puntos" value="${NV.puntos}"><span class="note">En cada franja se mide en varios puntos repartidos a lo largo (sin cabeceras) y la app promedia.</span></label>`;
    h += `<p class="lead" style="font-size:.92rem">Estas son las mediciones sugeridas para ${R.nombre.toLowerCase()}, cada una con su forma de medir. Tildá las que vas a usar; después podés cambiar el método o crear tus propios indicadores en el paso “Mediciones”.${NV.dron ? '' : ' Las mediciones del dron no aparecen porque elegiste trabajar sin dron.'}${S.rubro === 'pasturas' ? ' Las marcadas “en cada corte” se repiten en cada corte que agregues.' : ''}</p>
      <div>${lista.map(v => `<label class="opchk"><input type="checkbox" data-var="${v.id}" ${NV.vars.has(v.id) ? 'checked' : ''}><span><b>${esc(v.nombre)}</b> ${v.unidad ? `<span class="note">(${esc(v.unidad)})</span>` : ''} ${v.origen === 'dron' ? '<span class="chip dron">dron</span>' : ''}${v.porCorte ? '<span class="chip acc">en cada corte</span>' : ''}${v.propio ? '<span class="chip hypo">propio</span>' : ''}<br><span class="note">${esc(v.metodo)}</span></span></label>`).join('')}</div>`;
  }
  h += `</div><div class="stepper"><button class="btn" id="nv-prev" ${NV.paso === 1 ? 'style="visibility:hidden"' : ''}>← Anterior</button><button class="btn primary" id="nv-next">${NV.paso === 3 ? (lal ? 'Crear y ubicar las franjas' : 'Crear ensayo y empezar a cargar') : 'Siguiente →'}</button></div>`;
  $('#s-nuevo').innerHTML = h;
  if (lal && NV.paso === 2 && !document.getElementById('nv-prods')) { const d = document.createElement('datalist'); d.id = 'nv-prods'; d.innerHTML = [...new Set(CAT.rows.filter(r => r[catIdx.sit] !== 'CANCELADO').map(r => r[catIdx.prod]))].map(n => `<option value="${esc(n)}">`).join(''); document.body.appendChild(d); }
}
$('#s-nuevo').addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'nv-titulo') NV.titulo = t.value; if (t.id === 'nv-cultivo') NV.cultivo = t.value; if (t.id === 'nv-lugar') NV.lugar = t.value; if (t.id === 'nv-otros') NV.otros = t.value;
  if (t.dataset.par) { NV.par[t.dataset.par] = parseFloat(t.value) || 0; const A = areaNueva(); t.closest('.card').querySelector('p.note').textContent = `${A.txt}: ${fmt(A.area, 1)} m² por parcela, ${fmt(A.util, 1)} m² útiles.`; }
  if (t.id === 'nv-trats') NV.trats = t.value;
  if (t.id === 'nv-productor') NV.productor = t.value; if (t.id === 'nv-lote') NV.lote = t.value; if (t.id === 'nv-puntos') NV.puntos = Math.max(1, +t.value || 1);
  if (t.dataset.lado) { const [i, k] = t.dataset.lado.split('|'); NV.lados[+i][k] = t.value; }
  if (t.dataset.lal) { NV.lal[t.dataset.lal] = parseFloat(t.value) || 0; if (t.dataset.lal === 'ancho' && NV.lal.anchoCos > NV.lal.ancho) NV.lal.anchoCos = NV.lal.ancho;
    const L = NV.lal, ha = L.ancho * L.largo / 10000, util = Math.max(0, L.anchoCos ?? L.ancho) * Math.max(0, L.largo - 2 * (L.cab || 0)), el = $('#nv-lal-area'); if (el) el.firstChild.textContent = `Cada franja: ${fmt(L.ancho * L.largo, 0)} m² (${fmt(ha, ha < 0.1 ? 3 : 2)} ha) · se evalúan ${fmt(util, 0)} m². `; }
});
$('#s-nuevo').addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'nv-tipo') NV.tipo = t.value;
  if (t.name === 'nv-modo-t') { NV.modo = t.value; renderNuevo(); return; }
  if (t.id === 'nv-escala') { NV.escala = t.value; const e = ESCALAS[t.value]; NV.lal = {...NV.lal, ancho: e.ancho, largo: e.largo, cab: e.cab, anchoCos: e.anchoCos}; NV.puntos = e.puntos; renderNuevo(); return; }
  if (t.id === 'nv-testigo') NV.testigo = t.checked; if (t.id === 'nv-pares') { NV.pares = +t.value; renderNuevo(); return; }
  if (t.dataset.lado && t.tagName === 'SELECT') { const [i, k] = t.dataset.lado.split('|'); NV.lados[+i][k] = t.value; }
  if (t.dataset.nvop) t.checked ? NV.ops.add(t.dataset.nvop) : NV.ops.delete(t.dataset.nvop);
  if (t.id === 'nv-modo') NV.modoOps = t.value;
  if (t.id === 'nv-dron') NV.dron = t.value === 'si';
  if (t.id === 'nv-bloques' || t.id === 'nv-trats') { NV.bloques = Number($('#nv-bloques').value); NV.trats = $('#nv-trats').value; renderNuevo(); }
  if (t.dataset.var) t.checked ? NV.vars.add(t.dataset.var) : NV.vars.delete(t.dataset.var);
});
$('#s-nuevo').addEventListener('click', e => {
  if (e.target.closest('#nv-cancel')) return irInicio();
  if (e.target.closest('#nv-prev')) { NV.paso--; renderNuevo(); }
  if (e.target.closest('#nv-next')) {
    if (NV.paso === 1 && !NV.titulo.trim()) { NV.titulo = NV.modo === 'lal' ? `Lado a lado en ${NV.cultivo}${NV.productor ? ' · ' + NV.productor : ''}` : `${NV.tipo} en ${NV.cultivo}`; }
    if (NV.paso < 3) { NV.paso++; renderNuevo(); return; }
    crearEnsayo();
  }
});
async function crearEnsayo() {
  if (NV.modo === 'lal') return crearLal();
  const trs = NV.trats.split('\n').map(s => s.trim()).filter(Boolean), pref = S.rubro === 'forestal' ? 'C' : 'T';
  const tratamientos = trs.map((n, i) => ({cod: pref + (i + 1), nombre: n, testigo: i === 0, productos: []}));
  const rnd = mulberry(Date.now() % 100000), parcelas = [];
  for (let b = 1; b <= NV.bloques; b++) { const orden = tratamientos.map(t => t.cod).sort(() => rnd() - 0.5);
    orden.forEach((c, i) => parcelas.push({parcela: b * 100 + i + 1, bloque: b, trat: c, valores: {}, sub: {}})); }
  const A = areaNueva();
  const T = {id: nuevoIdEnsayo(), creado: new Date().toISOString(), rubro: S.rubro, titulo: NV.titulo.trim() || `${NV.tipo} en ${NV.cultivo}`, cultivo: NV.cultivo, tipo: NV.tipo, campana: '2026/27',
    lugar: NV.lugar || 'Sin ubicación', owner: S.user.id, equipo: S.user.perfil === 'gerente' ? S.user.equipo : null, bloques: NV.bloques,
    parcela: {forma: S.rubro, ...NV.par, area_m2: +A.area.toFixed(1), area_util_m2: +A.util.toFixed(1), texto: A.txt}, tratamientos,
    variables: [...NV.vars].map(id => varDef(S.rubro, id)).filter(v => v && (NV.dron || v.origen !== 'dron')), parcelas, asig: {}, compartido: {}, notas: [], cambios: [], aplicaciones: [], dron: NV.dron};
  if (S.rubro === 'pasturas') { T.porCorte = T.variables.filter(v => v.porCorte).map(v => v.id); T.variables = T.variables.filter(v => !v.porCorte); T.cortes = []; }
  const ops = [...NV.ops]; T.trabajo = {};
  if (ops.length) { if (!T.equipo) T.invitados = ops; ops.forEach(id => T.trabajo[id] = NV.modoOps === 'ensayo' ? 'ensayo' : 'parcelas'); if (NV.modoOps === 'bloques') repartir(T, ops); }
  TRIALS.push(T);
  const otros = String(NV.otros || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (otros.length) { await convertirARed(T); T.sitios[0].nombre = (NV.lugar || 'Lugar 1').split(',')[0].trim() || 'Lugar 1';
    for (const l of otros) await agregarSitio(T, l.split(',')[0].trim(), l);
    if (ops.length && NV.modoOps === 'bloques') { repartir(T, ops); T.asig = {}; } T.cambios = []; }
  toast(otros.length ? `Ensayo creado en ${T.sitios.length} lugares` : ops.length ? `Ensayo creado y asignado a ${ops.map(id => USERS[id].nombre.split(' ')[0]).join(', ')}` : 'Ensayo creado y croquis sorteado'); abrir(T, 'campo');
}

/* ================= lado a lado (prueba de producto en la parcela del productor) ================= */
const esLal = T => T?.modo === 'lal';
const ESCALAS = {macro: {n: 'Macroparcelas (franjas de máquina)', ancho: 20, largo: 200, cab: 10, anchoCos: 9, puntos: 10}, micro: {n: 'Microparcelas (parcelas chicas)', ancho: 5, largo: 10, cab: 1, anchoCos: 3, puntos: 5}};
const COL_LADO = {A: '#2563eb', B: '#d97706', C: '#6b7280', D: '#16a34a'};
const NOM_POS = ['izquierda', 'derecha'];
const menorEsMejor = v => /sev|incid|descarte|hormig|chinch|defol|ewrc|saliv|ninfa|maleza|dano|daño|plaga/.test(v.id + ' ' + v.nombre.toLowerCase());
const media0 = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const desvio = a => { if (a.length < 2) return null; const m = media0(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const ladoDe = (T, cod) => T.tratamientos.find(t => t.cod === cod);
const prodTxt = t => t.productos?.length ? t.productos.map(p => `${p.prod}${p.dosis ? ' ' + fmt(p.dosis, 2) + ' ' + p.unidad : ''}`).join(' + ') : t.testigo ? 'Sin aplicar' : '—';

async function crearLal() {
  const L = NV.lal, lados = NV.lados.map((l, i) => { const t = {cod: String.fromCharCode(65 + i), nombre: l.nombre.trim() || (i ? 'Producto del productor' : 'Producto a probar'), testigo: false, lado: i ? 'productor' : 'prueba', productos: []};
    if (l.prod.trim()) { const r = buscarEnCatalogo(l.prod, false); t.productos.push({reg: r ? Number(r[catIdx.reg]) : null, prod: r ? r[catIdx.prod] : l.prod.trim(), pa: r ? r[catIdx.pa] : '', dosis: parseFloat(l.dosis) || 0, unidad: l.unidad, momento: 'principal'}); }
    return t; });
  if (NV.testigo) lados.push({cod: 'C', nombre: 'Testigo sin aplicar', testigo: true, lado: 'testigo', productos: []});
  const parcelas = [];
  for (let r = 1; r <= NV.pares; r++) { const c = lados.map(t => t.cod); if (r % 2 === 0) [c[0], c[1]] = [c[1], c[0]]; c.forEach((cod, i) => parcelas.push({parcela: r * 100 + i + 1, bloque: r, trat: cod, valores: {}, sub: {}})); }
  const util = Math.max(0, L.anchoCos ?? L.ancho) * Math.max(0, L.largo - 2 * (L.cab || 0)), ha = L.ancho * L.largo / 10000;
  const variables = [...NV.vars].map(id => varDef(S.rubro, id)).filter(v => v && (NV.dron || v.origen !== 'dron'));
  variables.forEach(v => { if (!v.entrada && v.origen !== 'calc' && v.origen !== 'dron' && v.origen !== 'papel' && v.tipo !== 'texto') v.sub = NV.puntos; });
  const T = {id: nuevoIdEnsayo().replace('ENS-', 'LAL-'), creado: new Date().toISOString(), rubro: S.rubro, modo: 'lal', titulo: NV.titulo.trim() || `Lado a lado en ${NV.cultivo}`, cultivo: NV.cultivo,
    tipo: NV.escala === 'macro' ? 'Lado a lado (macroparcelas)' : 'Lado a lado (microparcelas)', campana: '2026/27', lugar: NV.lugar || 'Sin ubicación', owner: S.user.id, equipo: S.user.perfil === 'gerente' ? S.user.equipo : null, bloques: NV.pares,
    parcela: {forma: 'franja', ancho: L.ancho, largo: L.largo, cab: L.cab || 0, anchoCos: L.anchoCos ?? L.ancho, area_m2: +(L.ancho * L.largo).toFixed(1), area_util_m2: +util.toFixed(1), texto: `Franjas de ${fmt(L.ancho, 1)} × ${fmt(L.largo, 0)} m (${fmt(ha, ha < 0.1 ? 3 : 2)} ha)`},
    lal: {escala: NV.escala, productor: NV.productor.trim(), lote: NV.lote.trim(), sep: L.sep || 0, puntos: NV.puntos, costo: {}, precio: null},
    tratamientos: lados, variables, parcelas, asig: {}, compartido: {}, notas: [], cambios: [], aplicaciones: [], dron: NV.dron,
    objetivo: `Comparar en la parcela del productor la eficacia de ${lados[0].productos[0]?.prod || lados[0].nombre} frente a ${lados[1].productos[0]?.prod || lados[1].nombre}${NV.testigo ? ', con una franja testigo sin aplicar' : ''}.`};
  if (S.rubro === 'pasturas') { T.porCorte = T.variables.filter(v => v.porCorte).map(v => v.id); T.variables = T.variables.filter(v => !v.porCorte); T.cortes = []; }
  const ops = [...NV.ops]; T.trabajo = {};
  if (ops.length) { if (!T.equipo) T.invitados = ops; ops.forEach(id => T.trabajo[id] = NV.modoOps === 'ensayo' ? 'ensayo' : 'parcelas'); if (NV.modoOps === 'bloques') repartir(T, ops); }
  TRIALS.push(T);
  const otros = String(NV.otros || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (otros.length) { await convertirARed(T); T.sitios[0].nombre = (NV.lote || NV.productor || NV.lugar || 'Chacra 1').split(',')[0].trim() || 'Chacra 1';
    for (const l of otros) { await agregarSitio(T, l.split(',')[0].trim(), l); const st = T.sitios[T.sitios.length - 1], ps = T.parcelas.filter(p => p.sitio === st.id);
      // en cada chacra el mismo orden alternado que en la primera (A-B, B-A…), no un sorteo
      const base = T.parcelas.filter(p => p.sitio === T.sitios[0].id); ps.forEach(p => { const b = base.find(q => q.parcela % 1000 === p.parcela % 1000); if (b) p.trat = b.trat; }); }
    T.cambios = []; }
  toast(otros.length ? `Lado a lado creado en ${T.sitios.length} chacras` : 'Lado a lado creado: ahora ubicá las franjas con el GPS'); abrir(T, 'campo');
}

/* ----- geometría de las franjas ----- */
// Franjas una al lado de la otra, en orden de número (101, 102, … 201, …), a lo ancho; el largo es el sentido de avance.
function layoutLal(T) {
  const ps = [...T.parcelas].sort((a, b) => a.parcela - b.parcela), w = +T.parcela.ancho || 10, h = +T.parcela.largo || 50, sep = +(T.lal?.sep || 0), R = {};
  ps.forEach((p, i) => { R[p.parcela] = [i * (w + sep), 0, w, h]; });
  return {W: ps.length * w + (ps.length - 1) * sep, H: h, R, orden: ps.map(p => p.parcela)};
}
const cfgGeoLal = T => { if (T.__vista) { const st = T.sitios.find(x => x.id === T.__vista); return st ? (st.lalGeo = st.lalGeo || {}) : null; } if (T.sitios) return null; T.lal = T.lal || {}; return (T.lal.geo = T.lal.geo || {}); };
function generarGeoLal(T, cfg) {
  const L = layoutLal(T), anillo = (x, y, w, h, f) => { const r = [f(x, y), f(x + w, y), f(x + w, y + h), f(x, y + h)]; r.push(r[0]); return r.map(([la, lo]) => [lo, la]); };
  let f;
  if (cfg.modo === 'esq') { const q = cfg.esquinas; if (!q || q.some(p => !p)) return false; f = (x, y) => enCuad(q, x / L.W, y / L.H); }
  else { if (cfg.lat == null || cfg.lon == null) return false; f = (x, y) => enRect([cfg.lat, cfg.lon], cfg.rumbo ?? 0, x, y); }
  T.parcelas.forEach(p => { const [x, y, w, h] = L.R[p.parcela]; p.geo = anillo(x, y, w, h, f); });
  return true;
}
// GPS: promedia las lecturas de unos segundos (mejor precisión que una sola)
function medirGPS(seg = 6, prog) {
  return new Promise((ok, mal) => {
    if (!navigator.geolocation) return mal(new Error('Este equipo no tiene GPS disponible'));
    const L = []; let id = null; const fin = () => { navigator.geolocation.clearWatch(id); clearTimeout(t);
      if (!L.length) return mal(new Error('No se pudo obtener la ubicación (probá al aire libre y con la ubicación del celular activada)'));
      const w = L.map(p => 1 / Math.max(1, p.acc) ** 2), sw = w.reduce((a, b) => a + b, 0);
      ok({lat: L.reduce((s, p, i) => s + p.lat * w[i], 0) / sw, lon: L.reduce((s, p, i) => s + p.lon * w[i], 0) / sw, acc: Math.min(...L.map(p => p.acc)) / Math.sqrt(L.length), n: L.length}); };
    const t = setTimeout(fin, seg * 1000);
    id = navigator.geolocation.watchPosition(pos => { L.push({lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy}); prog?.(L.length, Math.round(pos.coords.accuracy)); },
      er => { if (!L.length) { navigator.geolocation.clearWatch(id); clearTimeout(t); mal(new Error(er.code === 1 ? 'Permiso de ubicación denegado: activalo en el navegador' : 'No se pudo obtener la ubicación')); } }, {enableHighAccuracy: true, maximumAge: 0, timeout: seg * 1000});
  });
}
// Brújula: rumbo hacia donde apunta la parte de arriba del celular
function medirRumbo(seg = 2) {
  return new Promise(async (ok, mal) => {
    try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return mal(new Error('Sin permiso para la brújula')); } } catch (e) {}
    const L = [], h = e => { let v = e.webkitCompassHeading != null ? e.webkitCompassHeading : e.absolute && e.alpha != null ? (360 - e.alpha) % 360 : null; if (v != null) L.push(v); };
    addEventListener('deviceorientationabsolute', h); addEventListener('deviceorientation', h);
    setTimeout(() => { removeEventListener('deviceorientationabsolute', h); removeEventListener('deviceorientation', h);
      if (!L.length) return mal(new Error('Este equipo no tiene brújula: escribí el rumbo a mano o marcá las 4 esquinas'));
      const sx = L.reduce((s, a) => s + Math.sin(a * Math.PI / 180), 0), sy = L.reduce((s, a) => s + Math.cos(a * Math.PI / 180), 0); ok((Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360); }, seg * 1000);
  });
}
// Dibujo esquemático en metros (sin ubicación) o para el informe
function svgFranjas(T, {sel} = {}) {
  const L = layoutLal(T), k = Math.min(640 / L.W, 360 / L.H), W = L.W * k, H = L.H * k, m = 30, C = colTrat(T);
  let s = `<svg viewBox="0 0 ${W + 2 * m} ${H + 2 * m}" width="100%" style="max-height:420px;display:block;background:var(--field,#e3eadb);border-radius:10px" xmlns="http://www.w3.org/2000/svg">`;
  T.parcelas.forEach(p => { const [x, y, w, h] = L.R[p.parcela], c = COL_LADO[p.trat] || C[p.trat];
    s += `<rect x="${m + x * k}" y="${m + y * k}" width="${w * k}" height="${h * k}" fill="${c}" fill-opacity="${sel === p.parcela ? .6 : .35}" stroke="${sel === p.parcela ? '#111' : c}" stroke-width="2" data-pn="${p.parcela}" style="cursor:pointer"/>
      <text x="${m + (x + w / 2) * k}" y="${m + (y + h / 2) * k}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.min(20, w * k / 2.2)}" font-weight="700" fill="#111" pointer-events="none">${p.trat}</text>`; });
  s += `<text x="${m}" y="${m - 10}" font-size="11" fill="#5d6b62">${fmt(L.W, 1)} m de ancho total</text><text x="${m - 8}" y="${m + H / 2}" font-size="11" fill="#5d6b62" transform="rotate(-90 ${m - 8} ${m + H / 2})" text-anchor="middle">${fmt(L.H, 0)} m de largo · sentido de avance ↑</text>`;
  return s + '</svg>';
}
let lalModo = 'ubic', lalSat = true;
function renderLal(T0) {
  const T = vistaS(T0), cfg = cfgGeoLal(T0.sitios ? T : T0) || {}, ed = puede.diseno(T0) || (T0.sitios && T.__vista && T0.sitios.find(x => x.id === T.__vista)?.ops?.includes(S.user.id)), C = colTrat(T);
  const conGeo = T.parcelas.length && T.parcelas.every(p => p.geo), L = layoutLal(T);
  const pol = conGeo ? T.parcelas.map(p => ({anillo: p.geo, color: COL_LADO[p.trat] || C[p.trat], texto: `${p.trat}${T.bloques > 1 ? p.bloque : ''}`, id: p.parcela, sel: S.sel === p.parcela})) : [];
  const pts = []; if (lalModo === 'dib' && !conGeo && cfg.centro && !(cfg.esquinas || []).some(Boolean)) pts.push({lat: cfg.centro[0], lon: cfg.centro[1], texto: 'Acá'});
  if (cfg.modo === 'esq' || lalModo === 'dib') (cfg.esquinas || []).forEach((q, i) => q && pts.push({lat: q[0], lon: q[1], texto: i + 1}));
  if (!conGeo && cfg.esquinas?.length === 4 && cfg.esquinas.every(Boolean)) pol.push({anillo: [...cfg.esquinas, cfg.esquinas[0]].map(([la, lo]) => [lo, la]), color: '#facc15'}); else if (cfg.lat != null && !conGeo) pts.push({lat: cfg.lat, lon: cfg.lon, texto: 'Inicio'});
  const supTot = conGeo ? T.parcelas.reduce((s, p) => s + areaM2(p.geo), 0) : T.parcelas.length * T.parcela.area_m2;
  const ladoInfo = T.tratamientos.map(t => { const ps = T.parcelas.filter(p => p.trat === t.cod), sup = conGeo ? ps.reduce((s, p) => s + areaM2(p.geo), 0) : ps.length * T.parcela.area_m2;
    return `<div class="row" style="gap:8px;align-items:flex-start"><span class="swatch" style="background:${COL_LADO[t.cod] || C[t.cod]};width:16px;height:16px"></span><div style="display:grid;gap:2px"><b>${t.cod} · ${esc(t.nombre)}</b><span class="note">${esc(prodTxt(t))} · ${ps.length} franja${ps.length > 1 ? 's' : ''} · ${sup >= 1000 ? fmt(sup / 10000, 2) + ' ha' : fmt(sup, 0) + ' m²'}</span></div></div>`; }).join('');
  const lalInfo = T0.lal || {}, gps = q => q ? `${q[0].toFixed(6)}, ${q[1].toFixed(6)}` : '—';
  P().innerHTML = `<section class="panel"><h2>Ubicación y franjas</h2>
    <p class="lead">${esc(lalInfo.productor || '')}${lalInfo.lote ? ' · ' + esc(lalInfo.lote) : ''}${T.__vista ? ' · ' + esc(nomSitio(T0, T.__vista)) : ''}. ${T.tratamientos.length} lados${T.bloques > 1 ? `, ${T.bloques} pares` : ''}, franjas de ${fmt(T.parcela.ancho, 1)} × ${fmt(T.parcela.largo, 0)} m. Tocá una franja para cargar lo que medís en ella.</p>
    <div class="mapwrap"><div style="display:grid;gap:8px;min-width:0">
      <div id="lal-mapa">${conGeo || pts.length ? svgMapa(pol, pts, {satelite: lalSat, ancho: 760, alto: 460, limites: lalModo === 'dib' && !conGeo && cfg.centro ? [mover(cfg.centro, -Math.max(120, T.parcela.largo), -Math.max(120, T.parcela.largo)), mover(cfg.centro, Math.max(120, T.parcela.largo), Math.max(120, T.parcela.largo))] : []}) : svgFranjas(T, {sel: S.sel})}</div>
      <div class="row note">${conGeo ? `<label class="chk"><input type="checkbox" id="lal-sat" ${lalSat ? 'checked' : ''}><span>Fondo satelital (con internet)</span></label> · Superficie total ${fmt(supTot / 10000, supTot < 1000 ? 3 : 2)} ha` : 'Todavía sin ubicar en el mapa: marcá la ubicación con el GPS (a la derecha).'}${pts.length && !conGeo ? ' · Tocá el mapa para mover el punto.' : ''}</div></div>
      <div class="side"><div class="card ctl"><h3>Lados</h3>${ladoInfo}</div>
      ${ed ? `<div class="card ctl" id="lal-gps"><h3>Ubicar con el GPS</h3><div class="seg" id="seg-lalgps"></div>
        ${lalModo === 'ubic' ? `<p class="note" style="margin:0">Parate en la <b>esquina de inicio de la primera franja</b> (a la izquierda, mirando hacia donde avanza la máquina) y tocá “Usar mi ubicación”. Después apuntá el celular en el sentido de las franjas y tocá “Tomar el rumbo”.</p>
          <div class="row"><button class="btn small" id="lal-aqui">📍 Usar mi ubicación</button><button class="btn small" id="lal-brujula">🧭 Tomar el rumbo</button></div>
          <div class="grid2"><label class="f">Latitud<input type="number" step="any" id="lal-lat" value="${cfg.lat ?? ''}"></label><label class="f">Longitud<input type="number" step="any" id="lal-lon" value="${cfg.lon ?? ''}"></label>
          <label class="f">Rumbo de las franjas (°)<input type="number" step="any" id="lal-rumbo" value="${cfg.rumbo ?? 0}" title="0 = norte, 90 = este"></label><label class="f">Largo (m)<input type="number" step="any" id="lal-largo" value="${T.parcela.largo}"></label>
          <label class="f">Ancho de cada franja (m)<input type="number" step="any" id="lal-ancho" value="${T.parcela.ancho}"></label><label class="f">Superficie por franja (ha)<input type="number" step="any" id="lal-ha" value="${+(T.parcela.ancho * T.parcela.largo / 10000).toFixed(4)}" title="Cambia el largo"></label>
          <label class="f">Separación (m)<input type="number" step="any" id="lal-sep" value="${T0.lal?.sep ?? 0}"></label></div>
          <button class="btn primary" id="lal-generar">Generar las franjas</button>`
        : lalModo === 'dib' ? `<p class="note" style="margin:0">${cfg.centro ? `Tocá en el mapa satelital las 4 esquinas del área, en este orden: <b>1</b> inicio izquierda, <b>2</b> fin izquierda, <b>3</b> fin derecha, <b>4</b> inicio derecha (mirando hacia donde avanza la máquina). La app dibuja el área y la divide en ${T.parcelas.length} franjas iguales.` : 'Primero ubicá el mapa: usá tu ubicación (GPS) o escribí la latitud y longitud de la chacra. Necesita internet para ver la imagen satelital.'}</p>
          <div class="row"><button class="btn small" id="lal-centro">📍 Ir a mi ubicación</button>${(cfg.esquinas || []).some(Boolean) ? '<button class="btn small" id="lal-borrar-dib">↺ Borrar puntos</button>' : ''}</div>
          ${cfg.centro ? '' : `<div class="grid2"><label class="f">Latitud<input type="number" step="any" id="lal-clat"></label><label class="f">Longitud<input type="number" step="any" id="lal-clon"></label></div><button class="btn small" id="lal-ver">Ver el mapa</button>`}
          ${(cfg.esquinas || []).filter(Boolean).length ? `<span class="note">${(cfg.esquinas || []).filter(Boolean).length} de 4 esquinas marcadas${(cfg.esquinas?.length === 4 && cfg.esquinas.every(Boolean)) ? ` · largo ${fmt((distancia(cfg.esquinas[0], cfg.esquinas[1]) + distancia(cfg.esquinas[3], cfg.esquinas[2])) / 2, 1)} m · ancho ${fmt((distancia(cfg.esquinas[0], cfg.esquinas[3]) + distancia(cfg.esquinas[1], cfg.esquinas[2])) / 2, 1)} m` : ''}</span>` : ''}
          <button class="btn primary" id="lal-dividir" ${cfg.esquinas?.length === 4 && cfg.esquinas.every(Boolean) ? '' : 'disabled'}>Dividir en franjas</button>`
        : `<p class="note" style="margin:0">Caminá el contorno de toda el área y marcá las 4 esquinas en este orden. La app la divide en ${T.parcelas.length} franjas iguales.</p>
          ${['Inicio, lado izquierdo', 'Fin, lado izquierdo', 'Fin, lado derecho', 'Inicio, lado derecho'].map((n, i) => `<div class="row" style="justify-content:space-between;gap:6px"><span><b>${i + 1}</b> · ${n}<br><span class="note">${gps(cfg.esquinas?.[i])}${cfg.precision?.[i] ? ` · ±${cfg.precision[i]} m` : ''}</span></span><button class="btn small" data-esq="${i}">📍 Marcar</button></div>`).join('')}
          ${(cfg.esquinas?.length === 4 && cfg.esquinas.every(Boolean)) ? `<span class="note">Largo ${fmt((distancia(cfg.esquinas[0], cfg.esquinas[1]) + distancia(cfg.esquinas[3], cfg.esquinas[2])) / 2, 1)} m · ancho ${fmt((distancia(cfg.esquinas[0], cfg.esquinas[3]) + distancia(cfg.esquinas[1], cfg.esquinas[2])) / 2, 1)} m</span>` : ''}
          <button class="btn primary" id="lal-dividir" ${(cfg.esquinas?.length === 4 && cfg.esquinas.every(Boolean)) ? '' : 'disabled'}>Dividir en franjas</button>`}
        <span class="note" id="lal-msg"></span></div>` : ''}
      </div></div>
    ${conGeo ? `<div class="card"><h3>Franjas</h3><div class="tw"><table><thead><tr><th>Franja</th><th>Lado</th><th>Producto</th><th class="num">Superficie</th><th>Centro</th></tr></thead><tbody>
      ${[...T.parcelas].sort((a, b) => a.parcela - b.parcela).map(p => { const r = p.geo.slice(0, 4), c = [r.reduce((s, q) => s + q[1], 0) / 4, r.reduce((s, q) => s + q[0], 0) / 4], t = ladoDe(T, p.trat), a = areaM2(p.geo);
        return `<tr data-pn="${p.parcela}" style="cursor:pointer"><td>${etiq(T, p)}</td><td><span class="swatch" style="background:${COL_LADO[p.trat]}"></span> ${p.trat} · ${esc(t?.nombre || '')}</td><td>${esc(prodTxt(t))}</td><td class="num">${a >= 1000 ? fmt(a / 10000, 3) + ' ha' : fmt(a, 0) + ' m²'}</td><td><a href="https://www.google.com/maps?q=${c[0].toFixed(6)},${c[1].toFixed(6)}" target="_blank" rel="noopener">${c[0].toFixed(5)}, ${c[1].toFixed(5)}</a></td></tr>`; }).join('')}</tbody></table></div>
      <p class="note" style="margin:0">Las franjas salen en QGIS y Google Earth desde “Informe y exportar”.</p></div>` : ''}
    ${cardFotoAerea(T0, T)}</section>`;
  if ($('#seg-lalgps')) seg('#seg-lalgps', [['ubic', 'Desde un punto'], ['esq', 'Caminando las esquinas'], ['dib', 'Dibujar en el mapa']], lalModo, v => { lalModo = v; renderLal(T0); });
  const msg = t => { const m = $('#lal-msg'); if (m) m.textContent = t; };
  const guardarCfg = cambios => { const c = cfgGeoLal(T0.sitios ? T : T0); if (!c) return; Object.assign(c, cambios); };
  pintarFotoAerea(T0, T);
  P().oninput = e => { const id = e.target.id;
    if (id === 'lal-ha') { const v = +e.target.value, a = +$('#lal-ancho').value; if (v > 0 && a > 0) $('#lal-largo').value = +(v * 10000 / a).toFixed(1); }
    if (id === 'lal-largo' || id === 'lal-ancho') { const a = +$('#lal-ancho').value, l = +$('#lal-largo').value; if (a > 0 && l > 0) $('#lal-ha').value = +(a * l / 10000).toFixed(4); } };
  P().onchange = e => { if (e.target.id === 'lal-sat') { lalSat = e.target.checked; renderLal(T0); } if (clicFotoAereaCambio(e, T0, T)) return; };
  P().onclick = async e => {
    if (await clicFotoAerea(e, T0, T)) return;
    const pn = e.target.closest('[data-pn]'); if (pn) { S.sel = +pn.dataset.pn; abrirDrawer(S.sel); return; }
    const svg = e.target.closest('#lal-mapa svg[data-z]');
    if (svg && ed && lalModo === 'dib' && !conGeo) { const c = cfgGeoLal(T0.sitios ? T : T0), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, x = (e.clientX - r.left) / r.width * vb.width + +svg.dataset.ox, y = (e.clientY - r.top) / r.height * vb.height + +svg.dataset.oy;
      const [la, lo] = desdeMerc(x, y, +svg.dataset.z); c.esquinas = (c.esquinas || []).filter(Boolean); if (c.esquinas.length >= 4) c.esquinas = []; c.esquinas.push([+la.toFixed(7), +lo.toFixed(7)]); c.modo = 'esq'; c.precision = []; guardarPronto(); return renderLal(T0); }
    if (e.target.closest('#lal-centro')) { msg('Buscando la ubicación…'); try { const g = await medirGPS(4); const c = cfgGeoLal(T0.sitios ? T : T0); c.centro = [+g.lat.toFixed(7), +g.lon.toFixed(7)]; guardarPronto(); return renderLal(T0); } catch (x) { msg(x.message); } return; }
    if (e.target.closest('#lal-ver')) { const la = +$('#lal-clat').value, lo = +$('#lal-clon').value; if (!la || !lo) return msg('Escribí la latitud y la longitud (por ejemplo -27.08 y -55.65).'); cfgGeoLal(T0.sitios ? T : T0).centro = [la, lo]; guardarPronto(); return renderLal(T0); }
    if (e.target.closest('#lal-borrar-dib')) { const c = cfgGeoLal(T0.sitios ? T : T0); c.esquinas = []; guardarPronto(); return renderLal(T0); }
    if (svg && ed && lalModo === 'ubic' && !conGeo) { const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, x = (e.clientX - r.left) / r.width * vb.width + +svg.dataset.ox, y = (e.clientY - r.top) / r.height * vb.height + +svg.dataset.oy;
      const [la, lo] = desdeMerc(x, y, +svg.dataset.z); guardarCfg({modo: 'ubic', lat: +la.toFixed(7), lon: +lo.toFixed(7)}); return renderLal(T0); }
    if (e.target.closest('#lal-aqui')) { msg('Buscando la ubicación… (quedate quieto unos segundos)');
      try { const g = await medirGPS(6, (n, a) => msg(`Leyendo GPS… ${n} lecturas, ±${a} m`)); $('#lal-lat').value = g.lat.toFixed(7); $('#lal-lon').value = g.lon.toFixed(7); msg(`Ubicación tomada (±${Math.max(1, Math.round(g.acc))} m, ${g.n} lecturas). Ahora tomá el rumbo y tocá “Generar las franjas”.`); } catch (x) { msg(x.message); } return; }
    if (e.target.closest('#lal-brujula')) { msg('Apuntá la parte de arriba del celular hacia donde van las franjas…'); try { const r = await medirRumbo(2); $('#lal-rumbo').value = Math.round(r); msg(`Rumbo ${Math.round(r)}° (0 = norte). Conviene revisarlo: los celulares se desvían cerca de metales.`); } catch (x) { msg(x.message); } return; }
    if (e.target.closest('#lal-generar')) { const n = id => $(id).value === '' ? null : +$(id).value;
      if (n('#lal-lat') == null || n('#lal-lon') == null) return msg('Falta la ubicación: usá el GPS, escribila o tocá el mapa.');
      if (!(n('#lal-ancho') > 0) || !(n('#lal-largo') > 0)) return msg('Completá el ancho y el largo.');
      cambiarMedidas(T0, n('#lal-ancho'), n('#lal-largo'), n('#lal-sep') ?? 0);
      guardarCfg({modo: 'ubic', lat: n('#lal-lat'), lon: n('#lal-lon'), rumbo: n('#lal-rumbo') ?? 0}); generarGeoLal(T, cfgGeoLal(T0.sitios ? T : T0));
      T0.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: 'Ubicación de las franjas', antes: null, despues: `${n('#lal-lat')}, ${n('#lal-lon')} · rumbo ${n('#lal-rumbo') ?? 0}°`, estado: 'aprobado'});
      toast('Franjas ubicadas en el mapa'); guardarPronto(); return renderLal(T0); }
    const eq = e.target.closest('[data-esq]'); if (eq) { const i = +eq.dataset.esq; eq.disabled = true; msg(`Marcando la esquina ${i + 1}… quedate quieto`);
      try { const g = await medirGPS(6, (k, a) => msg(`Esquina ${i + 1}: ${k} lecturas, ±${a} m`)); const c = cfgGeoLal(T0.sitios ? T : T0); c.modo = 'esq'; c.esquinas = c.esquinas || [null, null, null, null]; c.precision = c.precision || [];
        c.esquinas[i] = [+g.lat.toFixed(7), +g.lon.toFixed(7)]; c.precision[i] = Math.max(1, Math.round(g.acc)); guardarPronto(); renderLal(T0); } catch (x) { msg(x.message); eq.disabled = false; } return; }
    if (e.target.closest('#lal-dividir')) { const c = cfgGeoLal(T0.sitios ? T : T0); c.modo = 'esq';
      const largo = (distancia(c.esquinas[0], c.esquinas[1]) + distancia(c.esquinas[3], c.esquinas[2])) / 2, ancho = (distancia(c.esquinas[0], c.esquinas[3]) + distancia(c.esquinas[1], c.esquinas[2])) / 2, sep = T0.lal?.sep || 0, n = T.parcelas.length;
      cambiarMedidas(T0, +((ancho - sep * (n - 1)) / n).toFixed(2), +largo.toFixed(1), sep); generarGeoLal(T, c);
      T0.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: 'Ubicación de las franjas (4 esquinas)', antes: null, despues: `${fmt(largo, 0)} × ${fmt(ancho, 0)} m`, estado: 'aprobado'});
      toast('Área dividida en franjas'); guardarPronto(); return renderLal(T0); }
  };
}
function cambiarMedidas(T, ancho, largo, sep) {
  const pa = T.parcela, util = Math.max(0, Math.min(pa.anchoCos ?? ancho, ancho)) * Math.max(0, largo - 2 * (pa.cab || 0));
  Object.assign(pa, {ancho, largo, area_m2: +(ancho * largo).toFixed(1), area_util_m2: +util.toFixed(1), texto: `Franjas de ${fmt(ancho, 1)} × ${fmt(largo, 0)} m (${fmt(ancho * largo / 10000, ancho * largo < 1000 ? 3 : 2)} ha)`});
  if (pa.anchoCos > ancho) pa.anchoCos = ancho; T.lal = T.lal || {}; T.lal.sep = sep;
}

/* ----- comparación ----- */
function puntosDe(ps, v) { return ps.flatMap(p => { const sb = p.sub?.[v.id], arr = Array.isArray(sb) ? sb.filter(x => x !== '' && x != null && !isNaN(+x)).map(Number) : [];
  if (arr.length) return arr; const x = p.valores[v.id]; return x == null || x === '' || isNaN(+x) ? [] : [+x]; }); }
const valorP = (p, v) => { const x = p?.valores?.[v.id]; return x == null || x === '' || isNaN(+x) ? null : +x; };
function ladosLal(T) { const A = T.tratamientos.find(t => t.lado === 'prueba') || T.tratamientos[0], B = T.tratamientos.find(t => t.lado === 'productor') || T.tratamientos.find(t => t !== A && !t.testigo), C = T.tratamientos.find(t => t.testigo); return {A, B, C}; }
function compLal(T, v) {
  const {A, B, C} = ladosLal(T), dec = v.dec ?? 2, menor = menorEsMejor(v);
  const de = t => { if (!t) return null; const ps = T.parcelas.filter(p => p.trat === t.cod), vals = ps.map(p => valorP(p, v)), pts = puntosDe(ps, v);
    return {t, ps, vals, pts, media: vals.length && vals.every(x => x != null) ? media0(vals) : null, sd: desvio(pts), n: pts.length}; };
  const a = de(A), b = de(B), c = de(C), R = {ok: false, a, b, c, menor, dec, v};
  if (a?.media == null || b?.media == null) return R;
  R.ok = true; R.dif = a.media - b.media; R.pct = R.dif / Math.abs(b.media || 1) * 100; R.mejorA = menor ? R.dif < 0 : R.dif > 0; R.igual = Math.abs(R.pct) < 1;
  // pares (repeticiones): t pareada si hay 3 o más; si no, comparación de los puntos (orientativa)
  const pares = [...new Set(T.parcelas.map(p => p.bloque))].sort((x, y) => x - y).map(r => [valorP(a.ps.find(p => p.bloque === r), v), valorP(b.ps.find(p => p.bloque === r), v)]).filter(([x, y]) => x != null && y != null);
  R.pares = pares.length; if (pares.length >= 3) R.prueba = {tipo: 'pareada', ...ladoALado(pares.map(p => p[0]), pares.map(p => p[1]))};
  else if (a.pts.length >= 3 && b.pts.length >= 3) R.prueba = {tipo: 'puntos', ...welch(a.pts, b.pts)};
  if (c?.media != null && c.media !== 0) { const ef = x => menor ? (1 - x / c.media) * 100 : (x / c.media - 1) * 100; R.efA = ef(a.media); R.efB = ef(b.media); }
  // economía (rendimiento): umbral = diferencia de costo / precio del grano
  const rend = /^rend/.test(v.id) || /kg\/ha/.test(v.unidad || ''), co = T.lal?.costo || {};
  if (rend && T.lal?.precio > 0 && co[A.cod] != null && co[B.cod] != null) { R.costoExtra = co[A.cod] - co[B.cod]; R.umbral = R.costoExtra / T.lal.precio; R.margen = R.dif * T.lal.precio - R.costoExtra; R.cubre = R.dif >= R.umbral; }
  const u = v.unidad ? ' ' + v.unidad : '', nA = `${A.cod} (${prodTxt(A)})`, nB = `${B.cod} (${prodTxt(B)})`;
  let txt = R.igual ? `${A.cod} y ${B.cod} dieron prácticamente lo mismo (${fmt(a.media, dec)} y ${fmt(b.media, dec)}${u}).`
    : `${R.mejorA ? 'El producto probado' : 'El producto del productor'} fue mejor: ${nA} ${fmt(a.media, dec)}${u} frente a ${nB} ${fmt(b.media, dec)}${u} (${R.dif > 0 ? '+' : ''}${fmt(R.dif, dec)}${u}, ${R.pct > 0 ? '+' : ''}${fmt(R.pct, 1)} %).`;
  if (R.prueba?.tipo === 'pareada' && R.prueba.p != null) txt += R.prueba.p < 0.05 ? ` Con ${R.pares} pares la diferencia es significativa (t pareada p = ${fmt(R.prueba.p, 3)}).` : ` Con ${R.pares} pares la diferencia no es significativa (p = ${fmt(R.prueba.p, 3)}): puede deberse a la variación del lote.`;
  else if (R.prueba?.tipo === 'puntos' && R.prueba.p != null) txt += ` Comparando los ${a.pts.length} y ${b.pts.length} puntos de muestreo la diferencia ${R.prueba.p < 0.05 ? 'supera' : 'no supera'} la variación entre puntos (p = ${fmt(R.prueba.p, 3)}); es orientativo, porque los puntos de una misma franja no son repeticiones independientes.`;
  if (R.efA != null) txt += ` Respecto del testigo sin aplicar: ${A.cod} ${menor ? 'controló' : 'mejoró'} ${fmt(R.efA, 1)} % y ${B.cod} ${fmt(R.efB, 1)} %.`;
  if (R.umbral != null) txt += ` Con un costo ${R.costoExtra >= 0 ? 'extra' : 'menor'} de ${fmt(Math.abs(R.costoExtra), 2)} USD/ha y ${fmt(T.lal.precio, 3)} USD/kg, ${R.costoExtra > 0 ? `hacen falta ${fmt(R.umbral, 0)} kg/ha para pagarlo: ${R.cubre ? 'la diferencia lo cubre' : 'la diferencia no lo cubre'}` : 'el producto probado es más barato'}; margen ${R.margen >= 0 ? '+' : ''}${fmt(R.margen, 1)} USD/ha.`;
  R.txt = txt; return R;
}
// Red de chacras: un par (promedio por lado) por chacra
function redLal(T, v) {
  const {A, B} = ladosLal(T), filas = T.sitios.map(st => { const ps = T.parcelas.filter(p => p.sitio === st.id), m = t => { const vs = ps.filter(p => p.trat === t.cod).map(p => valorP(p, v)); return vs.length && vs.every(x => x != null) ? media0(vs) : null; };
    return {st, a: m(A), b: m(B)}; }), ok = filas.filter(f => f.a != null && f.b != null);
  const rend = /^rend/.test(v.id) || /kg\/ha/.test(v.unidad || ''), co = T.lal?.costo || {}, umbral = rend && T.lal?.precio > 0 && co[A.cod] != null && co[B.cod] != null ? (co[A.cod] - co[B.cod]) / T.lal.precio : 0;
  const menor = menorEsMejor(v), sg = menor ? -1 : 1;
  const r = ok.length ? ladoALado(ok.map(f => sg * f.a), ok.map(f => sg * f.b), sg * umbral) : null;
  return {filas, ok, r, menor, umbral, A, B};
}
let varLal = null;
function analLal(T0) {
  const T = vistaS(T0), red = T0.sitios && !T.__vista, num = vis(T).filter(v => v.tipo !== 'texto'); if (!num.find(v => v.id === varLal)) varLal = num[0]?.id;
  const {A, B, C} = ladosLal(T), ed = puede.diseno(T0), lal = T0.lal || (T0.lal = {}), hayRend = num.some(v => /^rend/.test(v.id) || /kg\/ha/.test(v.unidad || ''));
  const resumen = num.map(v => ({v, R: compLal(T, v)}));
  const celda = (R, l) => l?.media != null ? `<b>${fmt(l.media, R.dec)}</b>${l.sd != null ? `<br><span class="note">± ${fmt(l.sd, R.dec)} (${l.n} pts)</span>` : ''}` : '<span class="note">falta</span>';
  P().innerHTML = `<section class="panel"><h2>${red ? 'Comparación en todas las chacras' : 'Comparación directa'}</h2>
    <p class="lead">${red ? 'Cada chacra aporta un par (promedio de cada lado). Con varias chacras se ve en cuántas ganó el producto y cuánto se gana en promedio.' : 'Producto probado contra el del productor, en la misma chacra y con el mismo manejo. Es una prueba de eficacia a campo, no un ensayo experimental: para generalizar, conviene repetirla en varias chacras.'}</p>
    ${red ? '' : `<div class="card"><div class="tw"><table><thead><tr><th>Medición</th><th class="num"><span class="swatch" style="background:${COL_LADO.A}"></span> ${A.cod} · ${esc(A.nombre)}</th><th class="num"><span class="swatch" style="background:${COL_LADO.B}"></span> ${B.cod} · ${esc(B.nombre)}</th>${C ? `<th class="num">${C.cod} · testigo</th>` : ''}<th class="num">Diferencia ${A.cod} − ${B.cod}</th><th>Resultado</th></tr></thead><tbody>
      ${resumen.map(({v, R}) => `<tr><td>${esc(v.nombre)}${v.unidad ? ` <span class="note">(${esc(v.unidad)})</span>` : ''}</td><td class="num">${celda(R, R.a)}</td><td class="num">${celda(R, R.b)}</td>${C ? `<td class="num">${celda(R, R.c)}</td>` : ''}
        <td class="num">${R.ok ? `${R.dif > 0 ? '+' : ''}${fmt(R.dif, R.dec)}<br><span class="note">${R.pct > 0 ? '+' : ''}${fmt(R.pct, 1)} %</span>` : '—'}</td>
        <td>${R.ok ? (R.igual ? '<span class="chip neu">Igual</span>' : R.mejorA ? `<span class="chip ok">Mejor ${A.cod}</span>` : `<span class="chip warn">Mejor ${B.cod}</span>`) + (R.prueba?.p != null ? ` <span class="note">p ${fmt(R.prueba.p, 3)}</span>` : '') : '<span class="note">Faltan datos</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="note" style="margin:0">Valores: promedio de cada lado (± desvío entre los puntos de muestreo). ${num.some(menorEsMejor) ? 'En enfermedades, plagas y daño, menos es mejor.' : ''}</p></div>`}
    <div class="card row" style="align-items:end"><label class="f">Ver en detalle<select id="var-lal">${num.map(v => `<option value="${v.id}" ${v.id === varLal ? 'selected' : ''}>${esc(v.nombre)}</option>`).join('')}</select></label>
      ${hayRend ? `<label class="f">Costo del lado ${A.cod} (USD/ha)<input type="number" step="any" data-costo="${A.cod}" value="${lal.costo?.[A.cod] ?? ''}" ${ed ? '' : 'disabled'}></label><label class="f">Costo del lado ${B.cod} (USD/ha)<input type="number" step="any" data-costo="${B.cod}" value="${lal.costo?.[B.cod] ?? ''}" ${ed ? '' : 'disabled'}></label>
        <label class="f">Precio del grano (USD/kg)<input type="number" step="any" id="lal-precio" value="${lal.precio ?? ''}" ${ed ? '' : 'disabled'}></label>` : ''}</div>
    <div id="lal-det"></div></section>`;
  const det = () => { const v = num.find(x => x.id === varLal); if (!v) return; const host = $('#lal-det');
    if (red) { const N = redLal(T0, v), r = N.r, u = v.unidad ? ' ' + esc(v.unidad) : '', sg = N.menor ? -1 : 1, dec = v.dec ?? 2;
      host.innerHTML = `<div class="card"><h3>${esc(v.nombre)} en cada chacra</h3><div class="tw"><table><thead><tr><th>Chacra</th><th class="num">${A.cod}</th><th class="num">${B.cod}</th><th class="num">Diferencia</th><th>Ganó</th></tr></thead><tbody>
        ${N.filas.map(f => `<tr><td>${esc(f.st.nombre)}</td><td class="num">${fmt(f.a, dec)}</td><td class="num">${fmt(f.b, dec)}</td><td class="num">${f.a != null && f.b != null ? (f.a - f.b > 0 ? '+' : '') + fmt(f.a - f.b, dec) : '—'}</td><td>${f.a == null || f.b == null ? '<span class="note">faltan datos</span>' : sg * (f.a - f.b) > 0 ? `<span class="chip ok">${A.cod}</span>` : sg * (f.a - f.b) < 0 ? `<span class="chip warn">${B.cod}</span>` : 'Empate'}</td></tr>`).join('')}</tbody></table></div>
        ${r ? `<div class="kpis"><div class="kpi"><span>Chacras con datos</span><b>${r.n}</b></div><div class="kpi"><span>${A.cod} mejor en</span><b>${r.pos} de ${r.n}</b><span>${fmt(r.pctPos, 0)} %</span></div><div class="kpi"><span>Diferencia media</span><b>${r.dif * sg > 0 ? '+' : ''}${fmt(r.dif * sg, dec)}${u}</b><span>${fmt(r.difPct, 1)} %</span></div>
          ${r.icInf != null ? `<div class="kpi"><span>IC 95 %</span><b style="font-size:1rem">${fmt(Math.min(r.icInf * sg, r.icSup * sg), dec)} a ${fmt(Math.max(r.icInf * sg, r.icSup * sg), dec)}</b><span>t pareada p ${fmt(r.p, 3)}</span></div>` : ''}</div>
          <div class="callout"><b>Lectura.</b> En ${r.n} chacra${r.n > 1 ? 's' : ''}, ${esc(A.nombre)} ${N.menor ? 'tuvo menos' : 'superó a'} ${esc(B.nombre)} en ${r.pos} (${fmt(r.pctPos, 0)} %), con una diferencia media de ${r.dif * sg > 0 ? '+' : ''}${fmt(r.dif * sg, dec)}${u}${r.icInf != null ? ` (IC 95 %: ${fmt(Math.min(r.icInf * sg, r.icSup * sg), dec)} a ${fmt(Math.max(r.icInf * sg, r.icSup * sg), dec)}; p = ${fmt(r.p, 3)})` : ''}.${N.umbral ? ` Para pagar el costo extra hacen falta ${fmt(N.umbral, 0)} kg/ha: se superó en ${fmt(r.pctUmbral, 0)} % de las chacras${r.probNuevo != null ? ` (probabilidad estimada de ${fmt(r.probNuevo * 100, 0)} % en una chacra nueva)` : ''}.` : ''}${r.n < 8 ? ' Con menos de 8 chacras la conclusión es preliminar.' : ''}</div>` : '<p class="note">Faltan datos en las chacras.</p>'}</div>`;
      return; }
    const R = compLal(T, v), u = v.unidad ? ' ' + v.unidad : '', ls = [R.a, R.b, R.c].filter(Boolean), max = Math.max(...ls.map(l => l.media || 0)) || 1;
    host.innerHTML = `<div class="card"><h3>${esc(v.nombre)}</h3>
      <div style="display:grid;gap:8px">${ls.map(l => `<div class="row" style="gap:8px;flex-wrap:nowrap"><span style="width:150px;flex:none"><b>${l.t.cod}</b> · ${esc(l.t.nombre)}</span><span style="flex:1;background:var(--soft);border-radius:6px;overflow:hidden;height:22px"><i style="display:block;height:100%;width:${(l.media || 0) / max * 100}%;background:${COL_LADO[l.t.cod]}"></i></span><b style="width:110px;text-align:right">${fmt(l.media, R.dec)}${esc(u)}</b></div>`).join('')}</div>
      ${R.ok ? `<div class="callout"><b>Lectura.</b> ${esc(R.txt)}</div>` : '<p class="note">Cargá los datos de las franjas para ver la comparación.</p>'}
      <details><summary class="note" style="cursor:pointer">Datos de cada franja y punto</summary><div class="tw"><table><thead><tr><th>Franja</th><th>Lado</th><th class="num">Promedio</th><th>Puntos</th></tr></thead><tbody>
        ${[...T.parcelas].sort((a, b) => a.parcela - b.parcela).map(p => `<tr><td>${etiq(T, p)}</td><td>${p.trat}</td><td class="num">${fmt(valorP(p, v), R.dec)}</td><td class="note">${puntosDe([p], v).map(x => fmt(x, R.dec)).join(' · ')}</td></tr>`).join('')}</tbody></table></div></details></div>`; };
  det();
  P().onchange = e => { if (e.target.id === 'var-lal') { varLal = e.target.value; det(); return; }
    if (e.target.dataset.costo) { lal.costo = lal.costo || {}; lal.costo[e.target.dataset.costo] = e.target.value === '' ? null : +e.target.value; guardarPronto(); analLal(T0); }
    if (e.target.id === 'lal-precio') { lal.precio = e.target.value === '' ? null : +e.target.value; guardarPronto(); analLal(T0); } };
  P().onclick = null;
}
async function bloquesLal(T0) {
  const T = vistaS(T0), red = T0.sitios && !T.__vista, {A, B, C} = ladosLal(T), lal = T0.lal || {}, autor = USERS[T0.owner]?.nombre || '', B_ = [];
  const vars = vis(T).filter(v => v.tipo !== 'texto'), conGeo = T.parcelas.every(p => p.geo);
  B_.push({titulo: T0.titulo}, {nota: `${T0.id} · ${RUBROS[T0.rubro].nombre} · ${T0.cultivo} · ${lal.productor || ''}${lal.lote ? ' · ' + lal.lote : ''} · ${T0.lugar} · campaña ${T0.campana || '—'} · responsable: ${autor} · informe generado el ${new Date().toLocaleDateString('es-PY')}`});
  if (T0.ejemplo) B_.push({nota: 'Ejemplo con datos hipotéticos.'});
  B_.push({p: [{t: 'Comparación lado a lado en la parcela del productor. ', b: true}, 'Sirve para probar la eficacia de un producto a campo frente al que usa el productor, con el mismo manejo. No es un ensayo experimental: sus resultados valen para esta chacra y se fortalecen repitiéndola en otras.']});
  B_.push({h1: '1. Objetivo'}, {p: T0.objetivo || '—'});
  const L = layoutLal(T), sup = conGeo ? T.parcelas.reduce((s, p) => s + areaM2(p.geo), 0) : T.parcelas.length * T.parcela.area_m2;
  const cen = conGeo ? (() => { const r = T.parcelas.flatMap(p => p.geo.slice(0, 4)); return [r.reduce((s, q) => s + q[1], 0) / r.length, r.reduce((s, q) => s + q[0], 0) / r.length]; })() : null;
  B_.push({h1: '2. Dónde y cómo'}, {tabla: {cab: ['Dato', 'Valor'], anchos: [3000, 6000], filas: [['Productor', lal.productor || '—'], ['Establecimiento o lote', lal.lote || '—'], ['Lugar', red ? T0.sitios.map(x => x.nombre + (x.lugar ? ' (' + x.lugar + ')' : '')).join('; ') : T.__vista ? nomSitio(T0, T.__vista) : T0.lugar], ['Ubicación (centro)', cen ? `${cen[0].toFixed(6)}, ${cen[1].toFixed(6)}` : 'Sin ubicar con GPS'],
    ['Escala', ESCALAS[lal.escala]?.n || '—'], ['Franjas', `${T.parcelas.length} franjas de ${fmt(T.parcela.ancho, 1)} × ${fmt(T.parcela.largo, 0)} m${lal.sep ? `, separadas ${fmt(lal.sep, 1)} m` : ''} · ${fmt(sup / 10000, 2)} ha en total`], ['Repeticiones', `${T.bloques} par${T.bloques > 1 ? 'es' : ''} por chacra${red ? ` · ${T0.sitios.length} chacras` : ''}`], ['Muestreo', `${lal.puntos || '—'} puntos por franja; se evalúan ${fmt(T.parcela.area_util_m2, 0)} m² por franja (sin ${fmt(T.parcela.cab || 0, 0)} m de cabecera)`]]}});
  try { B_.push({img: await croquisPNG(T), ancho: 15, alto: 9}); } catch (e) { console.warn(e); }
  const fa = await fotoAereaBloques(T0, T); fa.forEach(x => B_.push(x));
  B_.push({h1: '3. Productos comparados'}, {tabla: {cab: ['', ...T.tratamientos.map(t => `${t.cod} · ${t.nombre}`)], anchos: [1800, ...T.tratamientos.map(() => Math.floor(7200 / T.tratamientos.length))], filas: [
    ['Producto y dosis', ...T.tratamientos.map(prodTxt)], ['Principio activo', ...T.tratamientos.map(t => t.productos.map(p => p.pa).filter(Boolean).join(' + ') || '—')],
    ['Registro SENAVE', ...T.tratamientos.map(t => t.productos.map(p => p.reg).filter(Boolean).join(', ') || '—')], ['Costo (USD/ha)', ...T.tratamientos.map(t => lal.costo?.[t.cod] != null ? fmt(lal.costo[t.cod], 2) : '—')], ['Franjas', ...T.tratamientos.map(t => T.parcelas.filter(p => p.trat === t.cod).map(p => etiq(T, p)).join(', '))]]}});
  if (apsDe(T).length) B_.push({h2: 'Aplicaciones y labores'}, {tabla: {cab: ['Fecha', 'Tipo', 'A qué', 'Producto / dosis', 'Momento', 'Condiciones', 'Estado'], anchos: [1180, 1450, 1150, 1950, 1300, 1300, 1050], filas: [...apsDe(T)].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(a => [fechaTxt(a.fecha), a.tipo, aQue(a), a.producto ? a.producto + (a.dosis ? ' · ' + a.dosis : '') : a.tipo === 'Aplicación de tratamientos' ? 'Según el producto de cada lado' : '', a.estadio || '', condTxt(a.cond), estadoApl(a)[1]])}});
  bloqueEquipo(T, B_);
  bloquesCalidad(T, B_);
  B_.push({h1: '4. Resultados'});
  if (red) for (const v of vars) { const N = redLal(T0, v), r = N.r, sg = N.menor ? -1 : 1, dec = v.dec ?? 2; B_.push({h2: v.nombre + (v.unidad ? ` (${v.unidad})` : '')}, {tabla: {cab: ['Chacra', A.cod, B.cod, 'Diferencia'], num: [1, 2, 3], filas: N.filas.map(f => [f.st.nombre, fmt(f.a, dec), fmt(f.b, dec), f.a != null && f.b != null ? fmt(f.a - f.b, dec) : '—'])}});
    if (r) B_.push({p: [{t: 'Lectura: ', b: true}, `En ${r.n} chacras, ${A.nombre} fue mejor en ${r.pos} (${fmt(r.pctPos, 0)} %); diferencia media ${fmt(r.dif * sg, dec)} ${v.unidad || ''}${r.icInf != null ? ` (IC 95 % ${fmt(Math.min(r.icInf * sg, r.icSup * sg), dec)} a ${fmt(Math.max(r.icInf * sg, r.icSup * sg), dec)}; t pareada p = ${fmt(r.p, 3)})` : ''}.${N.umbral ? ` Umbral económico ${fmt(N.umbral, 0)} kg/ha, superado en ${fmt(r.pctUmbral, 0)} % de las chacras.` : ''}`]}); }
  else { const res = vars.map(v => ({v, R: compLal(T, v)}));
    B_.push({tabla: {cab: ['Medición', A.cod, B.cod, ...(C ? [C.cod + ' (testigo)'] : []), `Diferencia ${A.cod} − ${B.cod}`, 'Resultado'], num: [1, 2, 3, ...(C ? [4] : [])], anchos: C ? [2300, 1200, 1200, 1200, 1500, 1600] : [2700, 1400, 1400, 1800, 1700],
      filas: res.map(({v, R}) => [v.nombre + (v.unidad ? ` (${v.unidad})` : ''), fmt(R.a?.media, R.dec), fmt(R.b?.media, R.dec), ...(C ? [fmt(R.c?.media, R.dec)] : []), R.ok ? `${R.dif > 0 ? '+' : ''}${fmt(R.dif, R.dec)} (${R.pct > 0 ? '+' : ''}${fmt(R.pct, 1)} %)` : '—', R.ok ? (R.igual ? 'Igual' : R.mejorA ? `Mejor ${A.cod}` : `Mejor ${B.cod}`) : 'Faltan datos'])}});
    for (const {v, R} of res) { if (!R.ok) continue; B_.push({h2: v.nombre + (v.unidad ? ` (${v.unidad})` : '')});
      try { B_.push({img: await graficoBarras({titulo: v.nombre, unidad: v.unidad, barras: [R.a, R.b, R.c].filter(l => l?.media != null).map(l => ({etiqueta: `${l.t.cod} · ${l.t.nombre}`.slice(0, 28), valor: l.media, color: COL_LADO[l.t.cod], letra: ''}))}), ancho: 14, alto: 6.5}); } catch (e) { console.warn(e); }
      B_.push({nota: [R.a, R.b, R.c].filter(Boolean).map(l => `${l.t.cod}: ${fmt(l.media, R.dec)}${l.sd != null ? ' ± ' + fmt(l.sd, R.dec) : ''} (${l.n} puntos)`).join(' · ')}, {p: [{t: 'Lectura: ', b: true}, R.txt]}); } }
  B_.push({h1: '5. Conclusión'}, {p: conclusionLal(T0)});
  if (T.notas.length) B_.push({h1: 'Anexo 1 · Notas de campo'}, {tabla: {cab: ['Nivel', 'Nota', 'Autor', 'Fecha'], anchos: [1500, 5200, 1400, 1000], filas: notasDe(T).map(n => [nivelNota(T, n), n.texto, USERS[n.autor]?.nombre || '', n.fecha])}});
  B_.push({h1: 'Anexo 2 · Datos por franja'}, {tabla: {cab: ['Franja', 'Lado', ...vars.slice(0, 6).map(v => v.nombre + (v.unidad ? ` (${v.unidad})` : ''))], num: vars.slice(0, 6).map((_, i) => i + 2), filas: [...T.parcelas].sort((a, b) => a.parcela - b.parcela).map(p => [etiq(T, p), p.trat, ...vars.slice(0, 6).map(v => fmt(valorP(p, v), v.dec ?? 2))])}});
  return B_;
}
function conclusionLal(T0) {
  const T = vistaS(T0), vars = vis(T).filter(v => v.tipo !== 'texto'), {A, B} = ladosLal(T);
  if (T0.sitios && !T.__vista) { const v = vars.find(x => /^rend/.test(x.id)) || vars[0]; const N = v && redLal(T0, v); return N?.r ? `${A.nombre} fue mejor que ${B.nombre} en ${N.r.pos} de ${N.r.n} chacras en ${v.nombre.toLowerCase()}.` : 'Faltan datos para concluir.'; }
  const res = vars.map(v => ({v, R: compLal(T, v)})).filter(x => x.R.ok); if (!res.length) return 'Faltan datos para concluir.';
  const gana = res.filter(x => x.R.mejorA && !x.R.igual), pierde = res.filter(x => !x.R.mejorA && !x.R.igual), rend = res.find(x => /^rend/.test(x.v.id));
  return `${A.nombre} (${prodTxt(A)}) fue mejor que ${B.nombre} (${prodTxt(B)}) en ${gana.length} de ${res.length} mediciones${gana.length ? ` (${gana.map(x => x.v.nombre.toLowerCase()).join(', ')})` : ''}${pierde.length ? ` y peor en ${pierde.map(x => x.v.nombre.toLowerCase()).join(', ')}` : ''}.${rend ? ` En rendimiento la diferencia fue de ${rend.R.dif > 0 ? '+' : ''}${fmt(rend.R.dif, 0)} kg/ha (${rend.R.pct > 0 ? '+' : ''}${fmt(rend.R.pct, 1)} %)${rend.R.margen != null ? `, con un margen de ${rend.R.margen >= 0 ? '+' : ''}${fmt(rend.R.margen, 1)} USD/ha` : ''}.` : ''} Resultado de una sola chacra${T.bloques > 1 ? ` con ${T.bloques} pares` : ''}: para recomendarlo conviene repetir la prueba en otras chacras.`;
}
// Croquis como imagen (para el Word): franjas sobre fondo liso, con medidas
async function croquisPNG(T) {
  const L = layoutLal(T), W = 1400, H = 820, m = 70, k = Math.min((W - 2 * m) / L.W, (H - 2 * m) / L.H), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#eef3ea'; g.fillRect(0, 0, W, H); const ox = (W - L.W * k) / 2, oy = (H - L.H * k) / 2;
  T.parcelas.forEach(p => { const [x, y, w, h] = L.R[p.parcela], col = COL_LADO[p.trat] || '#888'; g.fillStyle = col + '66'; g.fillRect(ox + x * k, oy + y * k, w * k, h * k); g.strokeStyle = col; g.lineWidth = 4; g.strokeRect(ox + x * k, oy + y * k, w * k, h * k);
    g.fillStyle = '#111'; g.font = `bold ${Math.max(22, Math.min(54, w * k / 3))}px Calibri, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.trat, ox + (x + w / 2) * k, oy + (y + h / 2) * k);
    g.font = '22px Calibri, Arial'; g.fillText(String(etiq(T, p)), ox + (x + w / 2) * k, oy + (y + h / 2) * k + 44); });
  g.fillStyle = '#334'; g.font = '24px Calibri, Arial'; g.textAlign = 'center'; g.fillText(`${fmt(L.W, 1)} m`, W / 2, oy - 22); g.save(); g.translate(ox - 26, H / 2); g.rotate(-Math.PI / 2); g.fillText(`${fmt(L.H, 0)} m · sentido de avance →`, 0, 0); g.restore();
  const blob = await new Promise(ok => c.toBlob(ok, 'image/png')); return new Uint8Array(await blob.arrayBuffer());
}

/* ================= foto aérea general (dron) recortada por bloque ================= */
// Medidas del croquis en metros: parcelas por bloque a lo ancho, bloques uno debajo del otro (con calle).
function layoutM(T) {
  if (esLal(T)) { const L = layoutLal(T), grupos = T.parcelas.map(p => ({id: p.parcela, txt: `Franja ${etiq(T, p)} · ${p.trat}`, r: L.R[p.parcela]})); return {...L, grupos, unidad: 'franja'}; }
  const pa = T.parcela, g = (T.__vista ? T.sitios.find(x => x.id === T.__vista)?.geo : T.geo) || {};
  const ancho = +(g.ancho || (pa.hileras ? pa.hileras * pa.dist : pa.ancho || (pa.columnas ? pa.columnas * pa.e2 : pa.entre ? pa.entre * 2 : 0)) || Math.sqrt(pa.area_m2 || 9));
  const largo = +(g.largo || pa.largo || (pa.filas ? pa.filas * pa.e1 : 0) || (pa.area_m2 ? pa.area_m2 / ancho : 3)), calle = +(g.calle ?? 1), sep = +(g.sepP || 0), nT = T.tratamientos.length, R = {};
  T.parcelas.forEach(p => { const c = (p.parcela % 100) - 1, b = p.bloque - 1; R[p.parcela] = [c * (ancho + sep), b * (largo + calle), ancho, largo]; });
  const W = nT * ancho + (nT - 1) * sep, H = T.bloques * largo + (T.bloques - 1) * calle;
  const grupos = Array.from({length: T.bloques}, (_, i) => ({id: 'B' + (i + 1), txt: `Bloque ${i + 1}`, r: [0, i * (largo + calle), W, largo]}));
  return {W, H, R, grupos, unidad: 'bloque'};
}
const faDe = (T0, T) => (T.__vista ? T0.sitios.find(x => x.id === T.__vista) : T0.sitios ? null : T0);
const IMG_AEREA = new Map(); // caché de imágenes cargadas
async function imagenAerea(T0, fa) {
  const k = fa.img || fa.src; if (IMG_AEREA.has(k)) return IMG_AEREA.get(k);
  let url = fa.src; if (fa.img) { const im = (await DB.imagenesDe(T0.id).catch(() => [])).find(i => i.id === fa.img); if (!im) return null; url = URL.createObjectURL(im.blob); }
  const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; }); if (img) IMG_AEREA.set(k, img); return img;
}
const rehacerPaso = () => { if (S.T && !$('#s-ensayo').hidden) RENDER[PASOS[S.paso][0]](S.T); };
function cardFotoAerea(T0, T) {
  if (T0.sitios && !T.__vista) return '';
  const fa = faDe(T0, T)?.fotoAerea, ed = rolEn(T0) !== 'lector', L = layoutM(T);
  return `<div class="card" id="card-aerea"><div class="row" style="justify-content:space-between"><h3>Foto aérea general (dron)</h3>
    ${ed ? `<span class="row" style="gap:6px">${fa ? '<button class="btn small" id="fa-ajustar">Ajustar al croquis</button>' : ''}<label class="btn small ${fa ? '' : 'primary'}" style="position:relative">📷 ${fa ? 'Cambiar foto' : 'Cargar foto aérea'}<input type="file" accept="image/*" id="fa-file" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>${fa ? '<button class="btn small" id="fa-quitar">Quitar</button>' : ''}</span>` : ''}</div>
    ${fa ? `<canvas id="fa-cv" style="width:100%;border-radius:10px;background:#222;display:block"></canvas>
      <p class="note" style="margin:0">Foto ${fa.fecha ? 'del ' + fechaTxt(fa.fecha) : ''}${fa.ejemplo ? ' (imagen simulada de ejemplo)' : ''}. Con las medidas del croquis (${fmt(L.W, 1)} × ${fmt(L.H, 1)} m) la app recorta la imagen de cada ${L.unidad}. Tocá un recorte para verlo grande.</p>
      <div class="fa-rec" id="fa-rec"></div>`
      : `<p class="note" style="margin:0">Una foto común tomada con el dron (no hace falta que sea multiespectral). Se marca dónde quedan las esquinas del ensayo y la app encuadra la imagen de cada ${L.unidad} según las medidas. Queda como foto general del ensayo y sale en el informe.</p>`}</div>`;
}
// Dibuja la foto con el croquis encima y arma los recortes
async function pintarFotoAerea(T0, T) {
  const fa = faDe(T0, T)?.fotoAerea, cv = $('#fa-cv'); if (!fa || !cv) return;
  const img = await imagenAerea(T0, fa); if (!img || !cv.isConnected) return;
  const W = Math.min(1400, img.naturalWidth), H = Math.round(W * img.naturalHeight / img.naturalWidth); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0, W, H); dibujarCroquisSobre(g, T, fa.esq.map(([u, v]) => [u * W, v * H]), W / 1400);
  const host = $('#fa-rec'); if (!host) return; const L = layoutM(T), recs = await recortesAereos(T0, T, img, fa, L.grupos);
  host.classList.toggle('estrecho', L.unidad === 'franja');
  host.innerHTML = recs.map(r => `<figure data-fa-ver="${r.id}"><img src="${r.url}" alt="${esc(r.txt)}"><figcaption>${esc(r.txt)}</figcaption></figure>`).join('');
}
function dibujarCroquisSobre(g, T, q, esc0 = 1) {
  const L = layoutM(T), map = homografia(q), P = (x, y) => map(x / L.W, y / L.H), C = colTrat(T);
  g.lineWidth = Math.max(1.5, 2.5 * esc0); g.font = `700 ${Math.max(11, 15 * esc0)}px Archivo, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of T.parcelas) { const [x, y, w, h] = L.R[p.parcela], pts = [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)];
    g.strokeStyle = esLal(T) ? COL_LADO[p.trat] : 'rgba(255,238,88,.95)'; g.beginPath(); pts.forEach((pt, i) => i ? g.lineTo(...pt) : g.moveTo(...pt)); g.closePath(); g.stroke();
    const c = P(x + w / 2, y + h / 2), t = esLal(T) ? p.trat : `${p.parcela % 1000} ${p.trat}`; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(t, ...c); g.fillStyle = '#fff'; g.fillText(t, ...c); g.lineWidth = Math.max(1.5, 2.5 * esc0); }
}
// Recortes enderezados de cada bloque (o franja) a partir de las esquinas marcadas
const REC_AEREA = new Map();
async function recortesAereos(T0, T, img, fa, grupos) {
  const clave = (fa.img || fa.src) + JSON.stringify(fa.esq) + JSON.stringify(layoutM(T).R) + grupos.map(g => g.id).join(',');
  if (REC_AEREA.has(clave)) return REC_AEREA.get(clave);
  const W = Math.min(2400, img.naturalWidth), H = Math.round(W * img.naturalHeight / img.naturalWidth), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(img, 0, 0, W, H); const src = x.getImageData(0, 0, W, H);
  const q = fa.esq.map(([u, v]) => [u * W, v * H]), L = layoutM(T), map = homografia(q), P = (a, b) => map(a / L.W, b / L.H);
  const ppm = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2 / L.W; // píxeles por metro
  const out = [];
  for (const gr of grupos) { const [gx, gy, gw, gh] = gr.r, k = Math.min(ppm * 1.2, 900 / Math.max(gw, gh)), ow = Math.max(8, Math.round(gw * k)), oh = Math.max(8, Math.round(gh * k));
    const R = rectificar(src, [P(gx, gy), P(gx + gw, gy), P(gx + gw, gy + gh), P(gx, gy + gh)], ow, oh), cc = document.createElement('canvas'); cc.width = ow; cc.height = oh; cc.getContext('2d').putImageData(new ImageData(R.data, ow, oh), 0, 0);
    const blob = await new Promise(ok => cc.toBlob(ok, 'image/jpeg', 0.88)); out.push({id: gr.id, txt: gr.txt, blob, url: URL.createObjectURL(blob), w: ow, h: oh}); }
  REC_AEREA.set(clave, out); return out;
}
async function cargarFotoAerea(T0, T, file) {
  const dest = faDe(T0, T); if (!dest) return toast('Elegí un lugar arriba para cargar su foto aérea');
  const bmp = await createImageBitmap(file), k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.86)), id = 'aerea-' + Date.now().toString(36);
  if (dest.fotoAerea?.img) await DB.borrarImagen(dest.fotoAerea.img).catch(() => {});
  await DB.guardarImagen({id, ensayo: T0.id, tipo: 'aerea', nombre: file.name, fecha: ahora(), autor: S.user.id, blob});
  dest.fotoAerea = {img: id, esq: [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]], fecha: HOY, W: c.width, H: c.height};
  T0.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: 'Foto aérea general', antes: null, despues: file.name, estado: 'aprobado'});
  await guardarAhora(); ajustarFotoAerea(T0, T, true);
}
// Marcar las 4 esquinas del ensayo sobre la foto, con el croquis dibujado encima mientras se arrastra
async function ajustarFotoAerea(T0, T, nueva) {
  const dest = faDe(T0, T), fa = dest?.fotoAerea; if (!fa) return; const img = await imagenAerea(T0, fa); if (!img) return toast('No se encontró la imagen');
  const L = layoutM(T), nom = esLal(T) ? ['Inicio de la primera franja (izquierda)', 'Inicio de la última franja (derecha)', 'Fin de la última franja', 'Fin de la primera franja'] : ['Esquina de la parcela 101', `Fin del bloque 1 (parcela ${100 + T.tratamientos.length})`, 'Fin del último bloque', `Inicio del último bloque (parcela ${T.bloques * 100 + 1})`];
  let esq = fa.esq.map(p => [...p]);
  const M = modal(`<div class="row" style="justify-content:space-between"><h2>Ubicar el croquis en la foto</h2><button class="btn small" data-cerrar>✕</button></div>
    <p class="note" style="margin:0">Arrastrá los 4 puntos a las esquinas del ${esLal(T) ? 'área de las franjas' : 'ensayo'} en la foto. Las líneas muestran cómo quedan ${esLal(T) ? 'las franjas' : 'las parcelas'} según las medidas (${fmt(L.W, 1)} × ${fmt(L.H, 1)} m). Punto <b style="color:#22c55e">1</b>: ${esc(nom[0])}.</p>
    <div style="position:relative;touch-action:none" id="fa-wrap"><canvas id="fa-ed" style="width:100%;display:block;border-radius:10px"></canvas></div>
    <div class="row"><button class="btn small" id="fa-girar">↻ Girar el croquis</button><button class="btn small" id="fa-espejo">⇋ Invertir</button><span class="note">${nom.map((n, i) => `${i + 1}: ${esc(n)}`).join(' · ')}</span></div>
    <div class="row"><button class="btn primary" id="fa-ok">Guardar y recortar</button>${nueva ? '' : '<button class="btn" data-cerrar>Cancelar</button>'}</div>`, 980);
  const cv = M.querySelector('#fa-ed'), wrap = M.querySelector('#fa-wrap'), W = Math.min(1600, img.naturalWidth), H = Math.round(W * img.naturalHeight / img.naturalWidth); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), dib = () => { g.drawImage(img, 0, 0, W, H); dibujarCroquisSobre(g, T, esq.map(([u, v]) => [u * W, v * H]), W / 1400);
    esq.forEach(([u, v], i) => { g.beginPath(); g.arc(u * W, v * H, 16 * W / 1400 + 6, 0, 7); g.fillStyle = i ? 'rgba(250,204,21,.85)' : 'rgba(34,197,94,.9)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke();
      g.fillStyle = '#000'; g.font = `700 ${Math.round(14 * W / 1400 + 6)}px Archivo, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(i + 1, u * W, v * H); }); };
  dib(); let arr = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  cv.onpointerdown = e => { const [u, v] = pos(e), r = cv.getBoundingClientRect(); let mejor = -1, dm = 40 / r.width; esq.forEach(([a, b], i) => { const d = Math.hypot((a - u) * r.width, (b - v) * r.height) / r.width; if (d < dm) { dm = d; mejor = i; } });
    if (mejor >= 0) { arr = mejor; cv.setPointerCapture(e.pointerId); e.preventDefault(); } };
  cv.onpointermove = e => { if (arr == null) return; esq[arr] = pos(e); dib(); }; cv.onpointerup = () => { arr = null; };
  M.querySelector('#fa-girar').onclick = () => { esq = [esq[3], esq[0], esq[1], esq[2]]; dib(); };
  M.querySelector('#fa-espejo').onclick = () => { esq = [esq[1], esq[0], esq[3], esq[2]]; dib(); };
  M.querySelector('#fa-ok').onclick = async () => { fa.esq = esq.map(([u, v]) => [+u.toFixed(5), +v.toFixed(5)]); delete fa.ejemplo; M.cerrar(); toast('Croquis ubicado: recortes listos'); await guardarAhora(); rehacerPaso(); };
}
function clicFotoAereaCambio(e, T0, T) { if (e.target.id !== 'fa-file') return false; const f = e.target.files[0]; if (f) cargarFotoAerea(T0, T, f); return true; }
async function clicFotoAerea(e, T0, T) {
  if (e.target.closest('#fa-ajustar')) { ajustarFotoAerea(T0, T); return true; }
  if (e.target.closest('#fa-quitar')) { if (!await confirmar('Quitar la foto aérea', 'Se quita la foto aérea general y sus recortes.', {ok: 'Quitar', peligro: true})) return true;
    const d = faDe(T0, T); if (d?.fotoAerea?.img) await DB.borrarImagen(d.fotoAerea.img).catch(() => {}); delete d.fotoAerea; await guardarAhora(); rehacerPaso(); return true; }
  const v = e.target.closest('[data-fa-ver]'); if (v) { const im = v.querySelector('img'); const M = modal(`<div class="row" style="justify-content:space-between"><h2>${esc(v.querySelector('figcaption').textContent)}</h2><button class="btn small" data-cerrar>✕</button></div><img src="${im.src}" alt="" style="width:100%;border-radius:10px">`, 1100); void M; return true; }
  if (e.target.closest('#fa-cv')) { const d = faDe(T0, T); if (d?.fotoAerea) { const img = await imagenAerea(T0, d.fotoAerea); if (img) modal(`<div class="row" style="justify-content:space-between"><h2>Foto aérea</h2><button class="btn small" data-cerrar>✕</button></div><img src="${img.src}" alt="" style="width:100%;border-radius:10px">`, 1200); } return true; }
  return false;
}
// Recorte de una parcela para el control de parcela
async function recorteParcela(T0, pn) {
  const T = T0.sitios ? vistaS(T0, sitioDe(T0, pn)?.id) : T0, fa = faDe(T0, T)?.fotoAerea; if (!fa) return null;
  const img = await imagenAerea(T0, fa); if (!img) return null; const L = layoutM(T); if (!L.R[pn]) return null;
  const [r] = await recortesAereos(T0, T, img, fa, [{id: 'p' + pn, txt: `${esLal(T) ? 'Franja' : 'Parcela'} ${pn}`, r: L.R[pn]}]); return r;
}
// Bloques para el Word: foto general con el croquis y un recorte por bloque o franja
async function fotoAereaBloques(T0, T) {
  const fa = faDe(T0, T)?.fotoAerea; if (!fa) return []; const img = await imagenAerea(T0, fa); if (!img) return [];
  const W = Math.min(1600, img.naturalWidth), H = Math.round(W * img.naturalHeight / img.naturalWidth), c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H); dibujarCroquisSobre(g, T, fa.esq.map(([u, v]) => [u * W, v * H]), W / 1400);
  const u8 = async cv => new Uint8Array(await (await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.85))).arrayBuffer());
  const B = [{h2: 'Foto aérea general (dron)'}, {img: await u8(c), jpg: true, ancho: 15, alto: +(15 * H / W).toFixed(2)}, {nota: `Foto aérea ${fa.fecha ? 'del ' + fechaTxt(fa.fecha) : ''} con el croquis ubicado según las medidas.${fa.ejemplo ? ' Imagen simulada de ejemplo.' : ''}`}];
  const L = layoutM(T), recs = await recortesAereos(T0, T, img, fa, L.grupos);
  for (const r of recs) { const ancho = Math.min(15, 8 * r.w / r.h), alto = Math.min(9, ancho * r.h / r.w); B.push({nota: r.txt}, {img: new Uint8Array(await r.blob.arrayBuffer()), jpg: true, ancho: +(alto * r.w / r.h).toFixed(2), alto: +alto.toFixed(2)}); }
  return B;
}

/* ================= ensayo ================= */
const PASOS = [['plan', 'Planificación'], ['trat', 'Tratamientos y dosis'], ['aplic', 'Aplicaciones y manejo'], ['campo', 'Croquis y parcelas'], ['medir', 'Mediciones'], ['datos', 'Carga de datos'], ['equipo', 'Equipo y cambios'], ['anal', 'Análisis'], ['exp', 'Informe y exportar']];
const metaEnsayo = T => `<span>${RUBROS[T.rubro].nombre}</span><span>${esc(T.cultivo)}</span><span>${esc(T.tipo)}</span>${esLal(T) && T.lal?.productor ? `<span>${esc(T.lal.productor)}</span>` : ''}<span>${esc(T.sitios ? T.sitios.map(x => x.nombre).join(' · ') : T.lugar)}</span><span>${esLal(T) ? `Lado a lado · ${T.tratamientos.length} lados${T.bloques > 1 ? ` × ${T.bloques} pares` : ''}${T.sitios ? ` × ${T.sitios.length} chacras` : ''}` : `DBCA · ${T.tratamientos.length} × ${T.bloques}${T.sitios ? ` × ${T.sitios.length} lugares` : ''}`}</span>`;
function abrir(T, paso) {
  if (S.T !== T) S.sitio = null; S.T = T; S.sel = null; S.rubro = T.rubro; mapa.reset(); aplForm = false; aplReal = null;
  const r = rolEn(T);
  $('#e-id').textContent = T.id; $('#e-titulo').textContent = T.titulo; $('#e-ren').hidden = !puede.diseno(T); $('#e-ren-box').hidden = true; $('#e-tit-box').hidden = false;
  $('#e-rol').innerHTML = `<span class="chip ${r === 'lector' ? 'neu' : 'acc'}">Tu rol: ${ROLNOM[r]}</span>`;
  $('#e-meta').innerHTML = metaEnsayo(T);
  $('#e-leyenda').innerHTML = T.imagen && T.dron ? '<span class="chip hypo">● Dato hipotético</span><span class="chip dron">● Medido del dron</span>' : '';
  pantalla('ensayo');
  irPaso(paso ? Math.max(0, PASOS.findIndex(p => p[0] === paso)) : 0);
}
$('#volver').onclick = () => { cerrarDrawer(); irInicio(); };
$('#e-ren').onclick = () => { $('#e-ren-txt').value = S.T.titulo; $('#e-tit-box').hidden = true; $('#e-ren-box').hidden = false; $('#e-ren-txt').focus(); $('#e-ren-txt').select(); };
$('#e-ren-no').onclick = () => { $('#e-ren-box').hidden = true; $('#e-tit-box').hidden = false; };
$('#e-ren-box').addEventListener('submit', e => { e.preventDefault(); const T = S.T, nuevo = $('#e-ren-txt').value.trim(); if (!nuevo) return;
  if (nuevo !== T.titulo) { T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: 'Nombre del ensayo', antes: T.titulo, despues: nuevo, estado: 'aprobado'}); T.titulo = nuevo; toast('Nombre actualizado'); }
  $('#e-titulo').textContent = T.titulo; $('#e-ren-box').hidden = true; $('#e-tit-box').hidden = false; if (PASOS[S.paso][0] === 'plan' || PASOS[S.paso][0] === 'equipo') RENDER[PASOS[S.paso][0]](T); });
function irPaso(i) {
  S.paso = Math.max(0, Math.min(PASOS.length - 1, i)); const T = S.T;
  const pc = T.cambios.filter(c => c.estado === 'pendiente').length;
  $('#steps').innerHTML = PASOS.map((p, j) => `<button role="tab" aria-selected="${j === S.paso}" data-i="${j}"><span class="n">${j + 1}</span><span>${esLal(T) ? ({trat: 'Productos comparados', campo: 'Ubicación y franjas', anal: 'Comparación'}[p[0]] || p[1]) : p[0] === 'campo' && T.dron ? 'Campo y dron' : p[1]}</span>${p[0] === 'equipo' && pc && puede.revisar(T) ? `<span class="chip warn">${pc}</span>` : '<span></span>'}</button>`).join('');
  $('#prev').style.visibility = S.paso ? 'visible' : 'hidden'; $('#next').style.visibility = S.paso < PASOS.length - 1 ? 'visible' : 'hidden';
  barraSitios(T); RENDER[PASOS[S.paso][0]](T); vozEn(P());
  const act = $('#steps [aria-selected="true"]'); if (act && innerWidth <= 900) act.parentElement.scrollLeft = act.offsetLeft - (act.parentElement.clientWidth - act.offsetWidth) / 2;
}
$('#steps').onclick = e => { const b = e.target.closest('button'); if (b) irPaso(+b.dataset.i); };
$('#prev').onclick = () => { irPaso(S.paso - 1); scrollTo({top: 0}); };
$('#next').onclick = () => { irPaso(S.paso + 1); scrollTo({top: 0}); };
const P = () => $('#panel');
const aviso = (T, que) => rolEn(T) === 'lector' ? `<div class="callout warn">Estás como <b>observador</b>: ves todos los avances y podés descargar informes, pero no modificar nada.</div>`
  : rolEn(T) === 'operador' && que ? `<div class="callout">${que}</div>` : '';

const RENDER = {};
/* ---------- pasturas: cortes ---------- */
function cortesCard(T, ed) {
  const ult = T.cortes[T.cortes.length - 1], desde = ult ? ult.fecha : T.uniformizacion;
  const bases = T.porCorte.map(b => varDef(T.rubro, b)).filter(Boolean), cargado = c => { const vs = T.variables.filter(v => v.corte === c.n && !auto(v)); const tot = vs.length * T.parcelas.length;
    return tot ? Math.round(T.parcelas.reduce((s, p) => s + vs.filter(v => p.valores[v.id] != null && p.valores[v.id] !== '').length, 0) / tot * 100) : 0; };
  return `<div class="card" id="cortes-card"><div class="row" style="justify-content:space-between"><h3>Cortes de forraje</h3><span class="note">Se mide en cada corte: ${bases.map(b => esc(b.nombre.toLowerCase())).join(', ') || '—'}</span></div>
    <div class="tw"><table><thead><tr><th>Corte</th><th>Fecha</th><th class="num">Días de rebrote</th><th>Carga</th></tr></thead><tbody>
    ${T.uniformizacion ? `<tr><td>Uniformización</td><td>${fechaTxt(T.uniformizacion)}</td><td class="num">—</td><td><span class="note">Inicio de las evaluaciones</span></td></tr>` : ''}
    ${T.cortes.map(c => { const k = cargado(c); return `<tr><td><b>Corte ${c.n}</b></td><td>${fechaTxt(c.fecha)}</td><td class="num">${c.dias}</td><td><span class="chip ${k === 100 ? 'ok' : k ? 'warn' : 'neu'}">${k} % cargado</span></td></tr>`; }).join('') || '<tr><td colspan="4" class="note">Todavía no hay cortes.</td></tr>'}</tbody></table></div>
    ${ed ? `<div class="row" style="align-items:end">${T.uniformizacion ? '' : `<label class="f">Corte de uniformización<input type="date" id="cu-fecha"></label>`}<label class="f">Fecha del nuevo corte<input type="date" id="nc-fecha" value="${HOY}"></label><button class="btn primary small" id="btn-corte">+ Agregar corte</button><span class="note" id="nc-msg">${desde ? `Días de rebrote desde el ${fechaTxt(desde)}.` : 'Cargá primero la fecha del corte de uniformización.'}</span></div>
      <p class="note" style="margin:0">Al agregar un corte se crean sus mediciones para cargar en cada parcela. La producción acumulada y la tasa de crecimiento se calculan solas.</p>` : ''}</div>`;
}
function agregarCorte(T) {
  if (!T.uniformizacion) { const u = $('#cu-fecha')?.value; if (!u) { $('#nc-msg').textContent = 'Falta la fecha del corte de uniformización.'; return false; } T.uniformizacion = u; }
  const f = $('#nc-fecha').value, prev = T.cortes.length ? T.cortes[T.cortes.length - 1].fecha : T.uniformizacion, d = Math.round((Date.parse(f) - Date.parse(prev)) / 86400000);
  if (!f || d <= 0) { $('#nc-msg').textContent = `La fecha tiene que ser posterior al ${fechaTxt(prev)}.`; return false; }
  const c = {n: T.cortes.length + 1, fecha: f, dias: d}; T.cortes.push(c); armarCortes(T);
  T.aplicaciones.push({id: nuevoIdAp(), tipo: 'Corte de forraje', fecha: f, estado: f <= HOY ? 'realizada' : 'planificada', trats: 'todos', producto: `Corte ${c.n} de evaluación`, dosis: `${d} días de rebrote`, resp: S.user.id});
  T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: `Corte ${c.n} agregado`, antes: null, despues: fechaTxt(f), estado: 'aprobado'});
  toast(`Corte ${c.n} agregado (${d} días de rebrote)`); return true;
}
/* ---------- fotos (ensayo y parcelas), guardadas en este equipo ---------- */
const fotoBtn = k => `<label class="btn small" style="position:relative">📷 Agregar foto<input type="file" accept="image/*" capture="environment" multiple data-foto-in="${k}" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>`;
async function achicar(file, max = 1600) {
  const url = URL.createObjectURL(file); try {
    const im = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
  } finally { URL.revokeObjectURL(url); }
}
async function subirFotos(input, T, pn) {
  const fs = [...input.files]; if (!fs.length) return; let n = 0;
  for (const f of fs) { try { const blob = await achicar(f); await DB.guardarImagen({id: 'img' + Date.now() + Math.random().toString(36).slice(2, 6), ensayo: T.id, parcela: pn, nombre: f.name, fecha: new Date().toISOString(), autor: S.user.id, blob}); n++; } catch (e) { console.error(e); } }
  toast(n ? `${n} foto${n > 1 ? 's' : ''} guardada${n > 1 ? 's' : ''}` : 'No se pudo leer la imagen'); input.value = ''; pintarFotos(T, pn);
}
async function pintarFotos(T, pn) {
  const host = document.querySelector(`[data-fotos="${pn ?? 'ensayo'}"]`); if (!host) return;
  const todas = await DB.imagenesDe(T.id).catch(() => []), mias = todas.filter(i => i.tipo !== 'papel' && i.tipo !== 'aerea' && (i.parcela ?? null) === (pn ?? null)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  host.querySelectorAll('img').forEach(i => URL.revokeObjectURL(i.src));
  const borra = rolEn(T) !== 'lector';
  host.innerHTML = mias.length ? mias.map(i => `<figure><img src="${URL.createObjectURL(i.blob)}" alt="${esc(i.nombre)}" data-ver="${i.id}" title="${esc(USERS[i.autor]?.nombre || '')} · ${new Date(i.fecha).toLocaleString('es-PY')}">${borra ? `<button class="btn small" data-borra-foto="${i.id}" aria-label="Borrar foto">✕</button>` : ''}</figure>`).join('') : '<p class="note" style="margin:0">Sin fotos.</p>';
}
async function clicFotos(e, T, pn) {
  const v = e.target.closest('[data-ver]'); if (v) { const i = (await DB.imagenesDe(T.id)).find(x => x.id === v.dataset.ver); if (!i) return true; const d = document.createElement('div'); d.className = 'visor';
    const u = URL.createObjectURL(i.blob); d.innerHTML = `<div><img src="${u}" alt=""><p>${esc(i.nombre)} · ${esc(USERS[i.autor]?.nombre || '')} · ${new Date(i.fecha).toLocaleString('es-PY')}</p></div>`; d.onclick = () => { URL.revokeObjectURL(u); d.remove(); }; document.body.append(d); return true; }
  const b = e.target.closest('[data-borra-foto]'); if (b) { if (await confirmar('Borrar foto', '¿Borrar esta foto?', {ok: 'Borrar', peligro: true})) { await DB.borrarImagen(b.dataset.borraFoto); pintarFotos(T, pn); } return true; }
  return false;
}
function duplicarEnsayo(T) {
  const C = structuredClone(T), n = TRIALS.length + 1, id = nuevoIdEnsayo();
  Object.assign(C, {id, titulo: T.titulo + ' (copia)', owner: S.user.id, equipo: S.user.perfil === 'gerente' ? S.user.equipo : T.equipo, ejemplo: false, creado: new Date().toISOString(),
    notas: [], cambios: [], aplicaciones: [], asig: {}, trabajo: {}, compartido: {}, cortes: T.cortes ? [] : undefined, uniformizacion: undefined, imagen: undefined, dron: !!T.dron && !T.imagen});
  C.parcelas = T.parcelas.map(p => ({parcela: p.parcela, bloque: p.bloque, trat: p.trat, valores: {}, sub: {}}));
  if (C.cortes) { C.variables = C.variables.filter(v => !v.corte && v.origen !== 'calc'); }
  TRIALS.push(C); toast('Ensayo duplicado: revisá nombre, lugar y fechas'); abrir(C, 'plan');
}
function nuevoIdEnsayo() { const y = new Date().getFullYear(); let n = TRIALS.filter(T => T.id.startsWith(`ENS-${y}-`)).length + 1, id; do { id = `ENS-${y}-${String(n++).padStart(3, '0')}`; } while (TRIALS.some(T => T.id === id)); return id; }
/* dictado por voz en campos de texto (necesita internet y Chrome/Edge) */
const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
function vozEn(host) {
  if (!Reco || !window.isSecureContext || !host) return;
  host.querySelectorAll('textarea[data-voz]:not([data-voz-ok]), input[data-voz]:not([data-voz-ok])').forEach(campo => {
    campo.dataset.vozOk = 1; const w = document.createElement('div'); w.className = 'campo-dictado'; campo.parentNode.insertBefore(w, campo); w.append(campo);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-dictado'; b.title = 'Dictar por voz'; b.setAttribute('aria-label', 'Dictar por voz'); b.textContent = '🎤'; w.append(b);
    let r = null, base = '';
    b.onclick = () => { if (r) { r.stop(); return; } r = new Reco(); r.lang = 'es-PY'; r.continuous = true; r.interimResults = true; base = campo.value ? campo.value.replace(/\s*$/, ' ') : '';
      r.onresult = ev => { let t = ''; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; campo.value = base + t; campo.dispatchEvent(new Event('input', {bubbles: true})); };
      r.onend = () => { r = null; b.classList.remove('escuchando'); b.textContent = '🎤'; }; r.onerror = ev => { if (ev.error === 'network') toast('El dictado necesita internet'); else if (ev.error === 'not-allowed') toast('Permití el micrófono para dictar'); };
      try { r.start(); b.classList.add('escuchando'); b.textContent = '⏹'; } catch (e) { r = null; } };
  });
}
/* "Cómo va este ensayo": lista de lo que falta, con atajos */
function comoVa(T) {
  if (rolEn(T) === 'lector') return '';
  const conProd = /fungic|herbic|insectic|fertiliz|dosis|eficacia|producto|bioestim|fitotox|salivazo|malezas/i.test(T.tipo), noTest = T.tratamientos.filter(t => !t.testigo);
  const medibles = vis(T).filter(v => v.tipo !== 'texto'), pr = progreso(T), listas = medibles.filter(v => (esLal(T) ? compLal(T, v) : analizar(T, v)).ok).length;
  const items = [
    conProd && {ok: noTest.every(t => t.productos.length), t: esLal(T) ? 'Productos de cada lado' : 'Productos y dosis de cada tratamiento', d: noTest.every(t => t.productos.length) ? 'Cargados' : `Faltan en ${noTest.filter(t => !t.productos.length).map(t => t.cod).join(', ')}`, ir: 'trat'},
    esLal(T) && {ok: T.parcelas.every(p => p.geo), t: 'Ubicar las franjas con el GPS', d: T.parcelas.every(p => p.geo) ? 'Ubicadas en el mapa' : 'Marcá la ubicación en el campo', ir: 'campo'},
    {ok: medibles.length > 0 || (T.porCorte || []).length > 0, t: 'Qué se va a medir', d: medibles.length ? `${medibles.length} ${medibles.length === 1 ? 'medición' : 'mediciones'}` : 'Elegí al menos una medición', ir: 'medir'},
    T.cortes && {ok: T.cortes.length > 0, t: 'Cortes de forraje', d: T.cortes.length ? `${T.cortes.length} corte${T.cortes.length === 1 ? '' : 's'}` : 'Cargá la fecha del primer corte', ir: 'medir'},
    {ok: T.aplicaciones.some(a => a.estado === 'realizada'), t: 'Aplicaciones y labores', d: T.aplicaciones.length ? `${T.aplicaciones.filter(a => a.estado === 'realizada').length} realizadas, ${T.aplicaciones.filter(a => a.estado !== 'realizada').length} planificadas` : 'Registrá la siembra y las aplicaciones', ir: 'aplic'},
    {ok: pr >= 1, t: 'Datos de las parcelas', d: `${Math.round(pr * 100)} % cargado`, ir: 'datos', barra: pr},
    {ok: medibles.length > 0 && listas === medibles.length, t: 'Análisis', d: listas ? `${listas} de ${medibles.length} mediciones listas para analizar` : 'Se calcula cuando todas las parcelas tienen dato', ir: 'anal'},
    {ok: false, t: 'Informe', d: 'Word, Excel, PDF o QGIS, cuando quieras', ir: 'exp', final: true}].filter(Boolean);
  const prox = items.find(i => !i.ok && !i.final);
  return `<div class="card comova"><div class="row" style="justify-content:space-between"><h3>Cómo va este ensayo</h3>${prox ? `<button class="btn primary small" data-ir="${prox.ir}">Siguiente: ${esc(prox.t.toLowerCase())} →</button>` : '<span class="chip ok">Todo listo para el informe</span>'}</div>
    <ul class="checklist">${items.map(i => `<li class="${i.ok ? 'ok' : i.final ? 'fin' : ''}"><span class="ico" aria-hidden="true">${i.ok ? '✓' : i.final ? '↓' : ''}</span><span><b>${esc(i.t)}</b><span class="note">${esc(i.d)}</span>${i.barra != null ? `<span class="bar" style="margin-top:4px"><i style="width:${Math.round(i.barra * 100)}%"></i></span>` : ''}</span><button class="btn small" data-ir="${i.ir}">Ir</button></li>`).join('')}</ul></div>`;
}
/* ---------- 1 planificación ---------- */
RENDER.plan = T => {
  const t = T.tratamientos.length, b = T.bloques, gl = (t - 1) * (b - 1), pa = T.parcela;
  const parc = pa.texto || (pa.ancho ? `${fmt(pa.ancho, 1)} × ${fmt(pa.largo, 1)} m` : pa.forma === 'arboles' ? `${pa.filas} × ${pa.columnas} árboles a ${pa.e1} × ${pa.e2} m` : pa.forma === 'hileras' ? `${pa.hileras} hileras × ${pa.dist} m × ${pa.largo} m` : '');
  P().innerHTML = `<section class="panel"><h2>Planificación</h2>${T.ejemplo ? '<div class="callout" id="ej-aviso"><b>Ensayo de ejemplo.</b> Los datos son hipotéticos y sirven para mostrar cómo funciona la app; no representan resultados reales de los productos o cultivares nombrados.</div>' : ''}
    ${comoVa(T)}
    ${T.objetivo ? `<div class="card"><h3>Objetivo</h3><p style="margin:0">${esc(T.objetivo)}</p></div>` : ''}
    <div class="grid2"><div class="card"><h3>Datos del ensayo</h3><dl class="kv">
      <dt>Código</dt><dd>${T.id}</dd><dt>Rubro</dt><dd>${RUBROS[T.rubro].nombre}</dd><dt>Tipo</dt><dd>${esc(T.tipo)}</dd><dt>Cultivo</dt><dd>${esc(T.cultivo)}</dd>
      <dt>Lugar</dt><dd>${esc(T.lugar)}</dd><dt>Campaña</dt><dd>${esc(T.campana)}</dd><dt>Responsable</dt><dd>${esc(USERS[T.owner]?.nombre || '')}</dd>
      ${T.equipo ? `<dt>Equipo</dt><dd>${esc(EQUIPOS[T.equipo]?.nombre || '')}</dd>` : ''}${T.creado ? `<dt>Creado</dt><dd>${new Date(T.creado).toLocaleDateString('es-PY')}</dd>` : ''}</dl>
      ${puede.diseno(T) ? `<button class="btn small" id="btn-editar-datos" style="justify-self:start">✎ Editar datos</button>
      <form id="f-datos" hidden style="display:grid;gap:10px"><div class="grid2"><label class="f">Cultivo o especie<input type="text" name="cultivo" value="${esc(T.cultivo)}" list="dl-cult"><datalist id="dl-cult">${RUBROS[T.rubro].cultivos.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="f">Tipo de ensayo<input type="text" name="tipo" value="${esc(T.tipo)}" list="dl-tipo"><datalist id="dl-tipo">${RUBROS[T.rubro].tipos.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="f">Lugar<input type="text" name="lugar" value="${esc(T.lugar)}"></label><label class="f">Campaña<input type="text" name="campana" value="${esc(T.campana)}"></label></div>
        <label class="f">Objetivo<textarea name="objetivo" data-voz placeholder="Qué se quiere comparar y para qué">${esc(T.objetivo || '')}</textarea></label>
        <div class="row"><button class="btn primary small" type="submit">Guardar</button><button class="btn small" type="button" id="btn-datos-no">Cancelar</button></div></form>` : ''}</div>
    ${esLal(T) ? `<div class="card"><h3>Lado a lado</h3><dl class="kv"><dt>Productor</dt><dd>${esc(T.lal?.productor || '—')}</dd><dt>Lote</dt><dd>${esc(T.lal?.lote || '—')}</dd><dt>Escala</dt><dd>${esc(ESCALAS[T.lal?.escala]?.n || '—')}</dd>
      <dt>Lados</dt><dd>${T.tratamientos.map(x => `<span class="swatch" style="background:${COL_LADO[x.cod]}"></span> ${x.cod} · ${esc(x.nombre)}`).join('<br>')}</dd><dt>Franjas</dt><dd>${T.parcelas.length} de ${fmt(pa.ancho, 1)} × ${fmt(pa.largo, 0)} m${T.bloques > 1 ? ` · ${T.bloques} pares` : ''}</dd><dt>Muestreo</dt><dd>${T.lal?.puntos || '—'} puntos por franja</dd></dl>
      <div class="callout" style="margin:0">Prueba de eficacia en la parcela del productor: no es un ensayo experimental. Para generalizar el resultado, repetila en varias chacras (se suman como “otras chacras”).</div></div>` : `<div class="card"><h3>Diseño</h3><dl class="kv"><dt>Diseño</dt><dd>Bloques completos al azar</dd><dt>Parcelas</dt><dd>${t} tratamientos × ${b} bloques = ${t * b}</dd>
      <dt>Parcela</dt><dd>${esc(parc)} · ${fmt(pa.area_m2, 1)} m² (útil ${fmt(pa.area_util_m2, 1)} m²)</dd><dt>gl del error</dt><dd>${gl}</dd>${T.cortes ? `<dt>Cortes</dt><dd>${T.cortes.length ? T.cortes.length + ' (' + T.cortes.map(c => fechaTxt(c.fecha)).join(', ') + ')' : 'Todavía sin cortes'}</dd>` : ''}</dl>
      <div><span class="chip ${gl >= 12 ? 'ok' : 'warn'}">${gl >= 12 ? '✓' : '!'}</span> ${gl >= 12 ? 'Cumple el mínimo recomendado de 12 gl' : 'Menos de 12 gl: conviene sumar bloques'}</div>
      <div><span class="chip ${T.tratamientos.some(x => x.testigo) ? 'ok' : 'warn'}">${T.tratamientos.some(x => x.testigo) ? '✓' : '!'}</span> ${T.tratamientos.some(x => x.testigo) ? 'Incluye testigo' : 'Falta definir el testigo'}</div></div>`}</div>
    <div class="card"><h3>Mediciones del ensayo</h3><div class="row">${vis(T).map(v => `<span class="chip ${v.origen === 'dron' ? 'dron' : v.propio ? 'hypo' : 'neu'}">${esc(v.nombre)}</span>`).join('')}</div>
      <p class="note" style="margin:0">Se definen en el paso “Mediciones”: cada una tiene su forma de medir.</p></div>
    <div class="card"><h3>Opciones del ensayo</h3>
      <label class="opchk"><input type="checkbox" id="op-dron" ${T.dron ? 'checked' : ''} ${puede.diseno(T) ? '' : 'disabled'}><span><b>Usar imágenes multiespectrales del dron</b><br><span class="note">${T.dron ? 'Activado: se suman las mediciones del dron (índices por parcela). Se cargan desde un CSV de QGIS en “Carga de datos → Importar”.' : 'Desactivado: el ensayo se centra en las mediciones de campo y en las aplicaciones. Para una foto aérea común del dron no hace falta activarlo: se carga en el paso del croquis y se recorta por bloque.'}</span></span></label></div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3>Fotos del ensayo</h3>${rolEn(T) !== 'lector' ? fotoBtn('ensayo') : ''}</div><div class="fotos" data-fotos="ensayo"></div></div>
    ${puede.diseno(T) ? `<div class="card"><h3>Acciones</h3><div class="row"><button class="btn" id="btn-duplicar">⧉ Duplicar ensayo</button>${rolEn(T) === 'dueño' ? '<button class="btn peligro" id="btn-borrar-ens">🗑 Eliminar ensayo</button>' : ''}</div>
      <p class="note" style="margin:0">Duplicar copia el diseño, los tratamientos, los productos y las mediciones, sin los datos cargados: sirve para repetir el ensayo en otro lugar o campaña.</p></div>` : ''}</section>`;
  pintarFotos(T, null);
  P().onclick = async e => {
    if (e.target.closest('#btn-editar-datos')) { $('#f-datos').hidden = false; e.target.closest('#btn-editar-datos').hidden = true; vozEn($('#f-datos')); return; }
    if (e.target.closest('#btn-datos-no')) return RENDER.plan(T);
    if (e.target.closest('#btn-duplicar')) return duplicarEnsayo(T);
    const ir = e.target.closest('[data-ir]'); if (ir) { irPaso(PASOS.findIndex(x => x[0] === ir.dataset.ir)); scrollTo({top: 0}); return; }
    if (e.target.closest('#btn-borrar-ens')) { if (await confirmar('Eliminar ensayo', `Se elimina <b>${esc(T.titulo)}</b> con todos sus datos, notas y fotos de este equipo. No se puede deshacer. Si querés conservarlo, descargá antes un respaldo o el Excel.`, {ok: 'Eliminar', peligro: true})) {
      const i = TRIALS.indexOf(T); if (i >= 0) TRIALS.splice(i, 1); S.T = null; await guardarAhora(); toast('Ensayo eliminado'); irInicio(); } return; }
    if (await clicFotos(e, T, null)) return;
  };
  const fd = $('#f-datos'); if (fd) fd.onsubmit = e => { e.preventDefault(); const f = new FormData(fd);
    ['cultivo', 'tipo', 'lugar', 'campana', 'objetivo'].forEach(k => { const v = String(f.get(k) || '').trim(); if (v !== (T[k] || '')) { T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: 'Datos: ' + k, antes: T[k] || null, despues: v, estado: 'aprobado'}); T[k] = v; } });
    toast('Datos guardados'); abrir(T, 'plan'); };
  P().onchange = e => { if (e.target.dataset.fotoIn != null) return subirFotos(e.target, T, null); if (e.target.id !== 'op-dron') return; T.dron = e.target.checked;
    if (T.dron && !T.variables.some(v => v.origen === 'dron')) MET[T.rubro].filter(m => m.origen === 'dron').slice(0, 2).forEach(m => T.variables.push(structuredClone(m)));
    T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: 'Imágenes de dron', antes: T.dron ? 'No' : 'Sí', despues: T.dron ? 'Sí' : 'No', estado: 'aprobado'});
    mapa.reset(); $('#e-leyenda').innerHTML = T.imagen && T.dron ? '<span class="chip hypo">● Dato hipotético</span><span class="chip dron">● Medido del dron</span>' : '';
    toast(T.dron ? 'Imágenes de dron activadas' : 'Trabajando sin dron: solo mediciones de campo'); irPaso(S.paso); };
};
/* ---------- 2 tratamientos ---------- */
function estadoReg(row) { if (!row) return ['neu', 'No encontrado']; const sit = row[catIdx.sit], v = row[catIdx.venc];
  if (sit === 'CANCELADO') return ['bad', 'Cancelado']; if (v && v < HOY) return ['warn', `Vencido (${v})`];
  if (sit === 'VIGENTE' || sit === 'DEFINITIVO') return ['ok', sit[0] + sit.slice(1).toLowerCase() + (v ? ` hasta ${v}` : '')]; return ['warn', sit]; }
let busq = '';
const UNIDADES = ['L/ha', 'mL/ha', 'kg/ha', 'g/ha', 'cc/ha', 'kg/ha (semilla)', 'unid/ha'];
function porParcela(dosis, unidad, A) { // A: m² de la parcela → [cantidad, unidad para medir]
  const f = A / 10000, u = String(unidad || '');
  if (/^l\b|^l\//i.test(u)) return [dosis * f * 1000, 'mL']; if (/^kg/i.test(u)) return [dosis * f * 1000, 'g'];
  if (/^(ml|cc)/i.test(u)) return [dosis * f, 'mL']; if (/^g/i.test(u)) return [dosis * f, 'g']; return [dosis * f, u.replace('/ha', '')];
}
const buscarEnCatalogo = (nombre, exacto = true) => { const q = String(nombre || '').trim().toUpperCase().replace(/\s+/g, ' '); if (q.length < 3) return null;
  return CAT.rows.find(r => r[catIdx.prod].toUpperCase() === q) || (exacto ? null : CAT.rows.find(r => r[catIdx.prod].toUpperCase().startsWith(q) && r[catIdx.sit] !== 'CANCELADO')) || null; };
RENDER.trat = T => {
  const C = colTrat(T), ed = puede.diseno(T), usa = T.tratamientos.some(t => t.productos.length);
  const filas = T.tratamientos.map(t => { const n = Math.max(1, t.productos.length);
    return (t.productos.length ? t.productos : [null]).map((p, i) => { const row = p?.reg ? catByReg.get(p.reg) : p ? buscarEnCatalogo(p.prod) : null, [k, l] = p ? (p.reg || row ? estadoReg(row) : ['neu', 'Sin registro cargado']) : ['neu', '—'];
      return `<tr>${i === 0 ? `<td rowspan="${n}"><span class="swatch" style="background:${C[t.cod]}"></span> <b>${t.cod}</b></td><td rowspan="${n}">${ed ? `<input type="text" data-tnom="${t.cod}" value="${esc(t.nombre)}" style="min-width:150px">` : esc(t.nombre)}${t.testigo ? ' <span class="chip neu">testigo</span>' : ''}${t.referencia ? ' <span class="chip neu">referencia</span>' : ''}</td>` : ''}
        <td>${p ? esc(p.prod) + (p.momento === 'secuencial' ? ' <span class="chip acc">secuencial</span>' : '') : '<span class="note">—</span>'}</td><td class="num">${p ? (p.reg || (row ? row[catIdx.reg] : '')) : ''}</td><td>${p ? esc(row ? row[catIdx.pa] : p.pa || '') : ''}</td>
        <td class="num" style="white-space:nowrap">${p ? (ed ? `<input type="number" step="any" min="0" data-dosis="${t.cod}|${i}" value="${p.dosis}"> <select data-uni="${t.cod}|${i}">${[...new Set([p.unidad, ...UNIDADES])].map(u => `<option ${u === p.unidad ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>` : fmt(p.dosis, 2) + ' ' + esc(p.unidad)) : ''}</td>
        <td>${p ? `<span class="chip ${k}">${l}</span>` : ''}</td>${ed ? `<td>${p ? `<button class="btn small" data-qp="${t.cod}|${i}" title="Quitar producto">✕</button>` : ''}</td>` : ''}</tr>`; }).join(''); }).join('');
  P().innerHTML = `<section class="panel"><h2>Tratamientos y dosis</h2>${aviso(T, 'Los tratamientos los define el gerente; acá podés consultar productos y dosis.')}
    <div class="tw"><table id="t-trat"><thead><tr><th>Trat.</th><th>Descripción</th><th>Producto</th><th class="num">N° reg.</th><th>Principio activo</th><th class="num">Dosis</th><th>Registro SENAVE</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>${filas}</tbody></table></div>
    ${ed ? `<div class="row"><button class="btn" id="btn-imp-trat">📷 Leer productos de una foto o Excel</button><span class="note">Lee una planilla de tratamientos (foto o archivo) y propone los productos con sus dosis para revisar.</span></div>` : ''}
    <div class="card"><h3>Buscar en el listado SENAVE</h3><div class="row"><input type="search" id="q-prod" value="${esc(busq)}" placeholder="Nombre comercial, principio activo o N° de registro" style="flex:1;min-width:220px"><span class="note" id="q-count"></span></div>
      ${ed ? `<div class="row"><label class="f" style="grid-auto-flow:column;align-items:center">Agregar al tratamiento <select id="q-dest">${T.tratamientos.map(t => `<option value="${t.cod}" ${t.testigo ? '' : ''}>${t.cod} · ${esc(t.nombre)}</option>`).join('')}</select></label></div>` : ''}
      <div class="tw" style="max-height:300px;overflow:auto"><table id="t-busca"></table></div></div>
    ${ed ? `<form class="card" id="f-prod"><h3>Agregar un producto a mano</h3><p class="note" style="margin:0">Para productos que no están en el listado (en desarrollo, coadyuvantes, fertilizantes). Si el nombre coincide con uno registrado, se completa solo.</p>
      <div class="grid3"><label class="f">Tratamiento<select id="mp-t">${T.tratamientos.map(t => `<option value="${t.cod}">${t.cod} · ${esc(t.nombre)}</option>`).join('')}</select></label>
        <label class="f">Producto<input type="text" id="mp-n" required placeholder="Nombre comercial o código"></label><label class="f">Principio activo<input type="text" id="mp-pa" placeholder="Ej.: Azoxistrobina 20 %"></label>
        <label class="f">Dosis<input type="number" id="mp-d" step="any" min="0" required></label><label class="f">Unidad<select id="mp-u">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</select></label>
        <label class="f">Momento<select id="mp-m"><option value="principal">Aplicación principal</option><option value="secuencial">Secuencial (después)</option></select></label></div>
      <div class="row"><button class="btn primary" type="submit">Agregar producto</button><span class="note" id="mp-msg"></span></div></form>` : ''}
    ${usa ? `<div class="card"><h3>Dosificación por parcela</h3><div class="row"><label class="f">Caldo (L/ha)<input type="number" id="caldo" value="${T.caldo || 200}" min="20" step="10"></label><label class="f">Mochila (L)<input type="number" id="mochila" value="${T.mochila || 5}" min="1"></label><label class="f">Sobrante (%)<input type="number" id="sobra" value="${T.sobrante ?? 20}" min="0" max="100"></label><span class="note">Parcela de ${fmt(T.parcela.area_m2, 1)} m²</span></div><div class="tw"><table id="t-dosis"></table></div></div>` : ''}</section>`;
  const buscar = () => { busq = $('#q-prod').value; const q = busq.trim().toUpperCase(); if (q.length < 2) { $('#t-busca').innerHTML = ''; $('#q-count').textContent = 'Escribí al menos 2 letras'; return; }
    const res = CAT.rows.filter(r => String(r[catIdx.reg]) === q || r[catIdx.prod].toUpperCase().includes(q) || r[catIdx.pa].toUpperCase().includes(q));
    $('#q-count').textContent = `${res.length} resultados`;
    $('#t-busca').innerHTML = '<thead><tr><th class="num">Reg.</th><th>Producto</th><th>Principio activo</th><th>Form.</th><th>Clase</th><th>Estado</th>' + (ed ? '<th></th>' : '') + '</tr></thead><tbody>' +
      res.slice(0, 50).map(r => { const [k, l] = estadoReg(r); return `<tr><td class="num">${r[catIdx.reg]}</td><td>${esc(r[catIdx.prod])}</td><td>${esc(r[catIdx.pa])}</td><td>${esc(r[catIdx.form])}</td><td>${esc(r[catIdx.clase])}</td><td><span class="chip ${k}">${l}</span></td>${ed ? `<td><button class="btn small" data-add="${r[catIdx.reg]}" ${k === 'bad' ? 'disabled' : ''}>Agregar</button></td>` : ''}</tr>`; }).join('') + '</tbody>'; };
  $('#q-prod').oninput = buscar; buscar();
  const reg = (v, a, d) => T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: v, antes: a, despues: d, estado: 'aprobado'});
  P().onclick = async e => {
    if (e.target.closest('#btn-imp-trat')) return importarTratamientos(T);
    const q = e.target.closest('[data-qp]'); if (q) { const [cod, i] = q.dataset.qp.split('|'), t = T.tratamientos.find(x => x.cod === cod), pr = t.productos[+i];
      if (!await confirmar('Quitar producto', `¿Quitar <b>${esc(pr.prod)}</b> del tratamiento ${cod}?`, {ok: 'Quitar', peligro: true})) return;
      t.productos.splice(+i, 1); reg(`Producto de ${cod}`, pr.prod, null); toast('Producto quitado'); return RENDER.trat(T); }
    const a = e.target.closest('[data-add]'); if (!a) return; const row = catByReg.get(Number(a.dataset.add)), cod = $('#q-dest').value, t = T.tratamientos.find(x => x.cod === cod);
    const liquido = /SC|EC|SL|EW|CS|OD|SE|ME|EO|SUSPENS|EMULS|SOLUC/.test(row[catIdx.form]);
    t.productos.push({reg: Number(row[catIdx.reg]), prod: row[catIdx.prod], pa: row[catIdx.pa], dosis: liquido ? 0.5 : 1, unidad: liquido ? 'L/ha' : 'kg/ha', momento: 'principal'});
    reg(`Producto de ${cod}`, null, row[catIdx.prod]); toast(`${row[catIdx.prod]} agregado a ${cod}: revisá la dosis`); RENDER.trat(T); };
  P().oninput = e => { const d = e.target.dataset.dosis; if (d) { const [cod, i] = d.split('|'); T.tratamientos.find(x => x.cod === cod).productos[+i].dosis = parseFloat(e.target.value) || 0; dosis(); }
    const tn = e.target.dataset.tnom; if (tn) T.tratamientos.find(x => x.cod === tn).nombre = e.target.value;
    if (e.target.id === 'caldo') { T.caldo = +e.target.value; dosis(); } if (e.target.id === 'mochila') { T.mochila = +e.target.value; dosis(); } if (e.target.id === 'sobra') { T.sobrante = +e.target.value; dosis(); }
    if (e.target.id === 'mp-n') { const r = buscarEnCatalogo(e.target.value, false); $('#mp-msg').innerHTML = r ? `Coincide con <b>${esc(r[catIdx.prod])}</b> (reg. ${r[catIdx.reg]}, ${esc(r[catIdx.pa])})` : ''; if (r && !$('#mp-pa').value) $('#mp-pa').placeholder = r[catIdx.pa]; } };
  P().onchange = e => { const u = e.target.dataset.uni; if (u) { const [cod, i] = u.split('|'); T.tratamientos.find(x => x.cod === cod).productos[+i].unidad = e.target.value; dosis(); }
    const tn = e.target.dataset.tnom; if (tn) reg(`Nombre de ${tn}`, null, e.target.value); };
  const fp = $('#f-prod'); if (fp) fp.onsubmit = e => { e.preventDefault(); const t = T.tratamientos.find(x => x.cod === $('#mp-t').value), nom = $('#mp-n').value.trim(), r = buscarEnCatalogo(nom);
    t.productos.push({reg: r ? Number(r[catIdx.reg]) : null, prod: r ? r[catIdx.prod] : nom, pa: $('#mp-pa').value.trim() || (r ? r[catIdx.pa] : ''), dosis: parseFloat($('#mp-d').value) || 0, unidad: $('#mp-u').value, momento: $('#mp-m').value});
    reg(`Producto de ${t.cod}`, null, nom); toast(`${nom} agregado a ${t.cod}`); RENDER.trat(T); };
  function dosis() { if (!$('#t-dosis')) return; const caldo = +$('#caldo').value || 0, moch = +$('#mochila').value || 1, sob = 1 + (+$('#sobra').value || 0) / 100, A = T.parcela.area_m2, cal = caldo * A / 10000;
    $('#t-dosis').innerHTML = `<thead><tr><th>Trat.</th><th>Producto</th><th class="num">Dosis/ha</th><th class="num">Por parcela</th><th class="num">Caldo por parcela</th><th class="num">Preparar (todas las parcelas + sobrante)</th><th class="num">Por mochila de ${moch} L</th></tr></thead><tbody>` +
      T.tratamientos.filter(t => t.productos.length).map(t => { const np = T.parcelas.filter(p => p.trat === t.cod).length || T.bloques;
        return t.productos.map(p => { const [pp, u] = porParcela(p.dosis, p.unidad, A);
        return `<tr><td>${t.cod}</td><td>${esc(p.prod)}</td><td class="num">${fmt(p.dosis, 2)} ${esc(p.unidad)}</td><td class="num">${fmt(pp, 2)} ${u}</td><td class="num">${fmt(cal, 2)} L</td><td class="num">${fmt(pp * np * sob, 1)} ${u} en ${fmt(cal * np * sob, 2)} L (${np} parcelas)</td><td class="num">${fmt(cal ? pp / cal * moch : 0, 2)} ${u}</td></tr>`; }).join(''); }).join('') + '</tbody>'; }
  dosis();
};

/* ---------- 3 aplicaciones y manejo ---------- */
const TIPOS_APL = ['Aplicación de tratamientos', 'Siembra o plantación', 'Fertilización', 'Control de malezas', 'Control de plagas', 'Fungicida', 'Riego', 'Raleo o poda', 'Corte de forraje', 'Pastoreo', 'Cosecha', 'Otra labor'];
const PULVERIZA = ['Aplicación de tratamientos', 'Control de malezas', 'Control de plagas', 'Fungicida'];
const dias = f => Math.round((Date.parse(HOY) - Date.parse(f)) / 86400000);

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const cuando = f => { const d = dias(f); return d === 0 ? 'hoy' : d > 0 ? `hace ${d} día${d > 1 ? 's' : ''}` : `en ${-d} día${d < -1 ? 's' : ''}`; };
const estadoApl = a => a.estado === 'realizada' ? ['ok', 'Realizada', ''] : a.fecha < HOY ? ['warn', 'Atrasada', 'atr'] : ['acc', 'Planificada', 'plan'];
const aplicaA = (a, cod) => a.trats === 'todos' || a.trats.includes(cod);
function fueraLey(c) { if (!c) return []; const f = [];
  if (c.t != null && c.t > 32) f.push(`temperatura ${c.t} °C (máx. 32)`); if (c.hr != null && c.hr < 60) f.push(`humedad ${c.hr} % (mín. 60)`); if (c.viento != null && c.viento > 10) f.push(`viento ${c.viento} km/h (máx. 10)`); return f; }
function ultimaAplic(T, cod) { return (T.aplicaciones || []).filter(a => a.estado === 'realizada' && aplicaA(a, cod) && a.fecha <= HOY).sort((x, y) => y.fecha.localeCompare(x.fecha))[0]; }
const puedeAplic = T => puede.diseno(T) || rolEn(T) === 'operador';
let aplForm = false, aplReal = null;
RENDER.aplic = T => {
  const C = colTrat(T), ed = puede.diseno(T), reg = puedeAplic(T), L = T.aplicaciones.filter(a => !T.sitios || S.sitio === 'todos' || !a.sitio || a.sitio === 'todos' || a.sitio === S.sitio).sort((x, y) => y.fecha.localeCompare(x.fecha));
  const hechas = L.filter(a => a.estado === 'realizada'), prox = L.filter(a => a.estado !== 'realizada').sort((x, y) => x.fecha.localeCompare(y.fecha))[0], ult = hechas[0];
  const conProd = T.tratamientos.filter(t => t.productos?.length);
  const detalle = a => {
    if (a.tipo === 'Aplicación de tratamientos') { const A = T.parcela.area_m2, caldo = a.caldo || T.caldo || 200, cal = caldo * A / 10000;
      const filas = T.tratamientos.filter(t => aplicaA(a, t.cod)).map(t => { const ps = t.productos?.length ? t.productos : [null];
        return ps.map((p, i) => { const [pp, u] = p ? porParcela(p.dosis, p.unidad, A) : [0, ''];
          return `<tr><td>${i === 0 ? `<span class="swatch" style="background:${C[t.cod]}"></span> ${t.cod}` : ''}</td><td>${p ? esc(p.prod) : esc(t.nombre)}</td><td class="num">${p ? fmt(p.dosis, 2) + ' ' + esc(p.unidad) : '—'}</td><td class="num">${p ? fmt(pp, 1) + ' ' + u : '—'}</td></tr>`; }).join(''); }).join('');
      return `<div class="tw"><table><thead><tr><th>Trat.</th><th>Producto</th><th class="num">Dosis</th><th class="num">Por parcela</th></tr></thead><tbody>${filas}</tbody></table></div>
        <span class="note">Caldo ${fmt(caldo, 0)} L/ha = ${fmt(cal, 2)} L por parcela de ${fmt(A, 1)} m². ${T.tratamientos.filter(t => !aplicaA(a, t.cod)).map(t => t.cod).join(', ') || 'Ningún'} sin aplicar${T.tratamientos.some(t => t.testigo && !aplicaA(a, t.cod)) ? ' (testigo)' : ''}.</span>`; }
    return `<div class="row"><span>${a.trats === 'todos' ? '<span class="chip neu">Todo el ensayo</span>' : a.trats.map(c => `<span class="row" style="gap:4px"><span class="swatch" style="background:${C[c]}"></span>${c}</span>`).join(' ')}</span>${a.producto ? `<span><b>${esc(a.producto)}</b>${a.dosis ? ' · ' + esc(a.dosis) : ''}</span>` : ''}</div>`; };
  const item = a => { const [k, l, cls] = estadoApl(a), d = new Date(a.fecha + 'T12:00'), fl = fueraLey(a.cond);
    return `<div class="apl ${cls}"><div class="fe"><b>${d.getDate()}</b><span>${MES[d.getMonth()]} ${d.getFullYear()}</span></div><div class="cuerpo">
      <div class="row" style="justify-content:space-between"><b>${esc(a.tipo)}${T.sitios ? ` <span class="chip neu">${a.sitio && a.sitio !== 'todos' ? esc(nomSitio(T, a.sitio)) : 'Todos los lugares'}</span>` : ''}</b><span class="row" style="gap:6px"><span class="chip ${k}">${l}</span><span class="note">${cuando(a.fecha)}</span></span></div>
      ${a.estadio ? `<span class="note">Momento: ${esc(a.estadio)}</span>` : ''}${detalle(a)}
      ${a.cond ? `<div class="row" style="gap:6px"><span class="note">Condiciones${a.hora ? ' (' + esc(a.hora) + ' h)' : ''}: ${a.cond.t ?? '—'} °C · HR ${a.cond.hr ?? '—'} % · viento ${a.cond.viento ?? '—'} km/h${a.vientoDir ? ' del ' + esc(a.vientoDir) : ''}</span>${PULVERIZA.includes(a.tipo) ? (fl.length ? `<span class="chip warn" style="white-space:normal">Fuera de lo permitido: ${esc(fl.join(', '))}</span>` : '<span class="chip ok">Dentro de la Ley 3742/09</span>') + dtTxt(a.cond.t, a.cond.hr) : ''}</div>` : ''}
      ${a.equipo || a.adyuvante || a.ph != null ? `<span class="note">${a.equipo ? `Equipo: ${chipBoq(a.equipo.iso)} ${eqTxt(a.equipo)}` : ''}${a.caldo && a.tipo !== 'Aplicación de tratamientos' ? ` · ${fmt(a.caldo, 0)} L/ha` : ''}${a.adyuvante ? ` · Adyuvante: ${esc(a.adyuvante)}` : ''}${a.ph != null ? ` · pH del agua ${fmt(a.ph, 1)}` : ''}</span>` : ''}
      ${PULVERIZA.includes(a.tipo) ? calidadAplic(T, a) : ''}
      ${a.obs ? `<span class="note">${esc(a.obs)}</span>` : ''}
      <span class="note">${a.estado === 'realizada' ? 'Registró' : 'Responsable'}: ${esc(USERS[a.resp]?.nombre || '—')}</span>
      ${a.estado !== 'realizada' && reg ? (aplReal === a.id ? `<div class="card" style="gap:8px"><b>Registrar como realizada</b><div class="grid3"><label class="f">Fecha<input type="date" id="rr-fecha" value="${HOY}"></label><label class="f">Temperatura (°C)<input type="number" id="rr-t" step="0.5"></label><label class="f">Humedad relativa (%)<input type="number" id="rr-hr" step="1"></label><label class="f">Viento (km/h)<input type="number" id="rr-v" step="0.5"></label><span id="rr-dt" style="align-self:end"></span></div>${PULVERIZA.includes(a.tipo) ? camposEquipo(T, 'rr', a) : ''}<label class="f">Observaciones<input type="text" id="rr-obs" data-voz placeholder="Opcional"></label><div class="row"><button class="btn primary small" data-confirmar="${a.id}">Confirmar</button><button class="btn small" data-cancelar>Cancelar</button><span class="note" id="rr-aviso"></span></div></div>`
        : `<button class="btn small" data-realizar="${a.id}" style="justify-self:start">Registrar como realizada</button>`) : ''}</div></div>`; };
  const resp = [T.owner, ...Object.keys(T.trabajo || {}), ...(T.sitios || []).flatMap(x => x.ops || [])].filter((x, i, arr) => USERS[x] && arr.indexOf(x) === i);
  const form = ed && aplForm ? `<div class="card" id="apl-form"><h3>Nueva aplicación o tarea</h3><div class="grid3">
      <label class="f">Tipo<select id="af-tipo">${TIPOS_APL.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label class="f">Fecha<input type="date" id="af-fecha" value="${HOY}"></label>
      <label class="f">Momento o estadio<input type="text" id="af-estadio" placeholder="Ej.: V6, floración, 24 meses"></label>
      ${T.sitios ? `<label class="f">Lugar<select id="af-sitio">${T.sitios.map(x => `<option value="${x.id}" ${S.sitio === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}<option value="todos">Todos los lugares</option></select></label>` : ''}
      <label class="f">Responsable<select id="af-resp">${resp.map(u => `<option value="${u}">${esc(USERS[u].nombre)}</option>`).join('')}</select></label></div>
    <div style="display:grid;gap:6px"><span class="note">Se aplica a</span><div class="row"><label class="pill"><input type="checkbox" id="af-todos">Todo el ensayo (manejo general)</label>${T.tratamientos.map(t => `<label class="pill"><input type="checkbox" data-aft="${t.cod}" ${t.productos?.length ? 'checked' : ''}><span class="swatch" style="background:${C[t.cod]}"></span>${t.cod}</label>`).join('')}</div></div>
    <div class="grid3" id="af-prod"><label class="f">Producto o insumo<input type="text" id="af-producto" placeholder="Ej.: urea, glifosato, riego"></label><label class="f">Dosis<input type="text" id="af-dosis" placeholder="Ej.: 100 kg/ha"></label></div>
    <span class="note" id="af-caldo-box">Productos y dosis se toman de “Tratamientos y dosis”.</span>
    ${camposEquipo(T, 'af', {caldo: T.caldo || 200})}
    <label class="pill" style="justify-self:start"><input type="checkbox" id="af-hecha">Ya se realizó (cargar condiciones)</label>
    <div class="grid3" id="af-cond" hidden><label class="f">Temperatura (°C)<input type="number" id="af-t" step="0.5"></label><label class="f">Humedad relativa (%)<input type="number" id="af-hr"></label><label class="f">Viento (km/h)<input type="number" id="af-v" step="0.5"></label><span id="af-dt" style="align-self:end"></span></div>
    <label class="f">Observaciones<input type="text" id="af-obs" data-voz placeholder="Equipo, pastilla, clima, etc."></label>
    <div class="row"><button class="btn primary" id="af-ok">Guardar</button><button class="btn" id="af-no">Cancelar</button><span class="note" id="af-msg"></span></div></div>` : '';
  P().innerHTML = `<section class="panel"><h2>Aplicaciones y manejo</h2>${aviso(T, 'Podés registrar como realizadas las aplicaciones planificadas del ensayo; el gerente las revisa.')}
    <p class="lead" style="font-size:.92rem">Todo lo que se aplica o se hace en el ensayo, con fecha: aplicaciones de los tratamientos, siembra, fertilización, controles, riego y cosecha. Sirve para saber cuántos días pasaron desde cada aplicación cuando se evalúa (DDA) y queda en el informe.</p>
    <div class="kpis"><div class="kpi"><span>Realizadas</span><b>${hechas.length}</b></div><div class="kpi"><span>Planificadas</span><b>${L.length - hechas.length}</b></div>
      <div class="kpi"><span>Última</span><b style="font-size:1.05rem">${ult ? esc(ult.tipo) : '—'}</b><span>${ult ? `${fechaTxt(ult.fecha)} · ${cuando(ult.fecha)}` : 'Sin registros'}</span></div>
      <div class="kpi"><span>Próxima</span><b style="font-size:1.05rem">${prox ? esc(prox.tipo) : '—'}</b><span>${prox ? `${fechaTxt(prox.fecha)} · ${cuando(prox.fecha)}` : 'Nada planificado'}</span></div></div>
    ${PULVERIZA.some(t => L.some(a => a.tipo === t)) || pulvVisibles(T).length || ed ? cardEquipos(T) : ''}
    ${ed && !aplForm ? '<button class="btn primary" id="apl-nueva" style="justify-self:start">+ Nueva aplicación o tarea</button>' : ''}${form}
    ${!conProd.length && ed && /fungic|herbic|insectic|fertiliz|dosis|eficacia|producto|bioestim|fitotox/i.test(T.tipo) ? '<div class="callout">Para registrar la aplicación de los tratamientos con sus dosis, primero cargá los productos en “Tratamientos y dosis”. Las labores de manejo general se pueden registrar igual.</div>' : ''}
    <div class="card">${L.length ? L.map(item).join('') : '<p class="note" style="margin:0">Todavía no hay aplicaciones ni labores registradas.</p>'}</div>
    <p class="note">Condiciones para pulverizar según Ley 3742/09, art. 63: no aplicar con temperatura mayor a 32 °C, humedad relativa menor a 60 % o viento mayor a 10 km/h.</p></section>`;
  const tipoSync = () => { if (!$('#af-tipo')) return; const tr = $('#af-tipo').value === 'Aplicación de tratamientos'; $('#af-prod').hidden = tr; $('#af-caldo-box').hidden = !tr; $('#af-eqbox').hidden = !PULVERIZA.includes($('#af-tipo').value); };
  tipoSync();
  P().onchange = e => { if (e.target.id === 'af-tipo') { tipoSync(); if ($('#af-tipo').value !== 'Aplicación de tratamientos') { $('#af-todos').checked = true; $$('[data-aft]').forEach(c => c.checked = false); } }
    if (e.target.id === 'af-hecha') $('#af-cond').hidden = !e.target.checked;
    if (e.target.id === 'af-todos' && e.target.checked) $$('[data-aft]').forEach(c => c.checked = false);
    if (e.target.dataset.aft && e.target.checked) $('#af-todos').checked = false;
    const m = e.target.id?.match(/^(af|rr)-pulv$/); if (m) syncEquipo(m[1], true); };
  P().oninput = e => { const m = e.target.id?.match(/^(af|rr)-(t|hr|pres|vel|caldo)$/); if (!m) return; const pre = m[1];
    if (m[2] === 't' || m[2] === 'hr') { const n = id => $(id)?.value === '' ? null : +$(id)?.value; $(`#${pre}-dt`).innerHTML = dtTxt(n(`#${pre}-t`), n(`#${pre}-hr`)); }
    if (m[2] === 'pres' || m[2] === 'vel') syncEquipo(pre); if (m[2] === 'caldo') e.target.dataset.auto = '0'; };
  if ($('#af-pulv')) syncEquipo('af', true); if ($('#rr-pulv')) syncEquipo('rr', !aplReal || !T.aplicaciones.find(x => x.id === aplReal)?.equipo);
  P().onclick = e => {
    const pv = e.target.closest('[data-pulv]'); if (pv) return editarPulv(T, pv.dataset.pulv);
    const pp = e.target.closest('[data-papel]'); if (pp) return leerPapel(T, pp.dataset.papel);
    const vp = e.target.closest('[data-ver-papel]'); if (vp) return verPapel(T, vp.dataset.verPapel);
    const pd = e.target.closest('[data-papel-datos]'); if (pd) return papelADatos(T, pd.dataset.papelDatos);
    if (e.target.closest('#apl-nueva')) { aplForm = true; RENDER.aplic(T); $('#apl-form').scrollIntoView({block: 'nearest'}); return; }
    if (e.target.closest('#af-no')) { aplForm = false; RENDER.aplic(T); return; }
    if (e.target.closest('[data-realizar]')) { aplReal = +e.target.closest('[data-realizar]').dataset.realizar; RENDER.aplic(T); return; }
    if (e.target.closest('[data-cancelar]')) { aplReal = null; RENDER.aplic(T); return; }
    if (e.target.closest('#af-ok')) {
      const todos = $('#af-todos').checked, trs = $$('[data-aft]').filter(c => c.checked).map(c => c.dataset.aft), tipo = $('#af-tipo').value;
      if (!todos && !trs.length) { $('#af-msg').textContent = 'Elegí a qué tratamientos se aplica.'; return; }
      const num = id => $(id).value === '' ? null : +$(id).value, hecha = $('#af-hecha').checked;
      const a = {id: nuevoIdAp(), tipo, fecha: $('#af-fecha').value || HOY, estado: hecha ? 'realizada' : 'planificada', trats: todos ? 'todos' : trs,
        estadio: $('#af-estadio').value.trim(), resp: $('#af-resp').value, obs: $('#af-obs').value.trim()};
      if (T.sitios) a.sitio = $('#af-sitio').value;
      if (tipo !== 'Aplicación de tratamientos') { a.producto = $('#af-producto').value.trim(); a.dosis = $('#af-dosis').value.trim(); }
      if (PULVERIZA.includes(tipo)) leerEquipo(T, 'af', a);
      if (hecha) a.cond = {t: num('#af-t'), hr: num('#af-hr'), viento: num('#af-v')};
      T.aplicaciones.push(a); aplForm = false;
      T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: `${hecha ? 'Aplicación registrada' : 'Aplicación planificada'}: ${tipo}`, antes: null, despues: fechaTxt(a.fecha), estado: 'aprobado'});
      const fl = hecha && PULVERIZA.includes(tipo) ? fueraLey(a.cond) : [];
      toast(fl.length ? 'Guardada, con condiciones fuera de lo permitido' : hecha ? 'Aplicación registrada' : 'Aplicación planificada'); RENDER.aplic(T); irPasoNav(); return; }
    const cf = e.target.closest('[data-confirmar]');
    if (cf) { const a = T.aplicaciones.find(x => x.id === +cf.dataset.confirmar), num = id => $(id).value === '' ? null : +$(id).value;
      a.estado = 'realizada'; a.fecha = $('#rr-fecha').value || HOY; a.cond = {t: num('#rr-t'), hr: num('#rr-hr'), viento: num('#rr-v')}; a.resp = S.user.id;
      if (PULVERIZA.includes(a.tipo)) leerEquipo(T, 'rr', a);
      const o = $('#rr-obs').value.trim(); if (o) a.obs = a.obs ? a.obs + ' ' + o : o;
      const op = rolEn(T) === 'operador';
      T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: `Aplicación realizada: ${a.tipo}`, antes: 'planificada', despues: fechaTxt(a.fecha), estado: op ? 'pendiente' : 'aprobado'});
      aplReal = null; const fl = PULVERIZA.includes(a.tipo) ? fueraLey(a.cond) : [];
      toast(fl.length ? 'Registrada, con condiciones fuera de lo permitido' : op ? 'Registrada; queda para revisión del gerente' : 'Aplicación registrada'); RENDER.aplic(T); irPasoNav(); }
  };
};

{ const ra = RENDER.aplic; RENDER.aplic = T => { ra(T); vozEn(P()); }; }
/* ---------- pulverizadoras, calibración y calidad de aplicación ---------- */
// Boquillas por tamaño ISO 10625: código, color, caudal nominal en gal/min a 40 psi (2,76 bar)
const BOQ = [['01', 'naranja', '#f97316', 0.1], ['015', 'verde', '#22c55e', 0.15], ['02', 'amarilla', '#eab308', 0.2], ['025', 'lila', '#a78bfa', 0.25], ['03', 'azul', '#2563eb', 0.3], ['04', 'roja', '#dc2626', 0.4], ['05', 'marrón', '#92400e', 0.5], ['06', 'gris', '#6b7280', 0.6], ['08', 'blanca', '#e5e7eb', 0.8], ['10', 'celeste', '#7dd3fc', 1]];
const TIPOS_BOQ = ['Abanico plano estándar', 'Abanico plano de baja deriva (preorificio)', 'Inducción de aire', 'Doble abanico', 'Cono hueco', 'Cono lleno', 'Otra'];
const TIPOS_PULV = ['Mochila manual (palanca)', 'Mochila de presión constante (CO₂ o batería)', 'Barra experimental de parcelas', 'Pulverizador de arrastre o montado', 'Autopropulsado', 'Dron pulverizador', 'Otro'];
const VIENTO_DIR = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const POSICIONES = ['Tercio superior', 'Tercio medio', 'Tercio inferior', 'Haz de la hoja', 'Envés de la hoja', 'Suelo o entresurco', 'Otra'];
const qNominal = (iso, bar) => { const b = BOQ.find(x => x[0] === iso); return b && bar ? b[3] * 3.785 * Math.sqrt(bar / 2.758) : null; }; // L/min por pico
const media = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
function calcPulv(q, o = {}) {
  const P = o.presion ?? q.presion, v = o.vel ?? q.vel, picos = Math.max(1, +q.picos || 1);
  const ancho = picos > 1 && q.sep ? picos * q.sep / 100 : (+q.faja || (q.sep ? q.sep / 100 : null));
  const cs = (q.caudales || []).filter(x => x > 0), qm = media(cs), qn = qNominal(q.boqISO, P);
  const qMed = qm != null ? qm * (q.presion && P ? Math.sqrt(P / q.presion) : 1) : null, qq = qMed ?? qn; // si cambia la presión, el caudal cambia con la raíz
  const Q = qq != null ? qq * picos : null, vol = Q && v && ancho ? 600 * Q / (v * ancho) : null;
  const cv = cs.length > 1 ? Math.sqrt(cs.reduce((s, x) => s + (x - qm) ** 2, 0) / (cs.length - 1)) / qm * 100 : null;
  const qn0 = qNominal(q.boqISO, q.presion), fuera = cs.map((x, i) => [i + 1, x]).filter(([, x]) => Math.abs(x - qm) / qm > 0.1 || (qn0 && Math.abs(x - qn0) / qn0 > 0.15));
  return {P, v, picos, ancho, qn, qm, q: qq, Q, vol, cv, fuera, desvNom: qm && qn0 ? (qm / qn0 - 1) * 100 : null, haTanque: vol && q.tanque ? q.tanque / vol : null, seg10: v ? 36 / v : null};
}
const boqTxt = q => [q.boqModelo, q.boqTipo, q.boqISO ? `${q.boqAng || ''}${q.boqISO} (${BOQ.find(x => x[0] === q.boqISO)?.[1] || ''})` : ''].filter(Boolean).join(' · ');
const chipBoq = iso => { const b = BOQ.find(x => x[0] === iso); return b ? `<span class="swatch" style="background:${b[2]};outline:1px solid #0003" title="Boquilla ISO ${b[0]} (${b[1]})"></span>` : ''; };
// ΔT: temperatura menos temperatura de bulbo húmedo (bulbo húmedo por Stull, 2011)
function deltaT(t, hr) { if (t == null || hr == null || hr <= 0 || hr > 100) return null; const tw = t * Math.atan(0.151977 * Math.sqrt(hr + 8.313659)) + Math.atan(t + hr) - Math.atan(hr - 1.676331) + 0.00391838 * hr ** 1.5 * Math.atan(0.023101 * hr) - 4.686035; return t - tw; }
const evDeltaT = d => d == null ? null : d < 2 ? ['warn', 'ΔT bajo (menos de 2): gotas finas que quedan suspendidas y escurrimiento'] : d <= 8 ? ['ok', 'ΔT adecuado (2 a 8)'] : d <= 10 ? ['warn', 'ΔT al límite (8 a 10): usar gotas más gruesas'] : ['bad', 'ΔT alto (más de 10): mucha evaporación, conviene no aplicar'];
const dtTxt = (t, hr) => { const d = deltaT(t, hr), e = evDeltaT(d); return e ? `<span class="chip ${e[0]}" title="${esc(e[1])}">ΔT ${fmt(d, 1)} °C</span>` : ''; };
function snapEq(q, o = {}) { const c = calcPulv(q, o); return {id: q.id, nombre: q.nombre, tipo: q.tipo, boq: boqTxt(q), iso: q.boqISO, picos: c.picos, sep: q.sep, altura: q.altura, presion: c.P, vel: c.v, q: c.q != null ? +c.q.toFixed(3) : null, vol: c.vol != null ? Math.round(c.vol) : null}; }
const eqTxt = e => e ? `${esc(e.nombre)}${e.boq ? ' · ' + esc(e.boq) : ''}${e.presion != null ? ` · ${fmt(e.presion, 1)} bar` : ''}${e.vel != null ? ` · ${fmt(e.vel, 1)} km/h` : ''}${e.altura ? ` · barra a ${e.altura} cm` : ''}` : '';
const pulvVisibles = T => PULV.filter(q => !q.ejemplo || T?.ejemplo || S.user?.ejemplo);

function editarPulv(T, id) {
  const q0 = PULV.find(x => x.id === id), q = q0 ? structuredClone(q0) : {id: 'pv' + Date.now().toString(36), nombre: '', tipo: TIPOS_PULV[1], tanque: 16, picos: 1, sep: 50, altura: 50, faja: 1, boqTipo: TIPOS_BOQ[0], boqISO: '02', boqAng: 110, presion: 3, vel: 4, caudales: [], fechaCal: HOY};
  const M = modal(`<div class="row" style="justify-content:space-between"><h2>${q0 ? 'Pulverizadora y calibración' : 'Nueva pulverizadora'}</h2><button class="btn small" data-cerrar>✕</button></div>
    <form id="f-pv" style="display:grid;gap:12px">
      <div class="grid3"><label class="f">Nombre<input type="text" name="nombre" required value="${esc(q.nombre)}" placeholder="Ej.: Mochila CO₂ de 4 picos"></label>
        <label class="f">Tipo<select name="tipo">${TIPOS_PULV.map(t => `<option ${t === q.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f">Marca o modelo<input type="text" name="marca" value="${esc(q.marca || '')}"></label>
        <label class="f">Tanque (L)<input type="number" step="any" name="tanque" value="${q.tanque ?? ''}"></label>
        <label class="f">Picos (boquillas)<input type="number" min="1" step="1" name="picos" value="${q.picos ?? 1}"></label>
        <label class="f">Separación entre picos (cm)<input type="number" step="any" name="sep" value="${q.sep ?? ''}"></label>
        <label class="f">Altura de la barra al objetivo (cm)<input type="number" step="any" name="altura" value="${q.altura ?? ''}"></label>
        <label class="f">Ancho de faja (m) <span class="note">con 1 pico o dron</span><input type="number" step="any" name="faja" value="${q.faja ?? ''}"></label></div>
      <b style="font-size:.95rem">Boquilla</b>
      <div class="grid3"><label class="f">Tipo de boquilla<select name="boqTipo">${TIPOS_BOQ.map(t => `<option ${t === q.boqTipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f">Tamaño (color ISO)<select name="boqISO"><option value="">Sin dato</option>${BOQ.map(b => `<option value="${b[0]}" ${b[0] === q.boqISO ? 'selected' : ''}>${b[0]} · ${b[1]}</option>`).join('')}</select></label>
        <label class="f">Ángulo (°)<input type="number" step="1" name="boqAng" value="${q.boqAng ?? ''}"></label>
        <label class="f">Modelo de la boquilla<input type="text" name="boqModelo" value="${esc(q.boqModelo || '')}" placeholder="Ej.: XR 11002, TXA 8001, AI 11003"></label></div>
      <b style="font-size:.95rem">Operación y calibración</b>
      <div class="grid3"><label class="f">Presión de trabajo (bar)<input type="number" step="any" name="presion" value="${q.presion ?? ''}"><span class="note">1 bar = 14,5 lb/pulg²</span></label>
        <label class="f">Velocidad de avance (km/h)<input type="number" step="any" name="vel" value="${q.vel ?? ''}"></label>
        <label class="f">Medir la velocidad: segundos en 50 m<input type="number" step="any" name="t50" placeholder="Ej.: 60"><span class="note">km/h = 180 ÷ segundos</span></label>
        <label class="f">Fecha de calibración<input type="date" name="fechaCal" value="${q.fechaCal || HOY}"></label></div>
      <div style="display:grid;gap:6px"><span class="note">Caudal medido de cada pico (L/min): juntá el agua de cada boquilla durante 1 minuto con una jarra graduada (o 30 s y multiplicá por 2).</span>
        <div class="row" id="pv-caudales"></div></div>
      <div class="callout" id="pv-res"></div>
      <label class="f">Observaciones<input type="text" name="obs" value="${esc(q.obs || '')}"></label>
      <div class="row"><button class="btn primary" type="submit">Guardar</button>${q0 && !q0.ejemplo ? '<button class="btn" type="button" id="pv-borrar">Eliminar</button>' : ''}<span class="note" id="pv-msg"></span></div>
    </form>`, 860);
  const F = M.querySelector('#f-pv'), num = k => F[k].value === '' ? null : +F[k].value;
  const leer = () => { ['nombre', 'tipo', 'marca', 'boqTipo', 'boqISO', 'boqModelo', 'fechaCal', 'obs'].forEach(k => q[k] = F[k].value.trim()); ['tanque', 'picos', 'sep', 'altura', 'faja', 'boqAng', 'presion', 'vel'].forEach(k => q[k] = num(k));
    q.caudales = [...M.querySelectorAll('[data-qp]')].map(i => i.value === '' ? null : +i.value).filter(x => x != null && x > 0); };
  const pintarCaudales = () => { const n = Math.min(60, Math.max(1, num('picos') || 1)), cs = q.caudales || [];
    M.querySelector('#pv-caudales').innerHTML = Array.from({length: n}, (_, i) => `<label class="f" style="width:84px">Pico ${i + 1}<input type="number" step="0.01" min="0" data-qp="${i}" value="${cs[i] ?? ''}"></label>`).join(''); };
  const res = () => { leer(); const c = calcPulv(q);
    M.querySelector('#pv-res').innerHTML = `<div class="grid3" style="gap:6px 14px">
      <span>Caudal por pico: <b>${c.q != null ? fmt(c.q, 2) + ' L/min' : '—'}</b>${c.qm != null ? ' (medido)' : c.qn != null ? ' (nominal del tamaño ISO)' : ''}</span>
      <span>Caudal nominal a ${fmt(c.P, 1)} bar: <b>${c.qn != null ? fmt(c.qn, 2) + ' L/min' : '—'}</b></span>
      <span>Ancho de trabajo: <b>${c.ancho ? fmt(c.ancho, 2) + ' m' : '—'}</b></span>
      <span>Volumen de aplicación: <b style="font-size:1.1rem">${c.vol ? fmt(c.vol, 0) + ' L/ha' : '—'}</b></span>
      <span>Caudal total: <b>${c.Q != null ? fmt(c.Q, 2) + ' L/min' : '—'}</b></span>
      <span>${c.seg10 ? `Ritmo: <b>${fmt(c.seg10, 1)} s cada 10 m</b>` : ''}</span>
      ${c.haTanque ? `<span>Un tanque alcanza para <b>${c.haTanque < 1 ? fmt(c.haTanque * 10000, 0) + ' m²' : fmt(c.haTanque, 2) + ' ha'}</b></span>` : ''}
      ${T?.parcela?.area_m2 && c.vol ? `<span>Por parcela (${fmt(T.parcela.area_m2, 1)} m²): <b>${fmt(c.vol * T.parcela.area_m2 / 10000, 2)} L</b></span>` : ''}
      ${c.cv != null ? `<span>Uniformidad entre picos: <b>CV ${fmt(c.cv, 1)} %</b> ${c.cv <= 10 ? '<span class="chip ok">buena</span>' : '<span class="chip warn">revisar</span>'}</span>` : ''}
      ${c.desvNom != null ? `<span>Desgaste: el promedio medido es <b>${c.desvNom >= 0 ? '+' : ''}${fmt(c.desvNom, 1)} %</b> del nominal ${Math.abs(c.desvNom) > 10 ? '<span class="chip warn">cambiar boquillas</span>' : '<span class="chip ok">bien</span>'}</span>` : ''}</div>
      ${c.fuera.length ? `<p style="margin:6px 0 0"><b>Picos a revisar o cambiar:</b> ${c.fuera.map(([i, x]) => `pico ${i} (${fmt(x, 2)} L/min)`).join(', ')}. Se recomienda que ningún pico difiera más de 10 % del promedio.</p>` : ''}
      <div class="row" style="margin-top:8px;gap:6px;align-items:end"><label class="f" style="width:150px">Volumen buscado (L/ha)<input type="number" step="any" id="pv-obj" value="${esc(M._obj ?? '')}"></label><span class="note" id="pv-obj-res"></span></div>`;
    objetivo(); };
  const objetivo = () => { const V = +M.querySelector('#pv-obj')?.value, c = calcPulv(q), o = M.querySelector('#pv-obj-res'); M._obj = V || ''; if (!o) return; if (!V || !c.Q || !c.ancho) { o.textContent = ''; return; }
    const vNec = 600 * c.Q / (V * c.ancho), qNec = V * (c.v || 0) * c.ancho / (600 * c.picos), pNec = c.q && c.P ? c.P * (qNec / c.q) ** 2 : null;
    o.innerHTML = `Con esta presión hay que avanzar a <b>${fmt(vNec, 1)} km/h</b> (${fmt(36 / vNec, 1)} s cada 10 m)${c.v && pNec ? `, o a ${fmt(c.v, 1)} km/h subir/bajar la presión a <b>${fmt(pNec, 1)} bar</b>${pNec < 1 || pNec > 6 ? ' (fuera del rango útil: cambiar de boquilla)' : ''}` : ''}.`; };
  pintarCaudales(); res();
  F.oninput = e => { if (e.target.name === 't50' && +e.target.value > 0) F.vel.value = +(180 / +e.target.value).toFixed(2); if (e.target.name === 'picos') { leer(); pintarCaudales(); } if (e.target.id === 'pv-obj') return objetivo(); res(); };
  F.onchange = F.oninput;
  M.querySelector('#pv-borrar')?.addEventListener('click', async () => { if (!await confirmar('Eliminar pulverizadora', `Se elimina “${esc(q.nombre)}” de la lista. Las aplicaciones ya registradas conservan sus datos.`, {ok: 'Eliminar', peligro: true})) return; PULV.splice(PULV.findIndex(x => x.id === q.id), 1); M.cerrar(); guardarPronto(); if (S.T) RENDER.aplic(S.T); });
  F.onsubmit = e => { e.preventDefault(); leer(); if (!q.nombre) { M.querySelector('#pv-msg').textContent = 'Poné un nombre.'; return; } q.mod = new Date().toISOString();
    const i = PULV.findIndex(x => x.id === q.id); if (i >= 0) PULV[i] = q; else PULV.push(q); M.cerrar(); toast('Pulverizadora guardada'); guardarPronto(); if (S.T && PASOS[S.paso][0] === 'aplic') RENDER.aplic(S.T); };
}
function cardEquipos(T) {
  const L = pulvVisibles(T), ed = puedeAplic(T);
  return `<details class="card" id="card-pulv" ${L.length ? '' : 'open'}><summary style="cursor:pointer"><b>Equipos de aplicación</b> <span class="note">(${L.length} pulverizadora${L.length === 1 ? '' : 's'} · calibración, boquillas y volumen)</span></summary>
    ${L.length ? `<div style="display:grid;gap:8px;margin-top:8px">${L.map(q => { const c = calcPulv(q); return `<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:8px;gap:6px 12px"><div style="display:grid;gap:2px;min-width:0;flex:1 1 260px"><b>${esc(q.nombre)}</b><span class="note">${esc(q.tipo)} · ${chipBoq(q.boqISO)} ${esc(boqTxt(q))} · ${c.picos} pico${c.picos > 1 ? 's' : ''}${q.sep && c.picos > 1 ? ` a ${q.sep} cm` : ''} · ${fmt(q.presion, 1)} bar · ${fmt(q.vel, 1)} km/h</span><span class="note">Calibrada ${q.fechaCal ? fechaTxt(q.fechaCal) : '—'}${c.cv != null ? ` · CV entre picos ${fmt(c.cv, 1)} %` : ''}${c.fuera.length ? ' · <span class="chip warn">picos a revisar</span>' : ''}</span></div>
      <span class="row" style="gap:8px"><b style="font-size:1.05rem">${c.vol ? fmt(c.vol, 0) + ' L/ha' : '—'}</b>${ed ? `<button class="btn small" data-pulv="${q.id}">Calibrar</button>` : ''}</span></div>`; }).join('')}</div>` : '<p class="note" style="margin:0">Cargá la pulverizadora que se usa en el ensayo: la app calcula el volumen (L/ha) con el caudal de las boquillas, la velocidad y el ancho, y lo usa al registrar cada aplicación.</p>'}
    ${ed ? '<button class="btn small" data-pulv="" style="justify-self:start">+ Pulverizadora</button>' : ''}</details>`;
}
// Bloque "equipo y condiciones" del formulario de aplicación
function camposEquipo(T, pre, a = {}) {
  const L = pulvVisibles(T), sel = a.equipo?.id ?? L[0]?.id ?? '';
  return `<div style="display:grid;gap:8px" id="${pre}-eqbox"><b style="font-size:.92rem">Equipo de aplicación</b><div class="grid3">
    <label class="f">Pulverizadora<select id="${pre}-pulv"><option value="">Sin especificar</option>${L.map(q => `<option value="${q.id}" ${q.id === sel ? 'selected' : ''}>${esc(q.nombre)}</option>`).join('')}</select></label>
    <label class="f">Presión (bar)<input type="number" step="any" id="${pre}-pres" value="${a.equipo?.presion ?? ''}"></label>
    <label class="f">Velocidad (km/h)<input type="number" step="any" id="${pre}-vel" value="${a.equipo?.vel ?? ''}"></label>
    <label class="f">Volumen de caldo (L/ha)<input type="number" step="any" id="${pre}-caldo" value="${a.caldo ?? T.caldo ?? ''}"></label>
    <label class="f">Hora de inicio<input type="time" id="${pre}-hora" value="${a.hora || ''}"></label>
    <label class="f">Dirección del viento<select id="${pre}-vdir"><option value="">—</option>${VIENTO_DIR.map(d => `<option ${d === a.vientoDir ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
    <label class="f">Adyuvante<input type="text" id="${pre}-ady" value="${esc(a.adyuvante || '')}" placeholder="Ej.: aceite metilado 0,5 %"></label>
    <label class="f">pH del agua<input type="number" step="0.1" id="${pre}-ph" value="${a.ph ?? ''}"></label></div>
    <span class="note" id="${pre}-eqmsg"></span></div>`;
}
function syncEquipo(pre, forzar) {
  const q = PULV.find(x => x.id === $(`#${pre}-pulv`)?.value), msg = $(`#${pre}-eqmsg`); if (!msg) return;
  if (q && forzar) { $(`#${pre}-pres`).value = q.presion ?? ''; $(`#${pre}-vel`).value = q.vel ?? ''; }
  if (!q) { msg.textContent = ''; return; }
  const num = id => $(id).value === '' ? null : +$(id).value, c = calcPulv(q, {presion: num(`#${pre}-pres`), vel: num(`#${pre}-vel`)});
  if (c.vol && (forzar || $(`#${pre}-caldo`).dataset.auto !== '0')) { $(`#${pre}-caldo`).value = Math.round(c.vol); $(`#${pre}-caldo`).dataset.auto = '1'; }
  msg.innerHTML = `${chipBoq(q.boqISO)} ${esc(boqTxt(q))} · ${c.picos} pico${c.picos > 1 ? 's' : ''} · ${c.q != null ? fmt(c.q, 2) + ' L/min por pico' : 'sin caudal'} → <b>${c.vol ? fmt(c.vol, 0) + ' L/ha' : 'volumen sin calcular'}</b>`;
}
function leerEquipo(T, pre, a) {
  const q = PULV.find(x => x.id === $(`#${pre}-pulv`)?.value), num = id => $(id).value === '' ? null : +$(id).value;
  if (q) a.equipo = snapEq(q, {presion: num(`#${pre}-pres`), vel: num(`#${pre}-vel`)}); else delete a.equipo;
  a.caldo = num(`#${pre}-caldo`); a.hora = $(`#${pre}-hora`).value || undefined; a.vientoDir = $(`#${pre}-vdir`).value || undefined;
  a.adyuvante = $(`#${pre}-ady`).value.trim() || undefined; a.ph = num(`#${pre}-ph`) ?? undefined;
}

/* ----- papel hidrosensible: lecturas guardadas ----- */
const stDe = x => ({...x.st, hist: histDe(x.st.hist)});
function gruposMetro(lista) {
  const m = new Map(); lista.forEach(x => { const k = `${x.parcela ?? ''}|${x.posicion}|${x.metro}`; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return [...m.values()].map(ts => ({parcela: ts[0].parcela, posicion: ts[0].posicion, metro: ts[0].metro, objetivo: ts[0].objetivo, tarjetas: ts.sort((a, b) => (a.tarjeta || 0) - (b.tarjeta || 0)), st: combinarTarjetas(ts.map(stDe))}));
}
const evDens = (d, obj) => { const o = OBJETIVOS[obj] || OBJETIVOS['ins-con']; return d >= o.min ? ['ok', 'Adecuada'] : d >= o.min * 0.7 ? ['warn', 'Algo baja'] : ['bad', 'Baja']; };
const tratDeParcela = (T, pn) => T.parcelas.find(p => p.parcela == pn)?.trat;
function resumenCalidad(T, L) {
  const R = new Map(); gruposMetro(L).forEach(g => { const k = `${tratDeParcela(T, g.parcela) || 'General'}|${g.posicion}`; if (!R.has(k)) R.set(k, []); R.get(k).push(g); });
  return [...R.entries()].sort().map(([k, gs]) => { const [tr, pos] = k.split('|'), m = f => media(gs.map(g => g.st[f]).filter(x => x != null)), dens = m('dens');
    return {tr, pos, n: gs.length, cob: m('cob'), dens, dmv: m('dmv'), pct: [0, 1, 2].map(i => media(gs.map(g => g.st.pct[i]))), ev: evDens(dens, gs[0].objetivo)}; });
}
function calidadAplic(T, a) {
  const L = (T.papeles || []).filter(x => String(x.aplicacion) === String(a.id) && (!T.sitios || S.sitio === 'todos' || !x.parcela || sitioDe(T, +x.parcela)?.id === S.sitio)), lee = puedeAplic(T) && a.estado === 'realizada';
  if (!L.length) return lee ? `<div class="row"><button class="btn small" data-papel="${a.id}">🔍 Leer papel hidrosensible</button><span class="note">Medí la cobertura y las gotas con la cámara del celular.</span></div>` : '';
  const G = gruposMetro(L), C = colTrat(T), tot = combinarTarjetas(L.map(stDe));
  const filasR = resumenCalidad(T, L).map(r => `<tr><td>${C[r.tr] ? `<span class="swatch" style="background:${C[r.tr]}"></span> ` : ''}<b>${esc(r.tr)}</b> · ${esc(r.pos)}<br><span class="note">${r.n} metro${r.n > 1 ? 's' : ''}</span></td><td class="num">${fmt(r.cob, 1)} %</td><td class="num">${fmt(r.dens, 0)}</td><td class="num">${fmt(r.dmv, 0)}</td><td class="num">${[0, 1, 2].map(k => `<span style="color:${COL_GOTA[k]}">${fmt(r.pct[k], 0)}</span>`).join(' / ')}</td><td><span class="chip ${r.ev[0]}">${r.ev[1]}</span></td></tr>`).join('');
  const filasM = G.map(g => `<tr><td>${g.parcela ? 'Parcela ' + esc(T.sitios ? etiq(T, {parcela: +g.parcela, sitio: sitioDe(T, +g.parcela)?.id}) : g.parcela) + ' · ' + esc(tratDeParcela(T, g.parcela) || '') : 'General'}<br><span class="note">${esc(g.posicion)} · ${esc(g.metro)}</span><div class="row" style="gap:4px;margin-top:4px">${g.tarjetas.map(x => `<button class="btn small" data-ver-papel="${x.id}" title="${esc(x.obs || 'Ver la tarjeta')}">${x.img ? '🖼️' : '📄'} ${x.tarjeta || ''}</button>`).join('')}</div></td><td class="num">${fmt(g.st.cob, 1)} %</td><td class="num">${fmt(g.st.dens, 0)}</td><td class="num">${fmt(g.st.dmv, 0)}</td></tr>`).join('');
  return `<details class="calidad"><summary style="cursor:pointer"><b>Papel hidrosensible</b> · ${L.length} tarjeta${L.length > 1 ? 's' : ''} en ${G.length} metro${G.length > 1 ? 's' : ''} · cobertura ${fmt(tot.cob, 1)} % · ${fmt(tot.dens, 0)} gotas/cm² · DMV ${fmt(tot.dmv, 0)} µm (${esc(claseASABE(tot.dmv)).toLowerCase()})</summary>
    <div style="display:grid;gap:8px;margin-top:8px"><div class="tw"><table><thead><tr><th>Tratamiento y posición</th><th class="num">Cobertura</th><th class="num">Gotas/cm²</th><th class="num">DMV <span style="text-transform:none">µm</span></th><th class="num">% chicas / medianas / grandes</th><th>Densidad</th></tr></thead><tbody>${filasR}</tbody></table></div>
    <details><summary class="note" style="cursor:pointer">Ver cada metro lineal y sus tarjetas</summary><div class="tw"><table><thead><tr><th>Metro lineal y tarjetas</th><th class="num">Cobertura</th><th class="num">Gotas/cm²</th><th class="num">DMV <span style="text-transform:none">µm</span></th></tr></thead><tbody>${filasM}</tbody></table></div></details>
    <div class="row">${lee ? `<button class="btn small" data-papel="${a.id}">🔍 Leer otra tarjeta</button>` : ''}${puede.diseno(T) || rolEn(T) === 'operador' ? `<button class="btn small" data-papel-datos="${a.id}">Pasar a Carga de datos</button>` : ''}<span class="note">Chicas &lt; ${CLASES.chica} µm · grandes ≥ ${CLASES.grande} µm (diámetro de gota).</span></div></div></details>`;
}
function leerPapel(T, apId, parSel) {
  const aps = T.aplicaciones.filter(a => a.estado === 'realizada' && PULVERIZA.includes(a.tipo)).sort((x, y) => y.fecha.localeCompare(x.fecha));
  if (!aps.length) return toast('Primero registrá una pulverización realizada en “Aplicaciones y manejo”');
  const ap = aps.find(a => String(a.id) === String(apId)) || aps[0], ps = [...enSitio(T)].sort((a, b) => a.parcela - b.parcela);
  const prev = (T.papeles || []).filter(x => String(x.aplicacion) === String(ap.id)), ult = prev[prev.length - 1];
  const obj = /herbic|malezas/i.test(ap.tipo + (ap.producto || '')) ? 'her-sis' : /fungic|insectic|plagas|tratamientos/i.test(ap.tipo) ? 'ins-con' : 'ins-sis';
  abrirLector({titulo: 'Papel hidrosensible', ejemplo: 'img/papel_ejemplo.jpg', objetivo: ult?.objetivo || obj, clases: ult?.clases,
    aviso: t => toast(t), alCerrar: n => { if (n && S.T === T) { refrescar(); } },
    guardar: {campos: {aplicaciones: aps.map(a => ({v: a.id, t: `${fechaTxt(a.fecha)} · ${a.tipo}${a.estadio ? ' · ' + a.estadio : ''}`})), aplSel: ap.id,
      parcelas: ps.map(p => ({v: p.parcela, t: `${etiq(T, p)} · ${p.trat} · bloque ${p.bloque}`})), parSel: parSel ?? ult?.parcela ?? ps[0]?.parcela ?? '', posiciones: POSICIONES, posSel: ult?.posicion || POSICIONES[0], metro: ult?.metro || 'Metro 1'},
      onGuardar: async d => {
        const id = 'pp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), imgId = 'img-' + id;
        await DB.guardarImagen({id: imgId, ensayo: T.id, tipo: 'papel', ref: d.parcela || null, nombre: `papel_${d.parcela || 'general'}_${d.metro}.jpg`, fecha: ahora(), autor: S.user.id, blob: d.blob});
        T.papeles = T.papeles || []; const misma = T.papeles.filter(x => String(x.aplicacion) === String(d.aplicacion) && String(x.parcela ?? '') === String(d.parcela) && x.posicion === d.posicion && x.metro === d.metro);
        T.papeles.push({id, aplicacion: isNaN(+d.aplicacion) ? d.aplicacion : +d.aplicacion, parcela: d.parcela === '' ? null : +d.parcela, posicion: d.posicion, metro: d.metro, tarjeta: misma.length + 1, obs: d.obs, objetivo: d.objetivo,
          fecha: HOY, autor: S.user.id, pxmm: d.pxmm, papel: d.papel, sens: d.sens, clases: d.clases, img: imgId, st: d.st});
        T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: d.parcela || '—', variable: `Papel hidrosensible (${d.posicion}, ${d.metro})`, antes: null, despues: `${fmt(d.st.cob, 1)} % · ${fmt(d.st.dens, 0)} gotas/cm²`, estado: ['dueño', 'gerente'].includes(rolEn(T)) ? 'aprobado' : 'pendiente'});
        await guardarAhora(); return `Tarjeta ${misma.length + 1} de ${d.metro} guardada`; }}});
}
async function verPapel(T, id) {
  const x = (T.papeles || []).find(p => p.id === id); if (!x) return;
  const im = x.img ? (await DB.imagenesDe(T.id).catch(() => [])).find(i => i.id === x.img) : null;
  if (!im) { const s = stDe(x);
    const M = modal(`<div class="row" style="justify-content:space-between"><h2>Tarjeta ${x.tarjeta || ''} · ${esc(x.metro)}</h2><button class="btn small" data-cerrar>✕</button></div>
      <p class="note" style="margin:0">${x.parcela ? 'Parcela ' + esc(x.parcela) + ' · ' : ''}${esc(x.posicion)} · ${fechaTxt(x.fecha)} · ${esc(USERS[x.autor]?.nombre || '')}. ${T.ejemplo ? 'Lectura de ejemplo (sin imagen guardada).' : 'La imagen no está en este equipo.'}</p>
      <div class="kpis"><div class="kpi"><span>Cobertura</span><b>${fmt(s.cob, 1)} %</b></div><div class="kpi"><span>Gotas/cm²</span><b>${fmt(s.dens, 0)}</b></div><div class="kpi"><span>DMV</span><b>${fmt(s.dmv, 0)} µm</b><span>${esc(claseASABE(s.dmv))}</span></div><div class="kpi"><span>Chicas / medianas / grandes</span><b style="font-size:1rem">${s.clases.join(' / ')}</b></div></div>
      ${puede.diseno(T) ? '<div class="row"><button class="btn small" id="pp-borrar">Eliminar esta tarjeta</button></div>' : ''}`, 620);
    M.querySelector('#pp-borrar')?.addEventListener('click', () => borrarPapel(T, x, M)); return; }
  abrirLector({ver: {blob: im.blob, pxmm: x.pxmm, papel: x.papel, sens: x.sens, clases: x.clases, objetivo: x.objetivo}, titulo: `Tarjeta ${x.tarjeta || ''} · ${x.metro}`});
}
async function borrarPapel(T, x, M) {
  if (!await confirmar('Eliminar tarjeta', 'Se elimina esta lectura de papel hidrosensible y su imagen.', {ok: 'Eliminar', peligro: true})) return;
  T.papeles = T.papeles.filter(p => p.id !== x.id); if (x.img) await DB.borrarImagen(x.img).catch(() => {}); M?.cerrar(); guardarPronto(); refrescar();
}
// Lleva cobertura, densidad y DMV por parcela (promedio de sus tarjetas) a las mediciones del ensayo
function papelADatos(T, apId) {
  const L = (T.papeles || []).filter(x => String(x.aplicacion) === String(apId) && x.parcela != null); if (!L.length) return toast('No hay tarjetas asignadas a parcelas');
  const ids = ['pulv_cob', 'pulv_dens', 'pulv_dmv']; ids.forEach(id => { if (!T.variables.some(v => v.id === id)) { const v = varDef(T.rubro, id); if (v) T.variables.push(v); } });
  const porP = new Map(); L.forEach(x => { if (!porP.has(x.parcela)) porP.set(x.parcela, []); porP.get(x.parcela).push(x); });
  let n = 0; for (const [pn, ts] of porP) { if (!T.parcelas.some(p => p.parcela === pn) || !puede.datos(T, pn)) continue; const s = combinarTarjetas(ts.map(stDe));
    if (guardarValor(T, pn, 'pulv_cob', +s.cob.toFixed(2))) n++; if (guardarValor(T, pn, 'pulv_dens', +s.dens.toFixed(1))) n++; if (s.dmv != null && guardarValor(T, pn, 'pulv_dmv', Math.round(s.dmv))) n++; }
  toast(n ? `${n} valores pasados a Carga de datos (${porP.size} parcelas)` : 'Los valores ya estaban cargados'); refrescar(); guardarPronto();
}

/* ---------- 4 campo y parcelas (mapa) ---------- */
const mapa = (() => {
  const W0 = E0.imagen.ancho_px, H0 = E0.imagen.alto_px; let listo = false, IDX, THD, IM = {};
  const st = {modo: 'una', zoom: 'ensayo', A: 'rgb', B: 'ndvi', op: 55, rampa: {ndvi: 'rdylgn', ndre: 'rdylgn', gndvi: 'rdylgn', termico: 'magma'}, rango: {ndvi: [0, 0.8], ndre: [-0.2, 0.25], gndvi: [0, 0.6], termico: [25, 45]}, grilla: true, colorT: false, colorOp: false, swipe: 0.5};
  const CAPAS = {rgb: {n: 'RGB (color real)', tipo: 'img'}, falso: {n: 'Falso color (NIR-R-G)', tipo: 'img'}, ndvi: {n: 'NDVI', tipo: 'idx'}, ndre: {n: 'NDRE', tipo: 'idx'}, gndvi: {n: 'GNDVI', tipo: 'idx'}, termico: {n: 'Térmico (°C)', tipo: 'idx'}};
  const RAMPAS = {rdylgn: {n: 'Rojo–amarillo–verde', s: ['#a50026', '#f46d43', '#fee08b', '#d9ef8b', '#66bd63', '#006837']}, viridis: {n: 'Viridis', s: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']}, magma: {n: 'Magma', s: ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf']}, gris: {n: 'Grises', s: ['#000000', '#ffffff']}};
  const cache = {};
  async function cargar() { if (listo) return; const L = s => new Promise((ok, er) => { const i = new Image(); i.onload = () => ok(i); i.onerror = er; i.src = s; });
    const [a, b, c, d] = await Promise.all(['img/rgb.jpg', 'img/falso_color.jpg', 'img/indices.png', 'img/termico.png'].map(L)); IM.rgb = a; IM.falso = b;
    const pix = im => { const cv = document.createElement('canvas'); cv.width = W0; cv.height = H0; const x = cv.getContext('2d'); x.drawImage(im, 0, 0, W0, H0); return x.getImageData(0, 0, W0, H0).data; };
    IDX = pix(c); THD = pix(d); listo = true; }
  const valor = {ndvi: i => IDX[i * 4] / 255 * 2 - 1, ndre: i => IDX[i * 4 + 1] / 255 * 2 - 1, gndvi: i => IDX[i * 4 + 2] / 255 * 2 - 1, termico: i => THD[i * 4] / 255 * 40 + 15};
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lut = k => { const s = RAMPAS[k].s.map(hex), o = new Uint8ClampedArray(768); for (let i = 0; i < 256; i++) { const t = i / 255 * (s.length - 1), a = Math.floor(Math.min(t, s.length - 1.001)), f = t - a; for (let c = 0; c < 3; c++) o[i * 3 + c] = s[a][c] + (s[a + 1][c] - s[a][c]) * f; } return o; };
  function capa(k) { const key = k + '|' + (st.rampa[k] || '') + '|' + (st.rango[k] || ''); if (cache[k]?.key === key) return cache[k].c;
    const c = document.createElement('canvas'); c.width = W0; c.height = H0; const x = c.getContext('2d');
    if (CAPAS[k].tipo === 'img') x.drawImage(IM[k], 0, 0, W0, H0);
    else { const L = lut(st.rampa[k]), [lo, hi] = st.rango[k], id = x.createImageData(W0, H0), d = id.data, f = valor[k];
      for (let i = 0; i < W0 * H0; i++) { let v = (f(i) - lo) / (hi - lo); v = v < 0 ? 0 : v > 1 ? 1 : v; const j = Math.round(v * 255) * 3; d[i * 4] = L[j]; d[i * 4 + 1] = L[j + 1]; d[i * 4 + 2] = L[j + 2]; d[i * 4 + 3] = 255; }
      x.putImageData(id, 0, 0); }
    cache[k] = {key, c}; return c; }
  function layout(T) { // parcelas sin imagen: grilla virtual
    const cols = T.tratamientos.length, cw = 110, ch = 78, g = 10, m = 16;
    T.parcelas.forEach(p => { const col = (p.parcela % 100) - 1, row = p.bloque - 1; p.gpx = [m + col * (cw + g), m + 26 + row * (ch + g), cw, ch]; });
    T._W = m * 2 + cols * (cw + g) - g; T._H = m * 2 + 26 + T.bloques * (ch + g) - g;
  }
  let viewers = [], T = null;
  const usaImg = () => !!(T && T.imagen && T.dron); const PX = p => usaImg() ? p.px : p.gpx;
  function vista() { return usaImg() ? (st.zoom === 'ensayo' ? [0, 380, W0 * 0.56, H0 - 380] : [0, 0, W0, H0]) : [0, 0, T._W, T._H]; }
  function montar(host) {
    host.innerHTML = ''; viewers = [];
    const mk = () => { const v = document.createElement('div'); v.className = 'viewer' + (usaImg() ? '' : ' plain'); const c = document.createElement('canvas'); v.append(c); const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; v.append(tip); return {v, c, tip}; };
    const modo = usaImg() ? st.modo : 'una';
    if (modo === 'paneles') { const d = document.createElement('div'); d.className = 'duo'; const a = mk(), b = mk(); [a, b].forEach(x => x.v.insertAdjacentHTML('beforeend', '<span class="tag" style="left:8px"></span>')); d.append(a.v, b.v); host.append(d); viewers = [{...a, capa: 'A'}, {...b, capa: 'B'}]; }
    else { const a = mk(); if (modo === 'cortina') a.v.insertAdjacentHTML('beforeend', '<div class="swipe"></div><span class="tag" style="left:8px"></span><span class="tag" style="right:8px"></span>'); host.append(a.v); viewers = [{...a, capa: 'A'}]; }
    viewers.forEach(eventos); dibujarTodo();
  }
  function eventos(vw) {
    const toImg = e => { const r = vw.c.getBoundingClientRect(), [sx, sy, sw, sh] = vista(); return [sx + (e.clientX - r.left) / r.width * sw, sy + (e.clientY - r.top) / r.height * sh, (e.clientX - r.left) / r.width, e.clientX - r.left, e.clientY - r.top]; };
    let drag = false;
    vw.c.addEventListener('pointerdown', e => { const [x, y, fx] = toImg(e); if (usaImg() && st.modo === 'cortina' && Math.abs(fx - st.swipe) < 0.04) { drag = true; vw.c.setPointerCapture(e.pointerId); return; }
      const p = T.parcelas.find(p => x >= PX(p)[0] && x <= PX(p)[0] + PX(p)[2] && y >= PX(p)[1] && y <= PX(p)[1] + PX(p)[3]); if (p) { S.sel = p.parcela; dibujarTodo(); abrirDrawer(p.parcela); } });
    vw.c.addEventListener('pointermove', e => { const [x, y, fx, ox, oy] = toImg(e); if (drag) { st.swipe = Math.max(0, Math.min(1, fx)); dibujarTodo(); return; }
      const p = T.parcelas.find(p => x >= PX(p)[0] && x <= PX(p)[0] + PX(p)[2] && y >= PX(p)[1] && y <= PX(p)[1] + PX(p)[3]);
      let txt = p ? `Parcela ${p.parcela % (T.sitios ? 1000 : 100000)} · ${p.trat}` : '';
      if (usaImg()) { const capa = vw.capa === 'B' || (st.modo === 'cortina' && fx > st.swipe) || st.modo === 'superponer' ? st.B : st.A; const k = CAPAS[capa].tipo === 'idx' ? capa : (CAPAS[st.B].tipo === 'idx' ? st.B : 'ndvi');
        const i = Math.floor(y) * W0 + Math.floor(x); if (i >= 0 && i < W0 * H0) txt = (txt ? txt + ' · ' : '') + `${CAPAS[k].n} ${fmt(valor[k](i), k === 'termico' ? 1 : 3)}`; }
      vw.tip.hidden = !txt; vw.tip.textContent = txt; vw.tip.style.left = ox + 'px'; vw.tip.style.top = oy + 'px';
      vw.c.style.cursor = usaImg() && st.modo === 'cortina' && Math.abs(fx - st.swipe) < 0.04 ? 'ew-resize' : p ? 'pointer' : 'default'; });
    vw.c.addEventListener('pointerup', () => drag = false); vw.c.addEventListener('pointerleave', () => vw.tip.hidden = true);
  }
  function dibujar(vw) {
    const [sx, sy, sw, sh] = vista(), c = vw.c, sc = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(sw * sc); c.height = Math.round(sh * sc);
    const x = c.getContext('2d'), k = c.width / sw, C = colTrat(T), yo = S.user.id, esOp = rolEn(T) === 'operador', panelCol = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#fff';
    if (usaImg()) { const draw = (cp, a = 1, clip = null) => { x.save(); if (clip) { x.beginPath(); x.rect(clip[0], 0, clip[1], c.height); x.clip(); } x.globalAlpha = a; x.drawImage(capa(cp), sx, sy, sw, sh, 0, 0, c.width, c.height); x.restore(); };
      draw(vw.capa === 'B' ? st.B : st.A); if (st.modo === 'cortina') { const cx = st.swipe * c.width; draw(st.B, 1, [cx, c.width - cx]); } if (st.modo === 'superponer') draw(st.B, st.op / 100); }
    else { x.fillStyle = (getComputedStyle(document.documentElement).getPropertyValue('--field') || '#e3eadb').trim(); x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(); x.font = `600 ${12 * k}px Archivo, system-ui, sans-serif`; x.textBaseline = 'middle';
      for (let b = 1; b <= T.bloques; b++) { const p = T.parcelas.find(q => q.bloque === b); x.save(); x.translate(6 * k, (PX(p)[1] + PX(p)[3] / 2) * k); x.rotate(-Math.PI / 2); x.textAlign = 'center'; x.fillText('B' + b, 0, 0); x.restore(); }
      x.textAlign = 'left'; x.fillText('↑ N', (T._W - 40) * k, 14 * k); }
    if (!st.grilla && usaImg()) return etiquetas(vw);
    x.font = `600 ${Math.round(11 * k)}px Archivo, system-ui, sans-serif`; x.textBaseline = 'top';
    for (const p of T.parcelas) { const [px, py, pw, ph] = PX(p), X = (px - sx) * k, Y = (py - sy) * k, Wd = pw * k, Hd = ph * k, mia = tieneOp(T, p.parcela, yo), asg = asigDe(T, p.parcela);
      if (!usaImg()) { x.fillStyle = st.colorT ? C[p.trat] + '55' : panelCol; x.fillRect(X, Y, Wd, Hd); }
      else if (st.colorT) { x.fillStyle = C[p.trat] + '55'; x.fillRect(X, Y, Wd, Hd); }
      if (st.colorOp && asg) { x.fillStyle = asg.color + '66'; x.fillRect(X, Y, Wd, Hd); }
      if (esOp && !mia) { x.fillStyle = 'rgba(0,0,0,.58)'; x.fillRect(X, Y, Wd, Hd); }
      const sel = S.sel === p.parcela; x.lineWidth = (sel ? 3.4 : esOp && mia ? 2.6 : 1.6) * k;
      x.strokeStyle = sel ? '#ffffff' : esOp && mia ? '#38e1ff' : usaImg() ? (st.colorT ? C[p.trat] : 'rgba(255,238,88,.95)') : C[p.trat]; if (sel && !usaImg()) x.strokeStyle = '#111';
      x.strokeRect(X, Y, Wd, Hd);
      if (!usaImg() || st.zoom === 'ensayo') { const lab = `${p.parcela % (T.sitios ? 1000 : 100000)} · ${p.trat}`, tw = x.measureText(lab).width; x.fillStyle = 'rgba(10,14,12,.74)'; x.fillRect(X + 4 * k, Y + 4 * k, tw + 8 * k, 16 * k); x.fillStyle = '#fff'; x.fillText(lab, X + 8 * k, Y + 6 * k);
        const pe = pendientes(T, p).length, nn = T.notas.filter(n => n.nivel === 'parcela' && n.ref === p.parcela).length;
        if (pe || nn) { x.font = `600 ${Math.round(10 * k)}px Archivo, system-ui, sans-serif`; let yy = Y + Hd - 18 * k;
          const pill = (t, bg) => { const w = x.measureText(t).width + 8 * k; x.fillStyle = bg; x.fillRect(X + 4 * k, yy, w, 14 * k); x.fillStyle = '#fff'; x.fillText(t, X + 8 * k, yy + 1.5 * k); yy -= 17 * k; };
          if (pe) pill(`${pe} pendiente${pe > 1 ? 's' : ''}`, '#a15c00'); if (nn) pill(`${nn} nota${nn > 1 ? 's' : ''}`, '#0b6e8a');
          x.font = `600 ${Math.round(11 * k)}px Archivo, system-ui, sans-serif`; } } }
    etiquetas(vw);
  }
  function etiquetas(vw) { const tags = vw.v.querySelectorAll('.tag'); if (usaImg() && st.modo === 'cortina') { tags[0].textContent = CAPAS[st.A].n; tags[1].textContent = CAPAS[st.B].n; vw.v.querySelector('.swipe').style.left = (st.swipe * 100) + '%'; }
    if (usaImg() && st.modo === 'paneles') tags[0].textContent = CAPAS[vw.capa === 'B' ? st.B : st.A].n; }
  function dibujarTodo() { if (!T || !viewers.length || !viewers[0].c.isConnected) return; viewers.forEach(dibujar); leyenda(); }
  function leyenda() { const L = $('#legend'); if (!L) return; const k = st.modo === 'una' ? (CAPAS[st.A].tipo === 'idx' ? st.A : null) : [st.B, st.A].find(c => CAPAS[c].tipo === 'idx');
    const rs = $('#rampa'), mn = $('#rmin'), mx = $('#rmax'); $('#lab-capaB').hidden = st.modo === 'una'; $('#lab-op').hidden = st.modo !== 'superponer';
    if (!k) { L.innerHTML = '<span class="note">Elegí una capa de índice (NDVI, NDRE, GNDVI o térmico) para ajustar paleta y rango.</span>'; rs.disabled = mn.disabled = mx.disabled = true; return; }
    rs.disabled = mn.disabled = mx.disabled = false; rs.value = st.rampa[k]; mn.value = st.rango[k][0]; mx.value = st.rango[k][1]; rs.dataset.k = k; const [lo, hi] = st.rango[k];
    L.innerHTML = `<div class="note">${CAPAS[k].n}</div><div class="lbar" style="background:linear-gradient(90deg,${RAMPAS[st.rampa[k]].s.join(',')})"></div><div class="ticks"><span>${fmt(lo, 2)}</span><span>${fmt((lo + hi) / 2, 2)}</span><span>${fmt(hi, 2)}</span></div>`; }
  async function render(Tr) {
    T = Tr; layout(T); const op = rolEn(T) === 'operador';
    const ops = Object.values(USERS).filter(u => Object.values(T.asig).includes(u.id));
    P().innerHTML = `<section class="panel"><h2>${T.dron ? 'Campo y dron' : 'Croquis y parcelas'}</h2>
      <p class="lead">${op ? 'Tus parcelas están resaltadas en celeste. ' : ''}Tocá una parcela para controlarla: cargar resultados, ver cómo se mide cada variable y dejar notas de la parcela, del tratamiento o del bloque.</p>
      <div class="mapwrap"><div style="display:grid;gap:8px;min-width:0">
        ${usaImg() ? '<div class="row"><div class="seg" id="seg-modo"></div><div class="seg" id="seg-zoom"></div></div>' : ''}
        <div id="viewer-host"></div>
        <p class="note">${usaImg() ? `Fuente: ${esc(T.imagen.fuente)}, ${T.imagen.fecha}. ${esc(T.imagen.nota)}` : 'Croquis sorteado (bloques de arriba hacia abajo). Para ubicarlo en el mapa marcá las esquinas con el GPS o cargá un ortomosaico del dron.'}</p></div>
      <div class="side"><div class="card ctl">
        ${usaImg() ? `<label class="f">Capa principal<select id="capaA">${Object.entries(CAPAS).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('')}</select></label>
        <label class="f" id="lab-capaB">Capa de comparación<select id="capaB">${Object.entries(CAPAS).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('')}</select></label>
        <label class="f" id="lab-op">Transparencia de la comparación<input type="range" id="op" min="0" max="100" value="${st.op}"></label>
        <label class="f">Paleta<select id="rampa">${Object.entries(RAMPAS).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('')}</select></label>
        <label class="f">Rango del índice<span class="row" style="flex-wrap:nowrap"><input type="number" id="rmin" step="0.05"><span>a</span><input type="number" id="rmax" step="0.05"></span></label>
        <div class="legend" id="legend"></div>
        <label class="chk"><input type="checkbox" id="ver-grilla" ${st.grilla ? 'checked' : ''}><span>Croquis</span></label>` : '<div id="legend" hidden></div><select id="rampa" hidden></select><input id="rmin" hidden><input id="rmax" hidden><span id="lab-capaB" hidden></span><span id="lab-op" hidden></span>'}
        <label class="chk"><input type="checkbox" id="ver-color" ${st.colorT ? 'checked' : ''}><span>Color por tratamiento</span></label>
        <label class="chk"><input type="checkbox" id="ver-op" ${st.colorOp ? 'checked' : ''}><span>Color por operador asignado</span></label>
        ${ops.length ? `<div class="row note">${ops.map(u => `<span class="row" style="gap:4px"><span class="swatch" style="background:${u.color}"></span>${esc(u.nombre.split(' ')[0])}</span>`).join('')}</div>` : ''}
        ${T.dron ? (usaImg() ? `<label class="f">Ver otra imagen encima (JPG o PNG del mismo encuadre)<input type="file" id="archivo" accept="image/jpeg,image/png"></label>` : `<p class="note" style="margin:0">Valores del dron por parcela: exportá las parcelas a QGIS (Informe y exportar), calculá el índice con “Estadísticas de zona” y traé el CSV en <b>Carga de datos → Importar</b>. El ortomosaico se puede guardar como foto del ensayo.</p>`) : `<p class="note" style="margin:0">Este ensayo trabaja sin imágenes de dron.${puede.diseno(T) ? ' Se pueden activar en Planificación.' : ''}</p>`}
      </div>
      <div class="card"><h3>Resumen</h3><dl class="kv"><dt>Parcelas</dt><dd>${T.parcelas.length}</dd><dt>Con pendientes</dt><dd>${T.parcelas.filter(p => pendientes(T, p).length).length}</dd><dt>Notas</dt><dd>${T.notas.length}</dd></dl></div></div></div>${cardFotoAerea(S.T, T)}</section>`;
    P().onclick = e => clicFotoAerea(e, S.T, T); P().onchange = e => clicFotoAereaCambio(e, S.T, T); P().oninput = null; pintarFotoAerea(S.T, T);
    if (usaImg()) { await cargar();
      seg('#seg-modo', [['una', 'Una capa'], ['cortina', 'Lado a lado'], ['superponer', 'Superponer'], ['paneles', 'Dos paneles']], st.modo, v => { st.modo = v; montar($('#viewer-host')); });
      seg('#seg-zoom', [['ensayo', 'Ensayo'], ['completa', 'Imagen completa']], st.zoom, v => { st.zoom = v; dibujarTodo(); });
      $('#capaA').value = st.A; $('#capaB').value = st.B;
      $('#capaA').onchange = e => { st.A = e.target.value; dibujarTodo(); }; $('#capaB').onchange = e => { st.B = e.target.value; dibujarTodo(); };
      $('#op').oninput = e => { st.op = +e.target.value; dibujarTodo(); };
      $('#rampa').onchange = e => { st.rampa[e.target.dataset.k] = e.target.value; dibujarTodo(); };
      const rg = () => { const k = $('#rampa').dataset.k, a = +$('#rmin').value, b = +$('#rmax').value; if (k && b > a) { st.rango[k] = [a, b]; dibujarTodo(); } }; $('#rmin').onchange = rg; $('#rmax').onchange = rg;
      $('#ver-grilla').onchange = e => { st.grilla = e.target.checked; dibujarTodo(); }; }
    $('#ver-color').onchange = e => { st.colorT = e.target.checked; dibujarTodo(); }; $('#ver-op').onchange = e => { st.colorOp = e.target.checked; dibujarTodo(); };
    if ($('#archivo')) $('#archivo').onchange = async e => { const f = e.target.files[0]; if (!f) return; const im = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = URL.createObjectURL(f); });
      if (usaImg()) { IM.propia = im; CAPAS.propia = {n: 'Mi imagen: ' + f.name.slice(0, 22), tipo: 'img'}; delete cache.propia; st.A = 'propia'; render(T); }
      };
    montar($('#viewer-host'));
  }
  window.addEventListener('resize', () => dibujarTodo());
  return {render, redibujar: dibujarTodo, reset: () => { st.modo = 'una'; }, layout};
})();
RENDER.campo = T => {
  if (esLal(T) && (!T.sitios || S.sitio !== 'todos')) return renderLal(T);
  if (!T.sitios) return mapa.render(T);
  if (S.sitio === 'todos') { P().innerHTML = `<section class="panel"><h2>Lugares del ensayo</h2><p class="lead">El mismo ensayo repetido en ${T.sitios.length} lugares. Cada lugar tiene su croquis sorteado y su operador. Elegí un lugar arriba (o “Ver croquis y datos”) para ver sus parcelas.</p>${tablaSitios(T)}</section>`;
    P().onclick = e => clicSitios(e, T); P().onchange = e => { if (cambioSitioOp(e, T)) RENDER.campo(T); }; P().oninput = null; return; }
  mapa.render(vistaS(T));
};

/* ---------- 4 mediciones (variables y métodos) ---------- */
let medirAbierto = null;
RENDER.medir = T => {
  const ed = puede.diseno(T), disponibles = [...MET[T.rubro], ...CUSTOM.filter(c => c.rubro === T.rubro)].filter(m => !T.variables.some(v => v.id === m.id) && !(T.porCorte || []).includes(m.id) && (T.dron || m.origen !== 'dron'));
  P().innerHTML = `<section class="panel"><h2>Mediciones</h2>
    <p class="lead">Qué se mide en este ensayo y cómo. Cada medición trae su método precargado; ${ed ? 'podés elegir otro método, escribir el tuyo o crear un indicador propio.' : 'el método lo define el responsable del ensayo.'}</p>
    ${T.cortes ? cortesCard(T, ed) : ''}
    <div class="card">${vis(T).filter(v => !v.corte || v.corte === 1).map(v => `<div class="varc"><div><b>${esc(v.corte ? v.nombre.replace(/ · corte \d+$/, '') : v.nombre)}</b> ${v.unidad ? `<span class="note">(${esc(v.unidad)})</span>` : ''} ${v.origen === 'dron' ? '<span class="chip dron">dron</span>' : ''}${v.corte ? `<span class="chip acc">en cada corte (${T.cortes.length})</span>` : ''}${v.origen === 'calc' ? '<span class="chip neu">se calcula sola</span>' : ''}${v.propio ? '<span class="chip hypo">indicador propio</span>' : ''}
        <div class="note">${v.origen === 'calc' ? 'Se calcula a partir de los cortes · no se carga' : v.tipo === 'escala' ? 'Escala ' + esc((v.escala || []).length ? v.escala[0] + ' … ' + v.escala[v.escala.length - 1] : '') : v.tipo === 'texto' ? 'Observación escrita' : `${v.tipo === 'porcentaje' ? 'Porcentaje' : v.tipo === 'conteo' ? 'Conteo' : 'Número'} · rango ${v.min ?? '—'} a ${v.max ?? '—'}`} · ${v.entrada === 'ms' ? `calculadora de materia seca (${T.parcela.marcos || 2} marcos de ${T.parcela.marco || 0.25} m²)` : v.entrada === 'rend13' ? 'calculadora de rendimiento a 13 % de humedad' : v.sub > 1 ? v.sub + ' submuestras por parcela (se promedian)' : '1 valor por parcela'}${v.momento && !v.corte ? ' · ' + esc(v.momento) : ''}</div></div>
        <div class="row">${ed && v.origen !== 'calc' ? `<button class="btn small" data-editm="${v.id}">${medirAbierto === v.id ? 'Cerrar' : 'Cambiar método'}</button><button class="btn small" data-quitar="${v.id}">Quitar</button>` : ''}</div>
        <div class="met"><b style="color:var(--ink)">Cómo se mide:</b> ${esc(v.metodo)}${v.ref ? ` <span class="note">· Fuente: ${esc(refTxt(v.ref))}</span>` : ''}</div>
        ${medirAbierto === v.id ? `<div class="met" style="display:grid;gap:8px">${(ALTERNATIVAS[v.id] || []).length ? `<label class="f">Métodos disponibles<select data-alt="${v.id}">${ALTERNATIVAS[v.id].map(a => `<option ${a === v.metodo ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>` : ''}
          <label class="f">O escribí tu método<textarea data-mtxt="${v.id}">${esc(v.metodo)}</textarea></label>
          <div class="row"><label class="f">Submuestras por parcela<input type="number" min="1" max="30" data-msub="${v.id}" value="${v.sub}"></label><label class="f">Momento de evaluación<input type="text" data-mmom="${v.id}" value="${esc(v.momento || '')}" placeholder="Ej.: 21 DDA, R6, 12 meses"></label></div>
          <button class="btn small primary" data-guardarm="${v.id}" style="justify-self:start">Guardar método</button></div>` : ''}</div>`).join('') || '<p class="note">Todavía no hay mediciones.</p>'}</div>
    ${ed ? `<div class="grid2"><div class="card"><h3>Agregar desde el catálogo de ${RUBROS[T.rubro].nombre.toLowerCase()}</h3>
        ${disponibles.length ? disponibles.map(m => `<div class="varc"><div><b>${esc(m.nombre)}</b> ${m.unidad ? `<span class="note">(${esc(m.unidad)})</span>` : ''}${m.propio ? ' <span class="chip hypo">propio</span>' : ''}</div><button class="btn small" data-agregar="${m.id}">Agregar</button><div class="met">${esc(m.metodo)}</div></div>`).join('') : '<p class="note">Ya usás todas las mediciones del catálogo.</p>'}</div>
      <form class="card" id="f-indic"><h3>Crear un indicador propio</h3>
        <div class="grid2"><label class="f">Nombre<input type="text" id="ci-nombre" required placeholder="Ej.: Vigor visual"></label><label class="f">Unidad<input type="text" id="ci-unidad" placeholder="Ej.: nota, cm, %"></label></div>
        <div class="grid2"><label class="f">Tipo<select id="ci-tipo"><option value="numero">Número</option><option value="porcentaje">Porcentaje</option><option value="conteo">Conteo</option><option value="escala">Escala de notas</option><option value="texto">Observación escrita</option></select></label>
          <label class="f">Submuestras por parcela<input type="number" id="ci-sub" value="1" min="1" max="30"></label></div>
        <div class="grid2"><label class="f">Mínimo<input type="number" id="ci-min" value="0"></label><label class="f">Máximo<input type="number" id="ci-max" value="100"></label></div>
        <label class="f" id="ci-esc-l" hidden>Niveles de la escala (uno por renglón, de menor a mayor)<textarea id="ci-esc">1 Muy malo\n2 Malo\n3 Regular\n4 Bueno\n5 Muy bueno</textarea></label>
        <label class="f">Cómo se mide<textarea id="ci-met" data-voz required placeholder="Ej.: nota visual de 1 a 5 del vigor de toda la parcela, siempre a la misma hora y por el mismo evaluador."></textarea></label>
        <label class="row" style="gap:6px;font-size:.86rem"><input type="checkbox" id="ci-guardar" checked> Guardarlo en mis indicadores para otros ensayos</label>
        <button class="btn primary" type="submit" style="justify-self:start">Crear y agregar al ensayo</button></form></div>` : ''}</section>`;
  const panel = P();
  panel.onclick = e => {
    const q = e.target.closest('[data-quitar]'), a = e.target.closest('[data-agregar]'), em = e.target.closest('[data-editm]'), gm = e.target.closest('[data-guardarm]');
    if (e.target.closest('#btn-corte')) { if (agregarCorte(T)) RENDER.medir(T); return; }
    if (q) { const v = T.variables.find(x => x.id === q.dataset.quitar);
      if (v?.base) { T.porCorte = T.porCorte.filter(b => b !== v.base); T.variables = T.variables.filter(x => x.base !== v.base); armarCortes(T); } else T.variables = T.variables.filter(x => x.id !== q.dataset.quitar); RENDER.medir(T); }
    if (a) { const m = [...MET[T.rubro], ...CUSTOM].find(x => x.id === a.dataset.agregar);
      if (m.porCorte && T.cortes) { T.porCorte.push(m.id); armarCortes(T); toast(`${m.nombre} agregada a ${T.cortes.length ? 'cada corte' : 'los próximos cortes'}`); }
      else { T.variables.push(structuredClone(m)); toast(`${m.nombre} agregada`); } RENDER.medir(T); }
    if (em) { medirAbierto = medirAbierto === em.dataset.editm ? null : em.dataset.editm; RENDER.medir(T); }
    if (gm) { const v = T.variables.find(x => x.id === gm.dataset.guardarm), met = panel.querySelector(`[data-mtxt="${v.id}"]`).value.trim() || v.metodo, sub = Math.max(1, +panel.querySelector(`[data-msub="${v.id}"]`).value || 1);
      (v.base ? T.variables.filter(x => x.base === v.base) : [v]).forEach(x => { x.metodo = met; if (!x.entrada) x.sub = sub; });
      if (!v.base) v.momento = panel.querySelector(`[data-mmom="${v.id}"]`).value.trim(); medirAbierto = null; toast('Método guardado'); RENDER.medir(T); }
  };
  panel.onchange = e => { const al = e.target.dataset.alt; if (al) panel.querySelector(`[data-mtxt="${al}"]`).value = e.target.value; if (e.target.id === 'ci-tipo') $('#ci-esc-l').hidden = e.target.value !== 'escala'; };
  const f = $('#f-indic'); if (f) f.onsubmit = e => { e.preventDefault(); const tipo = $('#ci-tipo').value, esc_ = $('#ci-esc').value.split('\n').map(s => s.trim()).filter(Boolean);
    const v = {id: 'p' + Date.now(), nombre: $('#ci-nombre').value.trim(), unidad: $('#ci-unidad').value.trim(), tipo, dec: tipo === 'conteo' || tipo === 'escala' ? 0 : 2, sub: Math.max(1, +$('#ci-sub').value || 1),
      min: tipo === 'escala' ? 1 : +$('#ci-min').value, max: tipo === 'escala' ? esc_.length : +$('#ci-max').value, metodo: $('#ci-met').value.trim(), propio: true, rubro: T.rubro, autor: S.user.id};
    if (tipo === 'escala') { v.escala = esc_; v.unidad = v.unidad || `nota 1–${esc_.length}`; }
    if (!v.nombre || !v.metodo) return; T.variables.push(v); if ($('#ci-guardar').checked) CUSTOM.push(v); toast(`Indicador “${v.nombre}” creado`); RENDER.medir(T); };
};

{ const rm = RENDER.medir; RENDER.medir = T => { rm(T); vozEn(P()); }; }
/* ---------- 5 carga de datos ---------- */
let corteSel = 1;
const filtroCorte = (T, vars) => !T.cortes?.length ? vars : vars.filter(v => corteSel === 'otras' ? !v.corte : corteSel === 'todas' ? true : v.corte === corteSel);
const segCorte = (host, T, cb) => T.cortes?.length && seg(host, [...T.cortes.map(c => [c.n, `Corte ${c.n}`]), ['otras', 'Otras mediciones'], ['todas', 'Todo']], corteSel, v => { corteSel = isNaN(v) ? v : +v; cb(); });
RENDER.datos = T => {
  if (T.cortes?.length && corteSel !== 'otras' && corteSel !== 'todas' && !T.cortes.some(c => c.n === corteSel)) corteSel = 1;
  const C = colTrat(T), vars = filtroCorte(T, vis(T)), op = rolEn(T) === 'operador';
  const orden = [...enSitio(T)].sort((a, b) => (op ? (T.asig[b.parcela] === S.user.id) - (T.asig[a.parcela] === S.user.id) : 0) || a.parcela - b.parcela);
  const cel = (p, v) => { const val = p.valores[v.id], ok = puede.datos(T, p.parcela) && !auto(v);
    if (v.tipo === 'texto') return `<td>${val ? esc(String(val).slice(0, 30)) : '<span class="note">—</span>'}</td>`;
    if (!ok || v.sub > 1 || v.tipo === 'escala' || v.entrada) return `<td class="num">${val == null || val === '' ? `<span class="${ok ? 'chip warn' : 'note'}">${ok ? 'cargar' : '—'}</span>` : fmt(val, v.dec ?? 2)}</td>`;
    return `<td class="num"><input type="number" step="any" data-cel="${p.parcela}|${v.id}" value="${val ?? ''}"></td>`; };
  P().innerHTML = `<section class="panel"><h2>Carga de datos</h2>${aviso(T, 'Podés cargar datos solo en tus parcelas (arriba de la tabla). Las demás están bloqueadas.')}
    <p class="lead">Un renglón por parcela. Las mediciones con submuestras, escala o calculadora se cargan con el botón <b>Controlar</b>, que muestra cómo se mide y hace la cuenta. Cada cambio queda en el historial.</p>${rolEn(T) !== 'lector' ? '<div class="row"><button class="btn" id="btn-importar">⇪ Importar datos (Excel, CSV o foto)</button><span class="note">También sirve para traer los índices del dron calculados en QGIS.</span></div>' : ''}${T.cortes?.length ? '<div class="seg" id="seg-corte-d"></div>' : ''}
    <div class="tw"><table><thead><tr><th></th><th class="num">Parcela</th><th class="num">Bl.</th><th>Trat.</th><th>Asignada</th>${vars.map(v => `<th class="num" title="${esc(v.metodo)}">${esc(v.nombre)}${v.unidad ? `<br><span style="text-transform:none">${esc(v.unidad)}</span>` : ''}${v.origen === 'dron' ? '<br><span class="chip dron">dron</span>' : ''}${v.origen === 'calc' ? '<br><span class="chip neu">calculada</span>' : ''}${v.entrada ? '<br><span class="chip acc">calculadora</span>' : v.sub > 1 ? `<br><span class="chip neu">${v.sub} submuestras</span>` : ''}</th>`).join('')}<th class="num">Notas</th></tr></thead><tbody>
    ${orden.map(p => { const lock = !puede.datos(T, p.parcela), a = asigDe(T, p.parcela), nn = T.notas.filter(n => n.nivel === 'parcela' && n.ref === p.parcela).length;
      return `<tr class="${lock ? 'locked' : ''}"><td><button class="btn small ${lock ? '' : 'primary'}" data-ctl="${p.parcela}">${lock ? 'Ver' : 'Controlar'}</button></td><td class="num">${T.sitios ? `${S.sitio === 'todos' ? `<span class="note">${esc(nomSitio(T, p.sitio))}</span> ` : ''}${p.parcela % 1000}` : p.parcela}</td><td class="num">${p.bloque}</td><td><span class="swatch" style="background:${C[p.trat]}"></span> ${p.trat}</td>
        <td>${a ? `<span class="row" style="gap:5px;flex-wrap:nowrap">${avatar(a)}${esc(a.nombre.split(' ')[0])}</span>` : '<span class="note">—</span>'}</td>${vars.map(v => cel(p, v)).join('')}<td class="num">${nn || ''}</td></tr>`; }).join('')}</tbody></table></div></section>`;
  segCorte('#seg-corte-d', T, () => RENDER.datos(T));
  P().onclick = e => { if (e.target.closest('#btn-importar')) return importarDatos(T); const b = e.target.closest('[data-ctl]'); if (b) abrirDrawer(Number(b.dataset.ctl)); };
  P().onchange = e => { const c = e.target.dataset.cel; if (!c) return; const [pn, vid] = c.split('|'); guardarValor(T, Number(pn), vid, e.target.value === '' ? null : parseFloat(e.target.value)); toast('Guardado · queda en el historial'); };
  P().oninput = null;
};
function guardarValor(T, pn, vid, nuevo, sub) {
  const p = T.parcelas.find(x => x.parcela === pn), antes = p.valores[vid];
  if (sub) p.sub[vid] = sub;
  if (antes === nuevo || (antes == null && nuevo == null)) return false;
  p.valores[vid] = nuevo; (p.ts = p.ts || {})[vid] = new Date().toISOString(); recalc(T);
  const rev = ['dueño', 'gerente'].includes(rolEn(T));
  T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: pn, variable: vid, antes: antes ?? null, despues: nuevo, estado: rev ? 'aprobado' : 'pendiente'});
  return true;
}

/* ---------- 6 equipo y cambios ---------- */
let asigSel = null;
RENDER.equipo = T => {
  const C = colTrat(T), asignar = puede.asignar(T), revisar = puede.revisar(T), yo = S.user.id, op = rolEn(T) === 'operador';
  const ops = operadoresEquipo(T); if (asigSel == null && ops.length) asigSel = ops[0].id;
  const varNom = id => T.variables.find(v => v.id === id)?.nombre || id;
  const cambios = T.cambios.filter(c => !op || c.usuario === yo);
  const grid = T.sitios && S.sitio === 'todos' ? [] : Array.from({length: T.bloques}, (_, i) => enSitio(T).filter(p => p.bloque === i + 1).sort((a, b) => a.parcela - b.parcela));
  const ALC = {'': 'No asignado', ensayo: 'Todo el ensayo', parcelas: 'Solo parcelas asignadas'};
  const enTrabajo = ops.filter(u => T.trabajo?.[u.id]);
  P().innerHTML = `<section class="panel"><h2>Equipo y cambios</h2>
    ${T.sitios ? `<div class="card"><div class="row" style="justify-content:space-between"><h3>Lugares del ensayo</h3><span class="note">${T.sitios.length} lugares · cada operador carga solo su lugar</span></div>${tablaSitios(T)}</div>` : ''}
    ${puede.asignar(T) ? `<div class="card"><h3>${T.sitios ? 'Agregar otro lugar' : 'Repetir este ensayo en otros lugares'}</h3><p class="note" style="margin:0">${T.sitios ? 'Se suma un lugar nuevo con su propio croquis sorteado, los mismos tratamientos y mediciones.' : 'Convierte el ensayo en una red: el mismo diseño en varios lugares del país, cada uno con su croquis y su operador. Lo cargado hasta ahora queda como el primer lugar.'}</p>
      <form class="row" id="f-sitio" style="align-items:end"><label class="f">Nombre corto<input type="text" name="nombre" required placeholder="Ej.: Naranjal"></label><label class="f" style="flex:1">Lugar (distrito, departamento)<input type="text" name="lugar" placeholder="Ej.: Naranjal, Alto Paraná"></label>
        <label class="f">Operador<select name="op"><option value="">Más adelante</option>${operadoresEquipo(T).map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></label><button class="btn primary" type="submit">+ Agregar lugar</button></form></div>` : ''}
    ${asignar ? `<div class="card"><div class="row" style="justify-content:space-between"><h3>${T.sitios ? 'Operadores con acceso a todo el ensayo' : 'Operadores de este trabajo'}</h3><span class="note">${T.sitios ? 'Opcional: en una red cada lugar ya tiene su operador' : `${enTrabajo.length} de ${ops.length} operadores asignados`}</span></div>
      ${ops.length ? `<div class="tw"><table><thead><tr><th>Operador</th><th>Alcance</th><th class="num">Parcelas</th></tr></thead><tbody>${ops.map(u => `<tr><td><span class="row" style="gap:6px;flex-wrap:nowrap">${avatar(u)}${esc(u.nombre)}</span></td>
        <td><select data-alc="${u.id}">${Object.entries(ALC).map(([k, l]) => `<option value="${k}" ${(T.trabajo?.[u.id] || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td class="num">${T.trabajo?.[u.id] === 'ensayo' ? 'todas' : T.parcelas.filter(p => T.asig[p.parcela] === u.id).length}</td></tr>`).join('')}</tbody></table></div>
        <div class="row"><button class="btn small" id="btn-repartir" ${enTrabajo.length ? '' : 'disabled'}>${T.sitios ? 'Repartir los lugares entre los operadores del trabajo' : 'Repartir los bloques entre los operadores del trabajo'}</button><span class="note">“Todo el ensayo”: carga en todas las parcelas. “Solo parcelas asignadas”: únicamente las que le asignes abajo.</span></div>`
        : '<p class="note" style="margin:0">Todavía no hay operadores para sumar.</p>'}</div>` : ''}
    <div class="grid2"><div class="card"><h3>${asignar ? 'Asignar parcelas a operadores' : op ? 'Tus parcelas' : 'Asignaciones'}</h3>
      ${asignar ? (ops.length ? `<div class="row"><span class="note">Operador:</span>${ops.map(u => `<button class="pill" data-op="${u.id}" style="${asigSel === u.id ? 'border-color:var(--accent);background:var(--accent-soft)' : ''}">${avatar(u)}${esc(u.nombre)}</button>`).join('')}<button class="pill" data-op="" style="${asigSel === '' ? 'border-color:var(--accent);background:var(--accent-soft)' : ''}">Quitar asignación</button></div>
        <p class="note" style="margin:0">Tocá parcelas o un bloque entero para asignarlas a ${asigSel ? esc(USERS[asigSel].nombre.split(' ')[0]) : 'nadie'}.</p>`
        : `<p class="note" style="margin:0">${T.equipo ? 'Todavía no hay operadores en el equipo. Compartí el código de invitación.' : 'Trabajás por tu cuenta. Si querés, invitá operadores y asignales parcelas.'}</p>`) : ''}
      ${asignar && !T.equipo ? `<div class="row"><label class="f" style="flex:1">Invitar operador<select id="invitar">${Object.values(USERS).filter(u => u.perfil === 'operador' && !(T.invitados || []).includes(u.id) && (!u.ejemplo || T.ejemplo || S.user.ejemplo)).map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></label><button class="btn small" id="btn-invitar" style="align-self:end">Invitar</button></div>` : ''}
      ${T.sitios && S.sitio === 'todos' ? '<p class="note" style="margin:0">Elegí un lugar arriba para asignar parcelas sueltas, o asigná el lugar completo a un operador en “Lugares del ensayo”.</p>' : ''}
      <div style="display:grid;gap:6px;overflow-x:auto;min-width:0">${grid.map((fila, i) => `<div class="row" style="flex-wrap:nowrap;gap:6px">${asignar && ops.length ? `<button class="btn small" data-bloque="${i + 1}">B${i + 1}</button>` : `<span class="note" style="width:28px">B${i + 1}</span>`}
        ${fila.map(p => { const u = asigDe(T, p.parcela); return `<button class="btn small" data-asp="${p.parcela}" ${asignar && ops.length ? '' : 'disabled style="opacity:1"'} style="min-width:58px;display:grid;gap:2px;${u ? `background:${u.color}22;border-color:${u.color}` : ''}${op && !tieneOp(T, p.parcela, yo) ? ';opacity:.4' : ''}"><span class="code">${p.parcela}</span><span style="font-size:.7rem;color:var(--muted)">${u ? esc(u.nombre.split(' ')[0]) : 'libre'}</span></button>`; }).join('')}</div>`).join('')}</div></div>
    ${cardIntercambio(T)}
    <div class="card"><h3>Personas en este ensayo</h3>
      <div style="display:grid;gap:8px">${[T.owner, ...ops.map(u => u.id), ...Object.keys(T.compartido)].filter((v, i, a) => USERS[v] && a.indexOf(v) === i).map(id => { const u = USERS[id], r = rolEn(T, u), n = T.parcelas.filter(p => T.asig[p.parcela] === id).length;
        return `<div class="row">${avatar(u)}<span style="flex:1">${esc(u.nombre)}<br><span class="note">${r ? ROLNOM[r] : PERFILES[u.perfil] + ' · sin asignar'}${sitiosDeOp(T, id).length ? ' · ' + sitiosDeOp(T, id).map(x => esc(x.nombre)).join(', ') : T.trabajo?.[id] === 'ensayo' ? ' · todo el ensayo' : n ? ` · ${n} parcelas` : ''}</span></span>${id !== S.user.id && puede.asignar(T) ? `<button class="btn small" data-enviar="${id}">📤 Enviar</button>` : ''}</div>`; }).join('')}</div>
      ${asignar && Object.values(USERS).some(u => u.id !== T.owner && !T.compartido[u.id] && u.perfil !== 'operador' && (!u.ejemplo || T.ejemplo || S.user.ejemplo)) ? `<div class="row"><label class="f" style="flex:1">Sumar un observador (ve todo, no modifica)<select id="compartir">${Object.values(USERS).filter(u => u.id !== T.owner && !T.compartido[u.id] && u.perfil !== 'operador' && (!u.ejemplo || T.ejemplo || S.user.ejemplo)).sort((a, b) => (b.perfil === 'observador') - (a.perfil === 'observador')).map(u => `<option value="${u.id}">${esc(u.nombre)} · ${PERFILES[u.perfil]}</option>`).join('')}</select></label><button class="btn small" id="btn-compartir" style="align-self:end">Sumar como observador</button></div>` : ''}
      ${asignar ? `<div class="row"><button class="btn small" id="btn-nuevo-obs">+ Crear un observador nuevo</button><span class="note">Para alguien que no está en este equipo: después le mandás el ensayo con “Enviar”.</span></div>` : ''}
        ${asignar && T.equipo ? `<p class="note" style="margin:0">Código para sumar operadores: <b class="code">${EQUIPOS[T.equipo].codigo}</b></p>` : ''}</div></div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3>Historial de cambios</h3>${revisar ? `<span class="note">${T.cambios.filter(c => c.estado === 'pendiente').length} por revisar</span>` : ''}</div>
      <div class="tw"><table><thead><tr><th>Fecha</th><th>Quién</th><th class="num">Parcela</th><th>Qué</th><th class="num">Antes</th><th class="num">Después</th><th>Estado</th>${revisar ? '<th></th>' : ''}</tr></thead><tbody>
      ${cambios.map((c, i) => { const u = USERS[c.usuario], idx = T.cambios.indexOf(c); return `<tr><td class="num">${c.fecha}</td><td>${u ? `<span class="row" style="gap:5px;flex-wrap:nowrap">${avatar(u)}${esc(u.nombre.split(' ')[0])}</span>` : ''}</td><td class="num">${T.sitios && +c.parcela ? esc(etiq(T, {parcela: +c.parcela, sitio: sitioDe(T, +c.parcela)?.id})) : c.parcela}</td><td>${esc(varNom(c.variable))}</td>
        <td class="num">${c.antes == null ? '—' : typeof c.antes === 'number' ? fmt(c.antes, 2) : esc(c.antes)}</td><td class="num">${c.despues == null ? '—' : typeof c.despues === 'number' ? fmt(c.despues, 2) : esc(c.despues)}</td>
        <td><span class="chip ${c.estado === 'aprobado' ? 'ok' : c.estado === 'observado' ? 'bad' : 'warn'}">${c.estado[0].toUpperCase() + c.estado.slice(1)}</span>${c.comentario ? `<br><span class="note">${esc(c.comentario)}</span>` : ''}</td>
        ${revisar ? `<td>${c.estado === 'pendiente' ? `<div class="row" style="flex-wrap:nowrap;gap:4px"><button class="btn small" data-aprobar="${idx}">Aprobar</button><button class="btn small" data-observar="${idx}">Observar</button></div>` : ''}</td>` : ''}</tr>`; }).join('') || `<tr><td colspan="8" class="note">Sin cambios todavía.</td></tr>`}</tbody></table></div>
      <div id="obs-box" hidden class="row"><input type="text" id="obs-txt" placeholder="Qué hay que revisar (ej.: repetir la lectura del bloque 2)" style="flex:1;min-width:220px"><button class="btn small primary" id="obs-ok">Guardar observación</button></div></div>
    <div class="card"><h3>Notas del ensayo</h3>${listaNotas(T, T.notas)}</div></section>`;
  let obsIdx = null;
  const fs = $('#f-sitio'); if (fs) fs.onsubmit = async e => { e.preventDefault(); const f = new FormData(fs), op = f.get('op');
    const id = await agregarSitio(T, String(f.get('nombre')).trim(), String(f.get('lugar')).trim(), op ? [op] : []); if (op && !T.equipo) T.invitados = [...new Set([...(T.invitados || []), op])];
    S.sitio = 'todos'; toast('Lugar agregado con su croquis sorteado'); $('#e-meta').innerHTML = metaEnsayo(T); irPaso(S.paso); };
  P().onchange = e => { if (cambioSitioOp(e, T)) return RENDER.equipo(T); const id = e.target.dataset.alc; if (!id) return; T.trabajo = T.trabajo || {}; const v = e.target.value;
    if (v) T.trabajo[id] = v; else { delete T.trabajo[id]; Object.keys(T.asig).forEach(k => { if (T.asig[k] === id) delete T.asig[k]; }); }
    if (v === 'ensayo') Object.keys(T.asig).forEach(k => { if (T.asig[k] === id) delete T.asig[k]; });
    T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: `Asignación de ${USERS[id].nombre}`, antes: null, despues: v ? ALC[v] : 'No asignado', estado: 'aprobado'});
    toast(v ? `${USERS[id].nombre}: ${ALC[v].toLowerCase()}` : `${USERS[id].nombre} quitado del trabajo`); RENDER.equipo(T); };
  P().onclick = e => {
    const o = e.target.closest('[data-op]'); if (o) { asigSel = o.dataset.op; RENDER.equipo(T); return; }
    if (clicSitios(e, T)) return;
    const bq = e.target.closest('[data-bloque]'); if (bq) { enSitio(T).filter(p => p.bloque == bq.dataset.bloque).forEach(p => asignarParcela(T, p.parcela)); RENDER.equipo(T); return; }
    const ap = e.target.closest('[data-asp]'); if (ap && asignar) { asignarParcela(T, Number(ap.dataset.asp)); RENDER.equipo(T); return; }
    const a = e.target.closest('[data-aprobar]'); if (a) { T.cambios[+a.dataset.aprobar].estado = 'aprobado'; toast('Cambio aprobado'); RENDER.equipo(T); irPasoNav(); return; }
    const ob = e.target.closest('[data-observar]'); if (ob) { obsIdx = +ob.dataset.observar; $('#obs-box').hidden = false; $('#obs-txt').focus(); return; }
    if (e.target.closest('#obs-ok')) { T.cambios[obsIdx].estado = 'observado'; T.cambios[obsIdx].comentario = $('#obs-txt').value.trim() || 'Revisar'; toast('Observación enviada al operador'); RENDER.equipo(T); irPasoNav(); return; }
    if (e.target.closest('#btn-repartir')) { repartir(T, enTrabajo.map(u => u.id)); toast('Bloques repartidos'); RENDER.equipo(T); return; }
    if (e.target.closest('#btn-invitar')) { const id = $('#invitar').value; if (id) { T.invitados = [...(T.invitados || []), id]; asigSel = id; toast(`${USERS[id].nombre} sumado al trabajo`); RENDER.equipo(T); } return; }
    if (e.target.closest('#btn-compartir')) { const id = $('#compartir').value; if (id) { T.compartido[id] = 'lector'; T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: 'Observador sumado', antes: null, despues: USERS[id].nombre, estado: 'aprobado'}); toast(`${USERS[id].nombre} ahora observa este ensayo`); RENDER.equipo(T); } }
    if (e.target.closest('#btn-recibir-e')) return recibirArchivo();
    if (e.target.closest('#btn-mis-datos')) return enviarPaquete(T, T.owner);
    if (e.target.closest('#btn-enviar-sel')) { const id = $('#enviar-a').value; if (id) enviarPaquete(T, id); return; }
    if (e.target.closest('#btn-nuevo-op')) return nuevoPerfilEnEnsayo(T, 'operador');
    if (e.target.closest('#btn-nuevo-obs')) { const M = modal(`<div class="row" style="justify-content:space-between"><h2>Nuevo observador</h2><button class="btn small" data-cerrar>✕</button></div><p class="note" style="margin:0">Va a poder ver todos los avances de este ensayo, sin modificar nada.</p><form id="f-obs" style="display:grid;gap:10px"><label class="f">Nombre y apellido<input type="text" name="n" required></label><button class="btn primary" type="submit">Crear y sumar</button></form>`, 460);
      M.querySelector('#f-obs').onsubmit = ev => { ev.preventDefault(); const nombre = new FormData(ev.target).get('n').trim(); if (!nombre) return; const id = 'u' + Date.now();
        USERS[id] = {id, nombre, perfil: 'observador', equipo: null, color: '#475569', creado: new Date().toISOString()}; T.compartido[id] = 'lector'; M.cerrar(); toast(`${nombre} observa este ensayo. Mandale el ensayo con “Enviar”.`); RENDER.equipo(T); guardarPronto(); }; }
  };
};
function irPasoNav() { const T = S.T, pc = T.cambios.filter(c => c.estado === 'pendiente').length; const b = $$('#steps button')[PASOS.findIndex(p => p[0] === 'equipo')]; if (b) b.lastElementChild.outerHTML = pc && puede.revisar(T) ? `<span class="chip warn">${pc}</span>` : '<span></span>'; }
function asignarParcela(T, pn) { if (asigSel) { T.asig[pn] = asigSel; T.trabajo = T.trabajo || {}; if (!T.trabajo[asigSel]) T.trabajo[asigSel] = 'parcelas'; } else delete T.asig[pn]; }
function repartir(T, ids) { if (!ids.length) return; if (T.sitios) { T.sitios.forEach((st, i) => st.ops = [ids[i % ids.length]]); ids.forEach(id => { T.trabajo = T.trabajo || {}; }); return; } T.trabajo = T.trabajo || {}; ids.forEach(id => { if (T.trabajo[id] !== 'ensayo') T.trabajo[id] = 'parcelas'; });
  const reparto = ids.filter(id => T.trabajo[id] === 'parcelas'); if (!reparto.length) return;
  for (let b = 1; b <= T.bloques; b++) { const id = reparto[(b - 1) % reparto.length]; T.parcelas.filter(p => p.bloque === b).forEach(p => T.asig[p.parcela] = id); } }
function listaNotas(T, notas) {
  if (!notas.length) return '<p class="note" style="margin:0">Sin notas.</p>';
  const nivelTxt = n => n.nivel === 'parcela' || n.nivel === 'bloque' ? esc(nivelNota(T, n)) : n.nivel === 'tratamiento' ? `Tratamiento ${n.ref} · ${esc(tratNom(T, n.ref))}` : 'Ensayo';
  return notas.map(n => `<div class="nota" style="border-color:${USERS[n.autor]?.color || 'var(--line)'}"><span>${esc(n.texto)}</span><span class="who">${nivelTxt(n)} · ${esc(USERS[n.autor]?.nombre || '')} · ${n.fecha}</span></div>`).join('');
}

/* ---------- 7 análisis ---------- */
let varAnal = null;
RENDER.anal = T => {
  const num = vis(T).filter(v => v.tipo !== 'texto'); if (!num.find(v => v.id === varAnal)) varAnal = num[0]?.id;
  P().innerHTML = `<section class="panel"><h2>Análisis</h2>${T.cortes?.length >= 2 ? graficoCortes(T) : ''}<div class="card row"><label class="f">Variable<select id="var-anal">${num.map(v => `<option value="${v.id}" ${v.id === varAnal ? 'selected' : ''}>${esc(v.nombre)}</option>`).join('')}</select></label><span id="var-est"></span></div><div id="anal-body"></div></section>`;
  $('#var-anal').onchange = e => { varAnal = e.target.value; RENDER.anal(T); };
  hoverCortes(T);
  const v = num.find(x => x.id === varAnal); if (!v) { $('#anal-body').innerHTML = '<div class="card"><p class="note">Agregá mediciones en el paso “Mediciones”.</p></div>'; return; }
  const falta = T.parcelas.filter(p => p.valores[v.id] == null || p.valores[v.id] === '');
  const C = colTrat(T), hip = T.imagen && T.dron && ['rendimiento', 'severidad'].includes(v.id);
  $('#var-est').innerHTML = v.origen === 'dron' ? '<span class="chip dron">Medido del dron</span>' : hip ? '<span class="chip hypo">Dato hipotético</span>' : '';
  if (falta.length) { $('#anal-body').innerHTML = `<div class="callout warn">Faltan ${falta.length} de ${T.parcelas.length} parcelas por cargar (${falta.slice(0, 12).map(p => p.parcela).join(', ')}${falta.length > 12 ? '…' : ''}). El análisis de varianza se calcula cuando todas las parcelas tienen dato.</div>`; return; }
  const R = anovaDBCA(T.parcelas.map(p => ({y: +p.valores[v.id], trat: p.trat, bloque: p.bloque}))), tk = tukey(R.medias, R.cme, R.gle, R.r), ptr = R.tabla[1].p, dec = v.dec ?? 2;
  const orden = Object.keys(tk.letras), test = T.tratamientos.find(t => t.testigo)?.cod || orden[orden.length - 1], sig = p => p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns';
  const vals = orden.map(k => R.medias[k]), lo = Math.min(0, ...vals), hi = Math.max(...vals) * 1.12 || 1, Wv = 520, Hv = 210, m = {l: 48, r: 10, t: 18, b: 28}, bw = (Wv - m.l - m.r) / orden.length;
  const ys = x => m.t + (Hv - m.t - m.b) * (1 - (x - lo) / (hi - lo)), ticks = [0, .25, .5, .75, 1].map(f => lo + (hi - lo) * f);
  const menor = /sev|incid|descarte|hormig|chinch|defol|ewrc|saliv|ninfa|maleza/.test(v.id + v.nombre.toLowerCase());
  const top = menor ? orden[orden.length - 1] : orden[0], iguales = orden.filter(k => k !== top && [...tk.letras[k]].some(c => tk.letras[top].includes(c)));
  const txt = ptr < 0.05 ? `Se detectaron diferencias ${ptr < 0.01 ? 'altamente significativas' : 'significativas'} entre tratamientos (F = ${fmt(R.tabla[1].F, 2)}; p ${ptr < 0.001 ? '< 0,001' : '= ' + fmt(ptr, 3)}). CV ${fmt(R.cv, 1)} % (${interpretarCV(R.cv)}). ${top} (${esc(tratNom(T, top))}) obtuvo el ${menor ? 'menor' : 'mayor'} valor (${fmt(R.medias[top], dec)} ${esc(v.unidad)})${iguales.length ? `, sin diferir de ${iguales.join(', ')}` : ''} según Tukey (α = 0,05).`
    : `No se detectaron diferencias significativas entre tratamientos (F = ${fmt(R.tabla[1].F, 2)}; p = ${fmt(ptr, 3)}). CV ${fmt(R.cv, 1)} %.${v.origen === 'dron' && T.imagen ? ' Esperable en el ejemplo: los tratamientos son hipotéticos y el índice refleja la variación real del lote.' : ''}`;
  $('#anal-body').innerHTML = `<div class="grid2"><div class="card"><h3>Análisis de varianza (DBCA)</h3><div class="tw"><table><thead><tr><th>Fuente</th><th class="num">gl</th><th class="num">SC</th><th class="num">CM</th><th class="num">F</th><th class="num">p</th></tr></thead><tbody>
    ${R.tabla.map(f => `<tr><td>${f.fuente}</td><td class="num">${f.gl}</td><td class="num">${fmt(f.sc, dec + 1)}</td><td class="num">${f.cm != null ? fmt(f.cm, dec + 1) : ''}</td><td class="num">${f.F != null ? fmt(f.F, 2) : ''}</td><td class="num">${f.p != null ? (f.p < 0.0001 ? '< 0,0001' : fmt(f.p, 4)) + ' ' + sig(f.p) : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="note" style="margin:0">Media ${fmt(R.media, dec)} ${esc(v.unidad)} · CV ${fmt(R.cv, 1)} % · HSD ${fmt(tk.hsd, dec)}</p></div>
    <div class="card"><h3>Medias y Tukey (α = 0,05)</h3><div class="bars"><svg viewBox="0 0 ${Wv} ${Hv}" role="img" aria-label="Medias por tratamiento">${ticks.map(t => `<line x1="${m.l}" x2="${Wv - m.r}" y1="${ys(t)}" y2="${ys(t)}" stroke="var(--line)"/><text x="${m.l - 6}" y="${ys(t) + 4}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="JetBrains Mono, monospace">${fmt(t, dec >= 3 ? 2 : Math.abs(hi) >= 100 ? 0 : 1)}</text>`).join('')}
      ${orden.map((k, i) => { const x = m.l + i * bw + bw * .18, w = bw * .64, y = ys(R.medias[k]); return `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(0, ys(lo) - y)}" rx="3" fill="${C[k]}"/><text x="${x + w / 2}" y="${y - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)">${ptr < 0.05 ? tk.letras[k] : ''}</text><text x="${x + w / 2}" y="${Hv - 10}" text-anchor="middle" font-size="11" fill="var(--muted)">${k}</text>`; }).join('')}</svg></div>
    <div class="tw"><table><thead><tr><th>Trat.</th><th>Descripción</th><th class="num">Media</th><th>Tukey</th><th class="num">${menor ? 'Control (Abbott)' : 'vs testigo'}</th></tr></thead><tbody>${orden.map(k => `<tr><td><span class="swatch" style="background:${C[k]}"></span> ${k}</td><td>${esc(tratNom(T, k))}</td><td class="num">${fmt(R.medias[k], dec)}</td><td><b>${ptr < 0.05 ? tk.letras[k] : '—'}</b></td><td class="num">${k === test ? '—' : menor ? fmt((1 - R.medias[k] / (R.medias[test] || 1)) * 100, 1) + ' %' : (R.medias[k] >= R.medias[test] ? '+' : '') + fmt((R.medias[k] - R.medias[test]) / Math.abs(R.medias[test] || 1) * 100, 1) + ' %'}</td></tr>`).join('')}</tbody></table></div></div></div>
    <div class="callout"><b>Lectura automática.</b> ${txt}${menor && ptr < 0.05 ? ` Control respecto del testigo (Abbott): ${orden.filter(k => k !== test).map(k => `${k} ${fmt((1 - R.medias[k] / (R.medias[test] || 1)) * 100, 0)} %`).join(', ')}.` : ''}</div>`;
};

/* producción por corte (pasturas): una línea por tratamiento, mismo color que en el croquis */
function mediasCorte(T) {
  return T.tratamientos.map(t => ({t, m: T.cortes.map(c => { const xs = T.parcelas.filter(p => p.trat === t.cod).map(p => p.valores['ms_c' + c.n]).filter(x => x != null && x !== '');
    return xs.length ? xs.reduce((a, x) => a + +x, 0) / xs.length : null; })}));
}
function graficoCortes(T) {
  const D = mediasCorte(T), C = colTrat(T), n = T.cortes.length, all = D.flatMap(d => d.m).filter(x => x != null); if (!all.length) return '';
  const mx = Math.max(...all), stp = [250, 500, 1000, 2000, 5000].find(x => mx / x <= 6) || 10000, hi = Math.ceil(mx * 1.05 / stp) * stp;
  const W = 860, H = 280, m = {l: 54, r: 18, t: 14, b: 40}, pad = 40, xs = i => m.l + pad + (W - m.l - m.r - 2 * pad) * (n === 1 ? .5 : i / (n - 1)), ys = y => m.t + (H - m.t - m.b) * (1 - y / hi);
  const ticks = Array.from({length: hi / stp + 1}, (_, i) => i * stp);
  const tot = D.map(d => ({d, s: d.m.every(x => x != null) ? d.m.reduce((a, x) => a + x, 0) : null}));
  return `<div class="card" id="g-cortes"><div class="row" style="justify-content:space-between"><h3>Producción de forraje por corte</h3><span class="note">Medias de kg MS/ha · ${n} cortes</span></div>
    <div class="row" style="gap:6px 14px">${D.map(d => `<span class="row" style="gap:5px;font-size:.82rem"><span class="swatch" style="background:${C[d.t.cod]}"></span>${d.t.cod} · ${esc(d.t.nombre.replace(/\s*\(testigo\)/, ''))}</span>`).join('')}</div>
    <div class="gwrap" style="position:relative"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Producción de forraje por corte y tratamiento" style="width:100%;height:auto;display:block">
      ${ticks.map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${ys(t)}" y2="${ys(t)}" stroke="var(--line)"/><text x="${m.l - 6}" y="${ys(t) + 4}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="JetBrains Mono, monospace">${fmt(t, 0)}</text>`).join('')}
      ${T.cortes.map((c, i) => `<text x="${xs(i)}" y="${H - 20}" text-anchor="middle" font-size="11" fill="var(--ink)">Corte ${c.n}</text><text x="${xs(i)}" y="${H - 7}" text-anchor="middle" font-size="10" fill="var(--muted)">${fechaTxt(c.fecha).slice(0, 5)}</text>`).join('')}
      <line class="gx" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>
      ${D.map(d => { const pts = d.m.map((y, i) => y == null ? null : [xs(i), ys(y)]).filter(Boolean);
        return `<polyline points="${pts.map(q => q.join(',')).join(' ')}" fill="none" stroke="${C[d.t.cod]}" stroke-width="2" stroke-linejoin="round"/>${pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="4" fill="${C[d.t.cod]}" stroke="var(--panel)" stroke-width="2"/>`).join('')}`; }).join('')}
      ${T.cortes.map((c, i) => `<rect data-gi="${i}" x="${xs(i) - (W - m.l - m.r - 2 * pad) / Math.max(1, n - 1) / 2}" y="${m.t}" width="${(W - m.l - m.r - 2 * pad) / Math.max(1, n - 1)}" height="${H - m.t - m.b}" fill="transparent"/>`).join('')}
    </svg><div class="gtip" hidden></div></div>
    <div class="tw"><table><thead><tr><th>Trat.</th>${T.cortes.map(c => `<th class="num">Corte ${c.n}<br><span style="text-transform:none">${c.dias} días</span></th>`).join('')}<th class="num">Total</th><th class="num">% en el último corte</th></tr></thead><tbody>
    ${tot.sort((a, b) => (b.s ?? -1) - (a.s ?? -1)).map(({d, s}) => `<tr><td><span class="swatch" style="background:${C[d.t.cod]}"></span> ${d.t.cod}</td>${d.m.map(x => `<td class="num">${fmt(x, 0)}</td>`).join('')}<td class="num"><b>${fmt(s, 0)}</b></td><td class="num">${s ? fmt(d.m[n - 1] / s * 100, 1) + ' %' : '—'}</td></tr>`).join('')}</tbody></table></div>
    <p class="note" style="margin:0">El último corte muestra la producción al final de la temporada: un % mayor indica mejor distribución hacia el otoño. Para comparar tratamientos con su ANAVA elegí la variable de cada corte o la producción acumulada abajo.</p></div>`;
}
function hoverCortes(T) {
  const g = $('#g-cortes'); if (!g) return; const svg = g.querySelector('svg'), tip = g.querySelector('.gtip'), gx = g.querySelector('.gx'), D = mediasCorte(T), C = colTrat(T);
  svg.onmousemove = e => { const r = e.target.closest('[data-gi]'); if (!r) { tip.hidden = true; gx.setAttribute('visibility', 'hidden'); return; } const i = +r.dataset.gi, c = T.cortes[i];
    const x = +r.getAttribute('x') + +r.getAttribute('width') / 2; gx.setAttribute('x1', x); gx.setAttribute('x2', x); gx.setAttribute('visibility', 'visible');
    tip.innerHTML = `<b>Corte ${c.n} · ${fechaTxt(c.fecha)}</b><span class="note">${c.dias} días de rebrote</span>${[...D].sort((a, b) => (b.m[i] ?? 0) - (a.m[i] ?? 0)).map(d => `<span class="row" style="gap:6px;justify-content:space-between"><span><span class="swatch" style="background:${C[d.t.cod]}"></span> ${d.t.cod}</span><b class="code">${fmt(d.m[i], 0)}</b></span>`).join('')}`;
    const box = g.querySelector('.gwrap').getBoundingClientRect(), px = x / svg.viewBox.baseVal.width * box.width; tip.hidden = false;
    tip.style.left = Math.min(box.width - tip.offsetWidth - 4, Math.max(4, px + 12 + (px > box.width * .6 ? -tip.offsetWidth - 24 : 0))) + 'px'; tip.style.top = '8px'; };
  svg.onmouseleave = () => { tip.hidden = true; gx.setAttribute('visibility', 'hidden'); };
}

/* ----- análisis combinado de la red de lugares ----- */
function combinar(T, v) {
  const comp = T.sitios.filter(st => { const ps = T.parcelas.filter(p => p.sitio === st.id); return ps.length && ps.every(p => p.valores[v.id] != null && p.valores[v.id] !== '' && !isNaN(+p.valores[v.id])); });
  if (comp.length < 2) return {ok: false, comp};
  const R = anovaCombinado(T.parcelas.filter(p => comp.some(c => c.id === p.sitio)).map(p => ({y: +p.valores[v.id], trat: p.trat, bloque: p.bloque, sitio: p.sitio})));
  const tk = tukey(R.medias, R.cmLT, R.glLT, R.a * R.r), menor = /sev|incid|descarte|hormig|chinch|defol|ewrc|saliv|ninfa|maleza/.test(v.id + v.nombre.toLowerCase()), dec = v.dec ?? 2;
  const orden = Object.keys(R.medias).sort((x, y) => menor ? R.medias[x] - R.medias[y] : R.medias[y] - R.medias[x]), top = orden[0];
  const iguales = orden.filter(k => k !== top && [...tk.letras[k]].some(c => tk.letras[top].includes(c)));
  let txt = R.pT < 0.05 ? `Considerando los ${comp.length} lugares, hubo diferencias ${R.pT < 0.01 ? 'altamente significativas' : 'significativas'} entre tratamientos (F = ${fmt(R.tabla[2].F, 2)}; p ${R.pT < 0.001 ? '< 0,001' : '= ' + fmt(R.pT, 3)}). ${top} (${tratNom(T, top)}) tuvo el ${menor ? 'menor' : 'mayor'} promedio (${fmt(R.medias[top], dec)} ${v.unidad})${iguales.length ? `, sin diferir de ${iguales.join(', ')}` : ''}.`
    : `Considerando los ${comp.length} lugares, no hubo diferencias significativas entre tratamientos (F = ${fmt(R.tabla[2].F, 2)}; p = ${fmt(R.pT, 3)}).`;
  txt += R.pLT < 0.05 ? ` La interacción tratamiento × lugar fue significativa (p ${R.pLT < 0.001 ? '< 0,001' : '= ' + fmt(R.pLT, 3)}): el orden de los tratamientos cambia según el lugar, conviene mirar cada lugar por separado.` : ` La interacción tratamiento × lugar no fue significativa: los tratamientos se comportaron de forma parecida en todos los lugares.`;
  txt += ` CV ${fmt(R.cv, 1)} %.${R.fmax > 5 ? ` Ojo: la variabilidad entre lugares es muy distinta (Fmax = ${fmt(R.fmax, 1)}, mayor a 5), el análisis combinado debe tomarse con cautela.` : ''}`;
  return {ok: true, comp, R, tk, orden, txt, dec, menor, falta: T.sitios.filter(x => !comp.includes(x))};
}
function analCombinado(T) {
  const num = vis(T).filter(v => v.tipo !== 'texto'); if (!num.find(v => v.id === varAnal)) varAnal = num[0]?.id;
  P().innerHTML = `<section class="panel"><h2>Análisis de la red</h2><p class="lead">Análisis combinado de todos los lugares con datos completos. Para el análisis de un solo lugar, elegilo arriba.</p>
    <div class="card row"><label class="f">Variable<select id="var-anal">${num.map(v => `<option value="${v.id}" ${v.id === varAnal ? 'selected' : ''}>${esc(v.nombre)}</option>`).join('')}</select></label></div><div id="anal-body"></div></section>`;
  $('#var-anal').onchange = e => { varAnal = e.target.value; analCombinado(T); };
  const v = num.find(x => x.id === varAnal); if (!v) return; const a = combinar(T, v), C = colTrat(T), sig = p => p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns';
  if (!a.ok) { $('#anal-body').innerHTML = `<div class="callout warn">Para el análisis combinado hacen falta al menos 2 lugares con todas las parcelas cargadas. ${a.comp.length ? `Completo: ${a.comp.map(x => esc(x.nombre)).join(', ')}.` : 'Ningún lugar está completo todavía.'}</div>${tablaSitios(T)}`; P().onclick = e => clicSitios(e, T); return; }
  const {R, tk, orden, dec} = a;
  $('#anal-body').innerHTML = `${a.falta.length ? `<div class="callout warn">Se analizan ${a.comp.length} de ${T.sitios.length} lugares. Sin datos completos: ${a.falta.map(x => esc(x.nombre)).join(', ')}.</div>` : ''}
    <div class="card"><h3>Análisis de varianza combinado</h3><div class="tw"><table><thead><tr><th>Fuente</th><th class="num">gl</th><th class="num">SC</th><th class="num">CM</th><th class="num">F</th><th class="num">p</th></tr></thead><tbody>
      ${R.tabla.map(f => `<tr><td>${f.fuente}</td><td class="num">${f.gl}</td><td class="num">${fmt(f.sc, dec + 1)}</td><td class="num">${f.cm != null ? fmt(f.cm, dec + 1) : ''}</td><td class="num">${f.F != null ? fmt(f.F, 2) : ''}</td><td class="num">${f.p != null ? (f.p < 0.0001 ? '< 0,0001' : fmt(f.p, 4)) + ' ' + sig(f.p) : ''}</td></tr>`).join('')}</tbody></table></div>
      <p class="note" style="margin:0">Tratamientos probados contra la interacción tratamiento × lugar (lugares al azar). Media ${fmt(R.media, dec)} ${esc(v.unidad || '')} · CV ${fmt(R.cv, 1)} % · Fmax entre lugares ${fmt(R.fmax, 2)}</p></div>
    <div class="card"><h3>Medias por lugar</h3><div class="tw"><table><thead><tr><th>Trat.</th><th>Descripción</th>${a.comp.map(x => `<th class="num">${esc(x.nombre)}</th>`).join('')}<th class="num">Promedio</th><th>Tukey</th></tr></thead><tbody>
      ${orden.map(k => `<tr><td><span class="swatch" style="background:${C[k]}"></span> ${k}</td><td>${esc(tratNom(T, k))}</td>${a.comp.map(x => `<td class="num">${fmt(R.porSitio[x.id]?.[k], dec)}</td>`).join('')}<td class="num"><b>${fmt(R.medias[k], dec)}</b></td><td><b>${R.pT < 0.05 ? tk.letras[k] : '—'}</b></td></tr>`).join('')}
      <tr><td></td><td class="note">Media del lugar</td>${a.comp.map(x => `<td class="num">${fmt(R.mediasSitio[x.id], dec)}</td>`).join('')}<td class="num">${fmt(R.media, dec)}</td><td></td></tr></tbody></table></div></div>
    <div class="callout"><b>Lectura automática.</b> ${a.txt}</div>`;
  P().onclick = null;
}
{ const as = RENDER.anal; RENDER.anal = T0 => { const T = S.T || T0; if (esLal(T)) return analLal(T); if (!T.sitios) return as(T); if (S.sitio && S.sitio !== 'todos') { as(vistaS(T)); const h = P().querySelector('h2'); if (h) h.textContent = `Análisis · ${nomSitio(T, S.sitio)}`; return; } analCombinado(T); }; }

/* ---------- 8 exportar ---------- */
function analizar(T, v) {
  const falta = T.parcelas.filter(p => p.valores[v.id] == null || p.valores[v.id] === '' || isNaN(+p.valores[v.id]));
  if (falta.length) return {ok: false, falta};
  const R = anovaDBCA(T.parcelas.map(p => ({y: +p.valores[v.id], trat: p.trat, bloque: p.bloque})));
  if (!R || !isFinite(R.cme) || R.cme <= 0) return {ok: false, falta: [], sinVar: true};
  const tk = tukey(R.medias, R.cme, R.gle, R.r), ptr = R.tabla[1].p, orden = Object.keys(tk.letras), test = T.tratamientos.find(t => t.testigo)?.cod || orden[orden.length - 1];
  const menor = /sev|incid|descarte|hormig|chinch|defol|ewrc|saliv|ninfa|maleza/.test(v.id + v.nombre.toLowerCase()), dec = v.dec ?? 2;
  const top = menor ? orden[orden.length - 1] : orden[0], iguales = orden.filter(k => k !== top && [...tk.letras[k]].some(c => tk.letras[top].includes(c)));
  const txt = ptr < 0.05 ? `Se detectaron diferencias ${ptr < 0.01 ? 'altamente significativas' : 'significativas'} entre tratamientos (F = ${fmt(R.tabla[1].F, 2)}; p ${ptr < 0.001 ? '< 0,001' : '= ' + fmt(ptr, 3)}). CV ${fmt(R.cv, 1)} % (${interpretarCV(R.cv)}). ${top} (${tratNom(T, top)}) obtuvo el ${menor ? 'menor' : 'mayor'} valor (${fmt(R.medias[top], dec)} ${v.unidad})${iguales.length ? `, sin diferir de ${iguales.join(', ')}` : ''} según Tukey (α = 0,05).`
    : `No se detectaron diferencias significativas entre tratamientos (F = ${fmt(R.tabla[1].F, 2)}; p = ${fmt(ptr, 3)}). CV ${fmt(R.cv, 1)} % (${interpretarCV(R.cv)}).`;
  const vsT = k => k === test ? '—' : menor ? fmt((1 - R.medias[k] / (R.medias[test] || 1)) * 100, 1) + ' %' : (R.medias[k] >= R.medias[test] ? '+' : '') + fmt((R.medias[k] - R.medias[test]) / Math.abs(R.medias[test] || 1) * 100, 1) + ' %';
  return {ok: true, R, tk, ptr, orden, test, menor, txt, vsT, dec};
}
const nivelNota = (T, n) => n.nivel === 'parcela' ? 'Parcela ' + (T.sitios ? etiq(T, {parcela: +n.ref, sitio: sitioDe(T, +n.ref)?.id}) : n.ref) : n.nivel === 'bloque' ? (String(n.ref).includes('|') ? `Bloque ${String(n.ref).split('|')[1]} (${nomSitio(T, String(n.ref).split('|')[0])})` : 'Bloque ' + n.ref) : n.nivel === 'tratamiento' ? 'Tratamiento ' + n.ref : 'Ensayo';
const aQue = a => a.trats === 'todos' ? 'Todo el ensayo' : a.trats.join(', ');
const condTxt = c => c ? `${c.t ?? '—'} °C · HR ${c.hr ?? '—'} % · ${c.viento ?? '—'} km/h` : '';
function valorTxt(v, x) { if (x == null || x === '') return ''; if (v.tipo === 'texto') return String(x); if (v.tipo === 'escala' && v.escala?.[x - 1]) return v.escala[x - 1]; return +x; }
const esRed = T => !!T.sitios && !T.__vista;
const apsDe = T => T.__vista ? T.aplicaciones.filter(a => !a.sitio || a.sitio === 'todos' || a.sitio === T.__vista) : T.aplicaciones;
const notasDe = T => !T.__vista ? T.notas : T.notas.filter(n => n.nivel === 'parcela' ? T.parcelas.some(p => p.parcela == n.ref) : n.nivel === 'bloque' ? String(n.ref).startsWith(T.__vista + '|') : true);
const nomArch = (T, extra = '') => nombreArchivo(`${T.id}_${T.__vista ? nomSitio(T, T.__vista) : T.titulo}${extra}`);
function bloquesRed(T, v, B, C) {
  const a = combinar(T, v), sig = p => p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns';
  if (!a.ok) { B.push({p: `Para el análisis combinado hacen falta al menos 2 lugares con todas las parcelas cargadas${a.comp.length ? ` (completo: ${a.comp.map(x => x.nombre).join(', ')})` : ''}.`}); return null; }
  const {R, tk, orden, dec} = a;
  if (a.falta.length) B.push({nota: `Se analizan ${a.comp.length} de ${T.sitios.length} lugares. Sin datos completos: ${a.falta.map(x => x.nombre).join(', ')}.`});
  B.push({tabla: {cab: ['Fuente', 'gl', 'SC', 'CM', 'F', 'p'], num: [1, 2, 3, 4, 5], anchos: [2600, 600, 1500, 1500, 1000, 1400], filas: R.tabla.map(f => [f.fuente, f.gl, fmt(f.sc, dec + 1), f.cm != null ? fmt(f.cm, dec + 1) : '', f.F != null ? fmt(f.F, 2) : '', f.p != null ? (f.p < 0.0001 ? '< 0,0001' : fmt(f.p, 4)) + ' ' + sig(f.p) : ''])}});
  B.push({nota: `Análisis combinado (lugares al azar; tratamientos probados contra la interacción tratamiento × lugar). Media ${fmt(R.media, dec)} ${v.unidad || ''} · CV ${fmt(R.cv, 1)} % · Fmax entre lugares ${fmt(R.fmax, 2)} · DMS de Tukey ${fmt(tk.hsd, dec)}`});
  return a;
}
function bloqueEquipo(T, B) {
  const conEq = apsDe(T).filter(a => a.equipo || a.hora || a.adyuvante).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (conEq.length) B.push({h2: 'Equipo de aplicación'}, {tabla: {cab: ['Fecha', 'Pulverizadora y boquilla', 'Presión', 'Velocidad', 'Volumen', 'Hora · viento', 'ΔT'], anchos: [1100, 3300, 900, 1000, 1000, 1400, 700], filas: conEq.map(a => [fechaTxt(a.fecha), a.equipo ? `${a.equipo.nombre}${a.equipo.boq ? ' · ' + a.equipo.boq : ''}${a.equipo.picos > 1 ? ` · ${a.equipo.picos} picos a ${a.equipo.sep} cm` : ''}${a.adyuvante ? ' · adyuvante: ' + a.adyuvante : ''}` : (a.adyuvante ? 'Adyuvante: ' + a.adyuvante : '—'), a.equipo?.presion != null ? fmt(a.equipo.presion, 1) + ' bar' : '', a.equipo?.vel != null ? fmt(a.equipo.vel, 1) + ' km/h' : '', a.caldo ? fmt(a.caldo, 0) + ' L/ha' : '', [a.hora, a.vientoDir ? 'del ' + a.vientoDir : ''].filter(Boolean).join(' · '), deltaT(a.cond?.t, a.cond?.hr) != null ? fmt(deltaT(a.cond.t, a.cond.hr), 1) + ' °C' : ''])}});
}
function bloquesCalidad(T, B) {
  const PPw = (T.papeles || []).filter(x => !T.__vista || !x.parcela || T.parcelas.some(p => p.parcela == x.parcela));
  if (PPw.length) { B.push({h2: 'Calidad de aplicación (papel hidrosensible)'}, {p: `Se colocaron tarjetas de papel hidrosensible antes de aplicar y se leyeron con la cámara del celular en la app: la cobertura de cada metro lineal es la superficie manchada sobre el total de papel de ese metro; las manchas de gotas pegadas se cuentan como varias gotas; el diámetro de gota se estima desde la mancha con el factor de expansión del papel (d = 0,95·s^0,91, DepositScan). Gotas chicas: menos de ${CLASES.chica} µm; grandes: ${CLASES.grande} µm o más. ${PPw.length} tarjetas en total.`});
    [...new Set(PPw.map(x => String(x.aplicacion)))].forEach(id => { const a = T.aplicaciones.find(x => String(x.id) === id), R = resumenCalidad(T, PPw.filter(x => String(x.aplicacion) === id));
      B.push({h3: a ? `${fechaTxt(a.fecha)} · ${a.tipo}${a.estadio ? ' · ' + a.estadio : ''}` : 'Aplicación'}, {tabla: {cab: ['Trat.', 'Posición', 'Metros', 'Cobertura (%)', 'Gotas/cm²', 'DMV (µm)', 'Chicas / medianas / grandes (%)', 'Densidad'], num: [2, 3, 4, 5], anchos: [700, 1500, 800, 1100, 1000, 1000, 1900, 1100], filas: R.map(r => [r.tr, r.pos, r.n, fmt(r.cob, 1), fmt(r.dens, 0), fmt(r.dmv, 0), r.pct.map(v => fmt(v, 0)).join(' / '), r.ev[1]])}}); }); }
}
async function bloquesInforme(T) {
  if (esLal(T)) return bloquesLal(T);
  const vars = vis(T).filter(v => v.tipo !== 'texto'), C = colTrat(T), autor = USERS[T.owner]?.nombre || '', pa = T.parcela, B = [];
  B.push({titulo: T.titulo}, {nota: `${T.id} · ${RUBROS[T.rubro].nombre} · ${T.cultivo} · ${T.lugar} · campaña ${T.campana || '—'} · responsable: ${autor} · informe generado el ${new Date().toLocaleDateString('es-PY')}`});
  if (T.ejemplo) B.push({nota: 'Ensayo de ejemplo con datos hipotéticos.'});
  B.push({h1: '1. Objetivo'}, {p: T.objetivo || 'Completar el objetivo en Planificación → Editar datos.'});
  if (T.__vista) B.push({nota: `Informe del lugar ${nomSitio(T, T.__vista)} (${T.sitios.find(x => x.id === T.__vista)?.lugar || ''}), parte de una red de ${T.sitios.length} lugares.`});
  B.push({h1: '2. Materiales y métodos'}, {p: `${esRed(T) ? `Ensayo en red, repetido en ${T.sitios.length} lugares (${T.sitios.map(x => x.nombre + (x.lugar ? ' – ' + x.lugar : '')).join('; ')}). En cada lugar, diseño` : 'Diseño'} en bloques completos al azar con ${T.tratamientos.length} tratamientos y ${T.bloques} repeticiones (${T.parcelas.length} parcelas${esRed(T) ? ' en total' : ''}). Parcela: ${pa.texto || ''} (${fmt(pa.area_m2, 1)} m², útil ${fmt(pa.area_util_m2, 1)} m²). Tipo de ensayo: ${T.tipo}.${esRed(T) ? ' Los lugares se analizaron en conjunto con un ANAVA combinado (lugares al azar, bloques dentro de lugares) y cada lugar por separado.' : ''}${T.cortes?.length ? ` Se realizaron ${T.cortes.length} cortes de evaluación (${T.cortes.map(c => fechaTxt(c.fecha) + ', ' + c.dias + ' días').join('; ')}) después del corte de uniformización del ${fechaTxt(T.uniformizacion)}.` : ''}`});
  B.push({h2: 'Tratamientos'}, {tabla: {cab: ['Trat.', 'Descripción', 'Producto', 'Reg. SENAVE', 'Dosis'], anchos: [800, 2800, 2600, 1200, 1700], filas: T.tratamientos.flatMap(t => (t.productos.length ? t.productos : [null]).map((p, i) => [i ? '' : t.cod, i ? '' : t.nombre + (t.testigo ? ' (testigo)' : ''), p ? p.prod + (p.momento === 'secuencial' ? ' (secuencial)' : '') : '—', p?.reg || '', p ? `${fmt(p.dosis, 2)} ${p.unidad}` : ''])) }});
  B.push({h2: 'Variables y métodos de medición'}, {tabla: {cab: ['Variable', 'Unidad', 'Cómo se midió', 'Momento'], anchos: [2200, 1100, 4400, 1400], filas: vis(T).filter(v => !v.corte || v.corte === 1).map(v => [v.corte ? v.nombre.replace(/ · corte \d+$/, '') + ' (en cada corte)' : v.nombre, v.unidad || '', v.metodo + (v.sub > 1 ? ` (${v.sub} submuestras por parcela)` : ''), v.corte ? 'Cada corte' : v.momento || ''])}});
  (await fotoAereaBloques(T.__vista ? Object.getPrototypeOf(T) : T, T)).forEach(x => B.push(x));
  if (esRed(T)) B.push({h2: 'Lugares'}, {tabla: {cab: ['Lugar', 'Ubicación', 'Operador', 'Parcelas', 'Avance'], num: [3, 4], anchos: [1800, 3000, 2000, 1000, 1000], filas: T.sitios.map(x => { const ps = T.parcelas.filter(p => p.sitio === x.id); return [x.nombre, x.lugar || '', (x.ops || []).map(u => USERS[u]?.nombre || u).join(', '), ps.length, Math.round(avance(T, ps) * 100) + ' %']; })}});
  if (apsDe(T).length) B.push({h2: 'Aplicaciones y labores'}, {tabla: {cab: ['Fecha', ...(esRed(T) ? ['Lugar'] : []), 'Tipo', 'A qué', 'Producto / dosis', 'Momento', 'Condiciones', 'Estado'], anchos: esRed(T) ? [1050, 1000, 1300, 1000, 1750, 1150, 1150, 950] : [1180, 1450, 1150, 1950, 1300, 1300, 1050], filas: [...apsDe(T)].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(a => [fechaTxt(a.fecha), ...(esRed(T) ? [!a.sitio || a.sitio === 'todos' ? 'Todos' : nomSitio(T, a.sitio)] : []), a.tipo, aQue(a), a.producto ? a.producto + (a.dosis ? ' · ' + a.dosis : '') : a.tipo === 'Aplicación de tratamientos' ? `Según tratamiento · caldo ${a.caldo || T.caldo || '—'} L/ha` : '', a.estadio || '', condTxt(a.cond), estadoApl(a)[1]])}});
  bloqueEquipo(T, B);
  B.push({h1: '3. Resultados'});
  bloquesCalidad(T, B);
  if (T.cortes?.length >= 2) { const D = mediasCorte(T);
    B.push({h2: 'Producción de forraje por corte (kg MS/ha)'}, {tabla: {cab: ['Trat.', ...T.cortes.map(c => `Corte ${c.n}`), 'Total'], num: [...T.cortes.map((_, i) => i + 1), T.cortes.length + 1], filas: D.map(d => [d.t.cod, ...d.m.map(x => fmt(x, 0)), fmt(d.m.every(x => x != null) ? d.m.reduce((a, x) => a + x, 0) : null, 0)])}}); }
  for (const v of vars) {
    if (esRed(T)) { B.push({h2: v.nombre + (v.unidad ? ` (${v.unidad})` : '')}); const a = bloquesRed(T, v, B, C);
      if (a) { const {R, tk, orden, dec} = a;
        try { B.push({img: await graficoBarras({titulo: v.nombre + ' · promedio de la red', unidad: v.unidad, barras: orden.map(k => ({etiqueta: k, valor: R.medias[k], color: C[k], letra: R.pT < 0.05 ? tk.letras[k] : ''}))}), ancho: 15, alto: 7}); } catch (e) { console.warn(e); }
        B.push({tabla: {cab: ['Trat.', 'Descripción', ...a.comp.map(x => x.nombre), 'Promedio', 'Tukey'], num: [...a.comp.map((_, i) => i + 2), a.comp.length + 2], filas: [...orden.map(k => [k, tratNom(T, k), ...a.comp.map(x => fmt(R.porSitio[x.id]?.[k], dec)), fmt(R.medias[k], dec), R.pT < 0.05 ? tk.letras[k] : '—']), ['', 'Media del lugar', ...a.comp.map(x => fmt(R.mediasSitio[x.id], dec)), fmt(R.media, dec), '']]}});
        B.push({p: [{t: 'Lectura: ', b: true}, a.txt]}); }
      const fil = T.sitios.map(x => { const r = analizar(vistaS(T, x.id), v); return r.ok ? [x.nombre, fmt(r.R.media, r.dec), fmt(r.R.cv, 1), fmt(r.R.tabla[1].F, 2), (r.ptr < 0.0001 ? '< 0,0001' : fmt(r.ptr, 4)) + (r.ptr < 0.01 ? ' **' : r.ptr < 0.05 ? ' *' : ' ns'), r.orden.map(k => k + (r.ptr < 0.05 ? ' ' + r.tk.letras[k] : '')).join(' · ')] : [x.nombre, r.sinVar ? 'Sin variación' : `Faltan ${r.falta.length} parcelas`, '', '', '', '']; });
      B.push({h3: 'Cada lugar por separado'}, {tabla: {cab: ['Lugar', 'Media', 'CV (%)', 'F trat.', 'p', 'Tratamientos (de mejor a peor, Tukey)'], num: [1, 2, 3], anchos: [1500, 1000, 800, 900, 1200, 3700], filas: fil}});
      continue; }
    const a = analizar(T, v); B.push({h2: v.nombre + (v.unidad ? ` (${v.unidad})` : '')});
    if (!a.ok) { B.push({p: a.sinVar ? 'Sin variación entre parcelas: no se puede calcular el ANAVA.' : `Faltan datos en ${a.falta.length} de ${T.parcelas.length} parcelas; el análisis se hace cuando están todas cargadas.`}); continue; }
    const {R, tk, orden, ptr, dec} = a, sig = p => p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns';
    B.push({tabla: {cab: ['Fuente', 'gl', 'SC', 'CM', 'F', 'p'], num: [1, 2, 3, 4, 5], anchos: [1800, 700, 1700, 1700, 1100, 1500], filas: R.tabla.map(f => [f.fuente, f.gl, fmt(f.sc, dec + 1), f.cm != null ? fmt(f.cm, dec + 1) : '', f.F != null ? fmt(f.F, 2) : '', f.p != null ? (f.p < 0.0001 ? '< 0,0001' : fmt(f.p, 4)) + ' ' + sig(f.p) : ''])}});
    B.push({nota: `Media ${fmt(R.media, dec)} ${v.unidad || ''} · CV ${fmt(R.cv, 1)} % · DMS de Tukey ${fmt(tk.hsd, dec)}`});
    try { B.push({img: await graficoBarras({titulo: v.nombre, unidad: v.unidad, barras: orden.map(k => ({etiqueta: k, valor: R.medias[k], color: C[k], letra: ptr < 0.05 ? tk.letras[k] : ''}))}), ancho: 15, alto: 7}); } catch (e) { console.warn(e); }
    B.push({tabla: {cab: ['Trat.', 'Descripción', 'Media', 'Tukey', a.menor ? 'Control (Abbott)' : 'vs testigo'], num: [2, 4], anchos: [800, 3600, 1500, 1000, 1700], filas: orden.map(k => [k, tratNom(T, k), fmt(R.medias[k], dec), ptr < 0.05 ? tk.letras[k] : '—', a.vsT(k)])}});
    B.push({p: [{t: 'Lectura: ', b: true}, a.txt]});
  }
  if (notasDe(T).length) B.push({h1: 'Anexo 1 · Notas de campo'}, {tabla: {cab: ['Nivel', 'Nota', 'Autor', 'Fecha'], anchos: [1500, 5200, 1400, 1000], filas: notasDe(T).map(n => [nivelNota(T, n), n.texto, USERS[n.autor]?.nombre || '', n.fecha])}});
  const grupos = []; for (let i = 0; i < vars.length; i += 6) grupos.push(vars.slice(i, i + 6));
  grupos.forEach((g, gi) => B.push(gi ? {p: ''} : {h1: 'Anexo 2 · Datos por parcela'}, {tabla: {cab: [...(T.sitios ? ['Lugar'] : []), 'Parcela', 'Bloque', 'Trat.', ...g.map(v => v.nombre + (v.unidad ? ` (${v.unidad})` : ''))], num: T.sitios ? [1, 2, ...g.map((_, i) => i + 4)] : [0, 1, ...g.map((_, i) => i + 3)], filas: T.parcelas.map(p => [...(T.sitios ? [nomSitio(T, p.sitio)] : []), T.sitios ? p.parcela % 1000 : p.parcela, p.bloque, p.trat, ...g.map(v => p.valores[v.id] == null || p.valores[v.id] === '' ? '' : fmt(p.valores[v.id], v.dec ?? 2))])}}));
  return B;
}
async function exportarWord(T) { const B = await bloquesInforme(T); descargar(nomArch(T) + '.docx', await crearDocx(B, {titulo: T.titulo, autor: USERS[T.owner]?.nombre || ''})); }
async function imprimirInforme(T) {
  const w = window.open('', '_blank'); if (!w) return toast('El navegador bloqueó la ventana: permití ventanas emergentes para imprimir');
  w.document.write('<p style="font-family:sans-serif;padding:20px">Preparando el informe…</p>');
  const B = await bloquesInforme(T), h = s => esc(s), r = c => (Array.isArray(c) ? c : [c]).map(p => typeof p === 'string' ? h(p) : p.b ? `<b>${h(p.t)}</b>` : p.i ? `<i>${h(p.t)}</i>` : h(p.t)).join('');
  let body = ''; for (const b of B) {
    if (b.titulo) body += `<h1 class="t">${h(b.titulo)}</h1>`; else if (b.h1) body += `<h2>${h(b.h1)}</h2>`; else if (b.h2) body += `<h3>${h(b.h2)}</h3>`; else if (b.h3) body += `<h4>${h(b.h3)}</h4>`;
    else if (b.p != null) body += `<p>${r(b.p)}</p>`; else if (b.nota) body += `<p class="n">${h(b.nota)}</p>`;
    else if (b.tabla) body += `<table><thead><tr>${b.tabla.cab.map(c => `<th>${h(c)}</th>`).join('')}</tr></thead><tbody>${b.tabla.filas.map(f => `<tr>${f.map((c, i) => `<td${b.tabla.num?.includes(i) ? ' class="num"' : ''}>${h(c ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    else if (b.img) body += `<img src="${await blobAData(new Blob([b.img], {type: b.jpg ? 'image/jpeg' : 'image/png'}))}" alt="">`;
  }
  w.document.open(); w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${h(T.titulo)}</title><style>
    body{font:11pt/1.45 Calibri,Arial,sans-serif;color:#18221c;max-width:180mm;margin:12mm auto;padding:0 6mm} h1.t{color:#1f6b52;font-size:20pt;margin:0 0 4px} h2{color:#1f6b52;font-size:14pt;margin:18px 0 6px;break-after:avoid} h3{font-size:12pt;margin:14px 0 6px;break-after:avoid}
    p{margin:4px 0 8px} .n{color:#5d6b62;font-size:9pt;font-style:italic} table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:9.5pt;break-inside:auto} th{background:#e3ede6;text-align:left} th,td{border:1px solid #b8c4bc;padding:3px 6px} td.num{text-align:right;font-variant-numeric:tabular-nums} tr{break-inside:avoid}
    img{display:block;max-width:150mm;margin:6px auto} .bar{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #ddd;margin-bottom:10px} @media print{.bar{display:none}}</style></head>
    <body><div class="bar"><button onclick="print()" style="font:inherit;padding:6px 14px">Imprimir o guardar como PDF</button></div>${body}</body></html>`); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 600);
}
async function exportarExcel(T) {
  const vars = vis(T), C = v => v.nombre + (v.unidad ? ` (${v.unidad})` : '');
  const hojas = [
    {nombre: 'Ensayo', filas: [['Campo', 'Valor'], ['Código', T.id], ['Título', T.titulo], ['Rubro', RUBROS[T.rubro].nombre], ['Tipo', T.tipo], ['Cultivo', T.cultivo], ['Lugar', T.__vista ? `${nomSitio(T, T.__vista)} (${T.sitios.find(x => x.id === T.__vista)?.lugar || ''}) · red de ${T.sitios.length} lugares` : T.lugar], ['Campaña', T.campana || ''], ['Responsable', USERS[T.owner]?.nombre || ''], ['Objetivo', T.objetivo || ''], ['Diseño', `DBCA · ${T.tratamientos.length} tratamientos × ${T.bloques} bloques`], ['Parcela', T.parcela.texto || ''], ['Área parcela (m²)', T.parcela.area_m2], ['Área útil (m²)', T.parcela.area_util_m2], ['Exportado', new Date().toLocaleString('es-PY')]]},
    {nombre: 'Tratamientos', filas: [['Trat.', 'Descripción', 'Testigo', 'Producto', 'Reg. SENAVE', 'Principio activo', 'Dosis', 'Unidad', 'Momento'], ...T.tratamientos.flatMap(t => (t.productos.length ? t.productos : [{}]).map(p => [t.cod, t.nombre, t.testigo ? 'sí' : '', p.prod || '', p.reg || '', p.pa || '', p.dosis ?? '', p.unidad || '', p.momento || '']))]},
    ...(esRed(T) ? [{nombre: 'Lugares', filas: [['Código', 'Lugar', 'Ubicación', 'Operador', 'Parcelas', 'Avance (%)', 'Latitud', 'Longitud'], ...T.sitios.map(x => { const ps = T.parcelas.filter(p => p.sitio === x.id); return [x.id, x.nombre, x.lugar || '', (x.ops || []).map(u => USERS[u]?.nombre || u).join(', '), ps.length, Math.round(avance(T, ps) * 100), x.geo?.lat ?? '', x.geo?.lon ?? '']; })]}] : []),
    {nombre: 'Datos', filas: [[...(T.sitios ? ['Lugar'] : []), 'Parcela', 'Bloque', 'Trat.', 'Tratamiento', 'Asignada a', ...vars.map(C)], ...T.parcelas.map(p => [...(T.sitios ? [nomSitio(T, p.sitio)] : []), p.parcela, p.bloque, p.trat, tratNom(T, p.trat), USERS[T.asig[p.parcela]]?.nombre || USERS[sitioDe(T, p.parcela)?.ops?.[0]]?.nombre || '', ...vars.map(v => valorTxt(v, p.valores[v.id]))])]},
    {nombre: 'Submuestras', filas: [['Parcela', 'Variable', 'Lectura', 'Valor'], ...T.parcelas.flatMap(p => Object.entries(p.sub || {}).flatMap(([vid, sb]) => { const v = T.variables.find(x => x.id === vid); const n = v ? v.nombre : vid;
      if (Array.isArray(sb)) return sb.map((y, i) => [p.parcela, n, i + 1, y ?? '']);
      return Object.entries(sb || {}).flatMap(([k, y]) => Array.isArray(y) ? y.map((z, i) => [p.parcela, n, `${k} ${i + 1}`, z ?? '']) : [[p.parcela, n, k, y ?? '']]); }))]},
    {nombre: 'Métodos', filas: [['Variable', 'Código', 'Unidad', 'Tipo', 'Submuestras', 'Momento', 'Método', 'Fuente'], ...vars.map(v => [v.nombre, v.id, v.unidad || '', v.tipo, v.sub || 1, v.momento || '', v.metodo || '', refTxt(v.ref)])]},
    {nombre: 'Aplicaciones', filas: [['Fecha', ...(T.sitios ? ['Lugar'] : []), 'Estado', 'Tipo', 'A qué', 'Producto', 'Dosis', 'Momento', 'Caldo (L/ha)', 'T (°C)', 'HR (%)', 'Viento (km/h)', 'Responsable', 'Observaciones', 'Hora', 'Dirección del viento', 'ΔT (°C)', 'Pulverizadora', 'Boquilla', 'Picos', 'Presión (bar)', 'Velocidad (km/h)', 'Caudal por pico (L/min)', 'Volumen calibrado (L/ha)', 'Adyuvante', 'pH del agua'], ...[...apsDe(T)].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(a => [fechaTxt(a.fecha), ...(T.sitios ? [!a.sitio || a.sitio === 'todos' ? 'Todos' : nomSitio(T, a.sitio)] : []), estadoApl(a)[1], a.tipo, aQue(a), a.producto || '', a.dosis || '', a.estadio || '', a.caldo ?? '', a.cond?.t ?? '', a.cond?.hr ?? '', a.cond?.viento ?? '', USERS[a.resp]?.nombre || '', a.obs || '', a.hora || '', a.vientoDir || '', deltaT(a.cond?.t, a.cond?.hr) != null ? +deltaT(a.cond.t, a.cond.hr).toFixed(1) : '', a.equipo?.nombre || '', a.equipo?.boq || '', a.equipo?.picos ?? '', a.equipo?.presion ?? '', a.equipo?.vel ?? '', a.equipo?.q ?? '', a.equipo?.vol ?? '', a.adyuvante || '', a.ph ?? ''])]},
    {nombre: 'Notas', filas: [['Nivel', 'Referencia', 'Nota', 'Autor', 'Fecha'], ...notasDe(T).map(n => [nivelNota(T, n), n.ref, n.texto, USERS[n.autor]?.nombre || '', n.fecha])]},
    {nombre: 'Historial', filas: [['Fecha', 'Usuario', 'Parcela', 'Qué', 'Antes', 'Después', 'Estado', 'Comentario'], ...T.cambios.filter(c => !T.__vista || c.parcela === '—' || T.parcelas.some(p => p.parcela == c.parcela)).map(c => [c.fecha, USERS[c.usuario]?.nombre || c.usuario, T.sitios && +c.parcela ? etiq(T, {parcela: +c.parcela, sitio: sitioDe(T, +c.parcela)?.id}) : c.parcela, T.variables.find(v => v.id === c.variable)?.nombre || c.variable, c.antes ?? '', c.despues ?? '', c.estado, c.comentario || ''])]}];
  const res = [['Variable', 'Trat.', 'Descripción', 'Media', 'Tukey', 'vs testigo / control', 'F', 'p', 'CV (%)', 'Media general']];
  if (esRed(T)) { res[0] = ['Variable', 'Trat.', 'Descripción', ...T.sitios.map(x => x.nombre), 'Promedio', 'Tukey', 'F trat.', 'p trat.', 'p trat × lugar', 'CV (%)', 'Media general'];
    vars.filter(v => v.tipo !== 'texto').forEach(v => { const a = combinar(T, v); if (!a.ok) return res.push([v.nombre, '', 'Faltan lugares completos']);
      a.orden.forEach((k, i) => res.push([v.nombre, k, tratNom(T, k), ...T.sitios.map(x => a.R.porSitio[x.id]?.[k] != null ? +a.R.porSitio[x.id][k].toFixed(4) : ''), +a.R.medias[k].toFixed(4), a.R.pT < 0.05 ? a.tk.letras[k] : '', i ? '' : +a.R.tabla[2].F.toFixed(3), i ? '' : +a.R.pT.toFixed(5), i ? '' : +a.R.pLT.toFixed(5), i ? '' : +a.R.cv.toFixed(2), i ? '' : +a.R.media.toFixed(4)])); });
  } else vars.filter(v => v.tipo !== 'texto').forEach(v => { const a = analizar(T, v); if (!a.ok) return res.push([v.nombre, '', a.sinVar ? 'Sin variación' : `Faltan ${a.falta.length} parcelas`]);
    a.orden.forEach((k, i) => res.push([v.nombre, k, tratNom(T, k), +a.R.medias[k].toFixed(4), a.ptr < 0.05 ? a.tk.letras[k] : '', a.vsT(k), i ? '' : +a.R.tabla[1].F.toFixed(3), i ? '' : +a.ptr.toFixed(5), i ? '' : +a.R.cv.toFixed(2), i ? '' : +a.R.media.toFixed(4)])); });
  if (esLal(T)) { const {A, B, C} = ladosLal(T); res.length = 0;
    res.push(['Medición', 'Unidad', `${A.cod} · ${A.nombre}`, `${B.cod} · ${B.nombre}`, ...(C ? [`${C.cod} · testigo`] : []), `Diferencia ${A.cod} − ${B.cod}`, 'Diferencia (%)', 'Resultado', 'Prueba', 'p', ...(C ? [`Eficacia ${A.cod} (%)`, `Eficacia ${B.cod} (%)`] : []), 'Umbral (kg/ha)', 'Margen (USD/ha)', 'Lectura']);
    vars.filter(v => v.tipo !== 'texto').forEach(v => { const R = compLal(T, v), r = x => x == null ? '' : +(+x).toFixed(4);
      res.push([v.nombre, v.unidad || '', r(R.a?.media), r(R.b?.media), ...(C ? [r(R.c?.media)] : []), r(R.dif), r(R.pct), R.ok ? (R.igual ? 'Igual' : R.mejorA ? 'Mejor ' + A.cod : 'Mejor ' + B.cod) : 'Faltan datos', R.prueba ? (R.prueba.tipo === 'pareada' ? 't pareada' : 'Welch (puntos, orientativo)') : '', r(R.prueba?.p), ...(C ? [r(R.efA), r(R.efB)] : []), r(R.umbral), r(R.margen), R.txt || '']); });
    if (T.parcelas.some(p => p.geo)) hojas.push({nombre: 'Franjas', filas: [['Franja', 'Lado', 'Producto', 'Superficie (m²)', 'Lat 1', 'Lon 1', 'Lat 2', 'Lon 2', 'Lat 3', 'Lon 3', 'Lat 4', 'Lon 4'], ...[...T.parcelas].sort((a, b) => a.parcela - b.parcela).map(p => [etiq(T, p), p.trat, prodTxt(ladoDe(T, p.trat)), p.geo ? Math.round(areaM2(p.geo)) : '', ...(p.geo ? p.geo.slice(0, 4).flatMap(([lo, la]) => [+la.toFixed(7), +lo.toFixed(7)]) : [])])]}); }
  hojas.push({nombre: esLal(T) ? 'Comparación' : 'Resultados', filas: res});
  const usadas = PULV.filter(q => apsDe(T).some(a => a.equipo?.id === q.id));
  if (usadas.length) hojas.push({nombre: 'Pulverizadoras', filas: [['Nombre', 'Tipo', 'Marca o modelo', 'Tanque (L)', 'Picos', 'Separación (cm)', 'Altura de barra (cm)', 'Ancho de trabajo (m)', 'Boquilla', 'Tamaño ISO', 'Presión (bar)', 'Velocidad (km/h)', 'Caudal por pico (L/min)', 'CV entre picos (%)', 'Volumen (L/ha)', 'Fecha de calibración', 'Caudales medidos (L/min)', 'Observaciones'],
    ...usadas.map(q => { const c = calcPulv(q); return [q.nombre, q.tipo, q.marca || '', q.tanque ?? '', c.picos, q.sep ?? '', q.altura ?? '', c.ancho != null ? +c.ancho.toFixed(2) : '', boqTxt(q), q.boqISO || '', q.presion ?? '', q.vel ?? '', c.q != null ? +c.q.toFixed(3) : '', c.cv != null ? +c.cv.toFixed(1) : '', c.vol != null ? Math.round(c.vol) : '', fechaTxt(q.fechaCal), (q.caudales || []).join('; '), q.obs || '']; })]});
  const PP = (T.papeles || []).filter(x => !T.__vista || !x.parcela || T.parcelas.some(p => p.parcela == x.parcela));
  if (PP.length) { const apN = id => { const a = T.aplicaciones.find(x => String(x.id) === String(id)); return a ? `${fechaTxt(a.fecha)} · ${a.tipo}` : id; };
    hojas.push({nombre: 'Papel hidrosensible', filas: [['Aplicación', 'Parcela', 'Trat.', 'Posición', 'Metro lineal', 'Tarjeta', 'Cobertura (%)', 'Gotas contadas', 'Área leída (cm²)', 'Densidad (gotas/cm²)', 'DMV Dv0,5 (µm)', 'Dv0,1 (µm)', 'Dv0,9 (µm)', 'DMN (µm)', 'Amplitud relativa', 'Clase (ASABE, orientativa)', 'Chicas', 'Medianas', 'Grandes', '% chicas', '% medianas', '% grandes', 'Gotas separadas (estaban pegadas)', 'Volumen estimado (L/ha)', 'Resolución (µm/píxel)', 'Fecha', 'Leyó', 'Observaciones'],
      ...PP.map(x => { const t = x.st, r = v => v == null ? '' : +(+v).toFixed(2); return [apN(x.aplicacion), x.parcela ?? 'General', tratDeParcela(T, x.parcela) || '', x.posicion, x.metro, x.tarjeta || '', r(t.cob), t.n, r(t.areaCm2), r(t.dens), r(t.dmv), r(t.dv01), r(t.dv09), r(t.dmn), r(t.span), claseASABE(t.dmv), ...t.clases, ...t.pct.map(r), t.separadas || 0, r(t.litrosHa), r(t.umPx), fechaTxt(x.fecha), USERS[x.autor]?.nombre || '', x.obs || '']; })]});
    const filasM = []; [...new Set(PP.map(x => String(x.aplicacion)))].forEach(id => gruposMetro(PP.filter(x => String(x.aplicacion) === id)).forEach(g => { const t = g.st; filasM.push([apN(id), g.parcela ?? 'General', tratDeParcela(T, g.parcela) || '', g.posicion, g.metro, g.tarjetas.length, +t.cob.toFixed(2), t.n, +t.dens.toFixed(1), t.dmv != null ? Math.round(t.dmv) : '', ...t.pct.map(v => +v.toFixed(1)), evDens(t.dens, g.objetivo)[1]]); }));
    hojas.push({nombre: 'Calidad por metro', filas: [['Aplicación', 'Parcela', 'Trat.', 'Posición', 'Metro lineal', 'Tarjetas', 'Cobertura del metro (%)', 'Gotas', 'Densidad (gotas/cm²)', 'DMV (µm)', '% chicas', '% medianas', '% grandes', 'Densidad respecto de lo recomendado'], ...filasM]}); }
  if (T.cortes?.length) hojas.push({nombre: 'Cortes', filas: [['Corte', 'Fecha', 'Días de rebrote'], ['Uniformización', fechaTxt(T.uniformizacion), ''], ...T.cortes.map(c => [c.n, fechaTxt(c.fecha), c.dias])]});
  descargar(nomArch(T) + '.xlsx', await crearXlsx(hojas));
}
function exportarCsv(T, coma) {
  const vars = vis(T);
  descargar(nombreArchivo(`${T.id}${T.__vista ? '_' + nomSitio(T, T.__vista) : ''}_datos`) + (coma ? '_excel' : '') + '.csv', crearCsv([[...(T.sitios ? ['lugar'] : []), 'parcela', 'bloque', 'trat', ...vars.map(v => v.id)], ...T.parcelas.map(p => [...(T.sitios ? [nomSitio(T, p.sitio)] : []), p.parcela, p.bloque, p.trat, ...vars.map(v => { const x = p.valores[v.id]; return x == null || x === '' ? '' : v.tipo === 'texto' ? x : +x; })])], {coma}), 'text/csv;charset=utf-8');
}
function geometriaParcelas(T) {
  if (T.sitios) { const G = {}; T.parcelas.forEach(p => { if (p.geo) G[p.parcela] = p.geo; });
    T.sitios.forEach(x => { if (x.geo?.lat != null && x.geo?.lon != null) Object.assign(G, poligonosCroquis(T.parcelas.filter(p => p.sitio === x.id && !p.geo), x.geo)); });
    return Object.keys(G).length ? G : null; }
  if (T.parcelas.every(p => p.geo)) return Object.fromEntries(T.parcelas.map(p => [p.parcela, p.geo]));
  if (T.geo?.lat != null && T.geo?.lon != null) return poligonosCroquis(T.parcelas, T.geo); return null;
}
async function exportarQgis(T) {
  const G = geometriaParcelas(T); if (!G) return toast('Primero cargá la ubicación del ensayo (esquina de la parcela 101)');
  const vars = vis(T), Cc = colTrat(T), base = nombreArchivo(T.id + (T.__vista ? '_' + nomSitio(T, T.__vista) : ''));
  const sinUb = T.sitios ? T.sitios.filter(x => !T.parcelas.some(p => p.sitio === x.id && G[p.parcela])) : [];
  const feats = T.parcelas.filter(p => G[p.parcela]).map(p => { const props = {...(T.sitios ? {lugar: nomSitio(T, p.sitio)} : {}), parcela: p.parcela, bloque: p.bloque, trat: p.trat, tratamiento: tratNom(T, p.trat), asignado: USERS[T.asig[p.parcela]]?.nombre || USERS[sitioDe(T, p.parcela)?.ops?.[0]]?.nombre || '', ensayo: T.id};
    vars.forEach(v => { const x = p.valores[v.id]; props[v.id] = x == null || x === '' ? null : v.tipo === 'texto' ? String(x) : +x; });
    const ns = T.notas.filter(n => (n.nivel === 'parcela' && n.ref == p.parcela) || (n.nivel === 'bloque' && n.ref == refBloque(T, p)) || (n.nivel === 'tratamiento' && n.ref === p.trat));
    props.n_notas = ns.length; props.notas = ns.map(n => `${nivelNota(T, n)}: ${n.texto}`).join(' | ');
    return {type: 'Feature', properties: props, geometry: {type: 'Polygon', coordinates: [G[p.parcela]]}}; });
  const leeme = `Ensayo ${T.id} · ${T.titulo}\r\nExportado ${new Date().toLocaleString('es-PY')} desde Ensayos de Campo.\r\n\r\nCómo abrirlo en QGIS: arrastrá ${base}_parcelas.geojson a QGIS. El estilo (colores por tratamiento y etiquetas) se carga solo porque el archivo .qml tiene el mismo nombre.\r\nCRS: WGS 84 (EPSG:4326).\r\n\r\n${T.sitios ? `Ensayo en red: ${T.sitios.map(x => x.nombre).join(', ')}. ${sinUb.length ? `Sin ubicación cargada (no figuran en el mapa): ${sinUb.map(x => x.nombre).join(', ')}.` : 'Todos los lugares tienen ubicación.'}\r\n\r\n` : ''}Campos: ${T.sitios ? 'lugar, ' : ''}parcela, bloque, trat, tratamiento, asignado, ${vars.map(v => `${v.id} = ${v.nombre}${v.unidad ? ' (' + v.unidad + ')' : ''}`).join('; ')}; n_notas y notas.\r\n\r\nPara sumar valores del dron: con el ortomosaico abierto, usá Procesos → Estadísticas de zona sobre esta capa, exportá la tabla a CSV (columnas parcela y el índice) e importala en la app (Carga de datos → Importar).\r\n${T.geo && !T.parcelas.every(p => p.geo) ? `\r\nUbicación calculada desde la esquina ${T.geo.lat}, ${T.geo.lon}, rumbo ${T.geo.rumbo}°, parcelas de ${T.geo.ancho} × ${T.geo.largo} m.` : ''}`;
  const zip = await crearZip([{nombre: `${base}_parcelas.geojson`, datos: crearGeojson(`${T.id}_parcelas`, feats)}, {nombre: `${base}_parcelas.qml`, datos: crearQml('trat', T.tratamientos.map(t => ({valor: t.cod, etiqueta: `${t.cod} · ${t.nombre}`, color: Cc[t.cod]})))},
    {nombre: `${base}_aplicaciones.csv`, datos: crearCsv([['fecha', 'estado', 'tipo', 'a_que', 'producto', 'dosis', 'momento', 't', 'hr', 'viento', 'obs'], ...apsDe(T).map(a => [a.fecha, a.estado, a.tipo, aQue(a), a.producto || '', a.dosis || '', a.estadio || '', a.cond?.t ?? '', a.cond?.hr ?? '', a.cond?.viento ?? '', a.obs || ''])])},
    {nombre: `${base}_notas.csv`, datos: crearCsv([['nivel', 'referencia', 'nota', 'autor', 'fecha'], ...notasDe(T).map(n => [n.nivel, n.ref, n.texto, USERS[n.autor]?.nombre || '', n.fecha])])}, {nombre: 'LEEME.txt', datos: leeme}]);
  descargar(`${base}_QGIS.zip`, zip);
}
function exportarKml(T) {
  const G = geometriaParcelas(T); if (!G) return toast('Primero cargá la ubicación del ensayo'); const Cc = colTrat(T), vars = vis(T).filter(v => v.tipo !== 'texto');
  descargar(nombreArchivo(T.id + (T.__vista ? '_' + nomSitio(T, T.__vista) : '')) + '.kml', crearKml(T.titulo, T.parcelas.filter(p => G[p.parcela]).map(p => ({nombre: `${etiq(T, p)} · ${p.trat}`, color: Cc[p.trat], anillo: G[p.parcela],
    desc: `<b>${esc(tratNom(T, p.trat))}</b><br>Bloque ${p.bloque}<br>${vars.map(v => `${esc(v.nombre)}: ${p.valores[v.id] == null || p.valores[v.id] === '' ? '—' : fmt(p.valores[v.id], v.dec ?? 2)} ${esc(v.unidad || '')}`).join('<br>')}`}))), 'application/vnd.google-earth.kml+xml');
}
async function exportarEnsayo(T) {
  await guardarAhora(); const ids = new Set([T.owner, ...Object.values(T.asig), ...Object.keys(T.trabajo || {}), ...Object.keys(T.compartido || {})]);
  const imgs = await DB.imagenesDe(T.id).catch(() => []), imagenes = await Promise.all(imgs.map(async i => ({...i, blob: undefined, data: await blobAData(i.blob)})));
  const perfiles = Object.fromEntries([...ids].filter(id => USERS[id]).map(id => [id, USERS[id]])), equipos = T.equipo && EQUIPOS[T.equipo] ? {[T.equipo]: EQUIPOS[T.equipo]} : {};
  descargar(nombreArchivo(`${T.id}_${T.titulo}`) + '.json', JSON.stringify({app: 'Ensayos de Campo', version: 2, fecha: new Date().toISOString(), ensayos: [T], config: {perfiles, equipos, custom: [], pulv: PULV}, imagenes}), 'application/json');
}
RENDER.exp = T0 => {
  const T = vistaS(T0), red = !!T0.sitios, sg = red ? (T0.sitios.find(x => x.id === (T.__vista || S.geoSitio)) || T0.sitios[0]) : null; if (red) S.geoSitio = sg.id;
  const conGeo = red ? T0.sitios.every(x => x.geo?.lat != null) : T.parcelas.every(p => p.geo), g = (red ? sg.geo : T.geo) || {}, pa = T.parcela, ed = puede.diseno(T0), hayGeo = esLal(T0) ? T.parcelas.some(p => p.geo) : red ? T0.sitios.some(x => x.geo?.lat != null) : conGeo || g.lat != null;
  const anchoDef = g.ancho ?? (pa.hileras ? +(pa.hileras * pa.dist).toFixed(2) : pa.ancho || (pa.columnas ? pa.columnas * pa.e2 : '')), largoDef = g.largo ?? (pa.largo || (pa.filas ? pa.filas * pa.e1 : ''));
  const listo = vis(T).filter(v => v.tipo !== 'texto').filter(v => (esLal(T) ? compLal(T, v) : esRed(T) ? combinar(T, v) : analizar(T, v)).ok).length;
  const card = (id, t, d, btns) => `<div class="card" id="${id}"><h3>${t}</h3><p class="note" style="margin:0">${d}</p><div class="row">${btns}</div></div>`;
  P().innerHTML = `<section class="panel"><h2>Informe y exportar${T.__vista ? ' · ' + esc(nomSitio(T0, T.__vista)) : ''}</h2><p class="lead">Los archivos se generan en este equipo, sin internet, y se guardan en la carpeta de descargas. ${listo} ${listo === 1 ? 'medición' : 'mediciones'} con todos los datos para analizar${esRed(T) ? ' en al menos 2 lugares' : ''}.</p>
    ${red ? `<div class="callout">${T.__vista ? `Estás exportando solo <b>${esc(nomSitio(T0, T.__vista))}</b>. Para el informe de toda la red (análisis combinado y cada lugar), elegí <b>Todos</b> arriba.` : `Estás exportando <b>toda la red</b> (${T0.sitios.length} lugares): el Word trae el análisis combinado y cada lugar por separado; Excel, CSV y QGIS llevan la columna <b>Lugar</b>. Para un solo lugar, elegilo arriba.`}</div>` : ''}
    <div class="grid2">
    ${card('ex-word', 'Informe en Word', 'Objetivo, materiales y métodos, tratamientos con productos y dosis, cómo se midió cada variable, aplicaciones con condiciones, y por cada variable: ANAVA, gráfico, medias con Tukey y la lectura. Al final, notas y datos por parcela.', '<button class="btn primary" data-x="word">Descargar Word (.docx)</button><button class="btn" data-x="print">Imprimir o guardar PDF</button>')}
    ${card('ex-excel', 'Planilla Excel', 'Hojas: Ensayo, Tratamientos, Datos (una fila por parcela), Submuestras, Métodos, Aplicaciones, Notas, Historial y Resultados.', '<button class="btn primary" data-x="excel">Descargar Excel (.xlsx)</button>')}
    ${card('ex-csv', 'CSV para InfoStat o R', 'Una fila por parcela con parcela, bloque, tratamiento y cada medición (códigos cortos de columna).', '<button class="btn" data-x="csv">CSV (punto decimal)</button><button class="btn" data-x="csv-coma">CSV para Excel (coma decimal)</button>')}
    <div class="card" id="ex-qgis"><h3>QGIS y Google Earth</h3><p class="note" style="margin:0">Parcelas como polígonos con todos sus datos y notas; en QGIS se abre con colores por tratamiento y etiquetas.</p>
      ${esLal(T0) ? `<p class="note" style="margin:0">${T.parcelas.every(p => p.geo) ? 'Las franjas ya están ubicadas con el GPS.' : 'Ubicá las franjas con el GPS en “Ubicación y franjas”.'}</p>` : conGeo && !red ? '<p class="note" style="margin:0">Este ensayo ya tiene las parcelas ubicadas.</p>' : !(ed || (red && sg.ops?.includes(S.user.id))) ? `<p class="note" style="margin:0">${red ? T0.sitios.map(x => `${esc(x.nombre)}: ${x.geo?.lat != null ? 'ubicado' : 'sin ubicar'}`).join(' · ') : g.lat != null ? 'Ubicación cargada.' : 'Todavía no se cargó la ubicación del ensayo (la carga el responsable).'}</p>` : `<form id="f-geo" style="display:grid;gap:8px"><b style="font-size:.9rem">Ubicación ${red ? 'de cada lugar' : 'del ensayo'}</b>
        ${red ? `<label class="f">Lugar<select name="sitio" ${T.__vista ? 'disabled' : ''}>${T0.sitios.map(x => `<option value="${x.id}" ${x.id === sg.id ? 'selected' : ''}>${esc(x.nombre)}${x.geo?.lat != null ? ' ✓' : ' (sin ubicar)'}</option>`).join('')}</select></label>` : ''}
        <div class="grid3"><label class="f">Latitud esquina parcela 101${red ? ' del lugar' : ''}<input type="number" step="any" name="lat" value="${g.lat ?? ''}" placeholder="-27.1234"></label><label class="f">Longitud<input type="number" step="any" name="lon" value="${g.lon ?? ''}" placeholder="-55.5678"></label>
        <label class="f">Rumbo de los bloques (°)<input type="number" step="any" name="rumbo" value="${g.rumbo ?? 90}" title="Dirección en la que avanza el bloque 1 (de la 101 a la 102), en grados desde el norte"></label>
        <label class="f">Ancho de parcela (m)<input type="number" step="any" name="ancho" value="${anchoDef}"></label><label class="f">Largo de parcela (m)<input type="number" step="any" name="largo" value="${largoDef}"></label>
        <label class="f">Calle entre bloques (m)<input type="number" step="any" name="calle" value="${g.calle ?? 1}"></label></div>
        <div class="row">${ed || (red && sg.ops?.includes(S.user.id)) ? '<button class="btn small" type="button" id="btn-gps">📍 Usar mi ubicación</button><button class="btn small primary" type="submit">Guardar ubicación</button>' : ''}<span class="note" id="geo-msg">${g.lat != null ? 'Ubicación guardada.' : 'Parado en la esquina de la parcela 101, tocá “Usar mi ubicación”. El rumbo es hacia dónde avanza el bloque 1 (90° = hacia el este).'}</span></div></form>`}
      <div class="row"><button class="btn primary" data-x="qgis" ${hayGeo ? '' : 'disabled'}>Descargar para QGIS (.zip)</button><button class="btn" data-x="kml" ${hayGeo ? '' : 'disabled'}>Google Earth (.kml)</button></div></div>
    ${card('ex-json', 'Pasar el ensayo a otro equipo', 'Archivo con el ensayo completo (datos, notas, fotos y perfiles que participan). En el otro equipo se abre desde el indicador “Guardado” → Restaurar un respaldo.', '<button class="btn" data-x="json">Descargar ensayo (.json)</button>')}
    </div></section>`;
  P().onclick = async e => { const b = e.target.closest('[data-x]'); if (b) { const k = b.dataset.x, t0 = b.textContent; b.disabled = true; b.textContent = 'Generando…';
      try { if (k === 'word') await exportarWord(T); if (k === 'print') await imprimirInforme(T); if (k === 'excel') await exportarExcel(T); if (k === 'csv') exportarCsv(T, false); if (k === 'csv-coma') exportarCsv(T, true);
        if (k === 'qgis') await exportarQgis(T); if (k === 'kml') exportarKml(T); if (k === 'json') await exportarEnsayo(T0); if (k !== 'print') toast('Archivo descargado'); }
      catch (x) { console.error(x); toast('No se pudo generar el archivo: ' + x.message); } b.disabled = false; b.textContent = t0; return; }
    if (e.target.closest('#btn-gps')) { if (!navigator.geolocation) return toast('Este equipo no tiene GPS disponible'); $('#geo-msg').textContent = 'Buscando ubicación…';
      navigator.geolocation.getCurrentPosition(pos => { const f = $('#f-geo'); f.lat.value = pos.coords.latitude.toFixed(7); f.lon.value = pos.coords.longitude.toFixed(7); $('#geo-msg').textContent = `Precisión ±${Math.round(pos.coords.accuracy)} m. Tocá “Guardar ubicación”.`; },
        er => { $('#geo-msg').textContent = er.code === 1 ? 'Permiso de ubicación denegado.' : 'No se pudo obtener la ubicación (probá al aire libre).'; }, {enableHighAccuracy: true, timeout: 20000}); } };
  const fg = $('#f-geo'); if (fg?.sitio) fg.sitio.onchange = () => { S.geoSitio = fg.sitio.value; RENDER.exp(T0); };
  if (fg) fg.onsubmit = e => { e.preventDefault(); const n = k => fg[k].value === '' ? null : +fg[k].value;
    if (n('lat') == null || n('lon') == null || !n('ancho') || !n('largo')) { $('#geo-msg').textContent = 'Completá latitud, longitud, ancho y largo.'; return; }
    const geo = {lat: n('lat'), lon: n('lon'), rumbo: n('rumbo') ?? 90, ancho: n('ancho'), largo: n('largo'), calle: n('calle') ?? 0, sepP: 0}; if (red) sg.geo = geo; else T0.geo = geo;
    T0.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: red ? `Ubicación de ${sg.nombre}` : 'Ubicación del ensayo', antes: null, despues: `${geo.lat}, ${geo.lon}`, estado: 'aprobado'}); toast('Ubicación guardada'); RENDER.exp(T0); };
};

/* ================= importar: datos (Excel, CSV o foto) y productos de tratamientos ================= */
function modal(html, ancho = 980) {
  const f = document.createElement('div'); f.className = 'modal-fondo'; f.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="width:min(${ancho}px,100%)">${html}</div>`;
  document.body.append(f); const k = e => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } }; document.addEventListener('keydown', k, true);
  const cerrar = () => { f.remove(); document.removeEventListener('keydown', k, true); }; f.addEventListener('click', e => { if (e.target === f || e.target.closest('[data-cerrar]')) cerrar(); }); f.cerrar = cerrar; return f;
}
const normT = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const numero = t => { if (t == null) return null; if (typeof t === 'number') return t; const s = String(t).trim().replace(/\s/g, ''); if (!s) return null; const n = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return isNaN(n) ? null : n; };
async function leerOcr(file, prog) { const {reconocerTexto, mensajeProgreso} = await import('./lib/ocr.js'); return reconocerTexto(file, {onProgreso: m => prog(mensajeProgreso(m))}); }
async function leerPlanilla(file) { const {leerFilasDeArchivo} = await import('./lib/xlsxImport.js'); return leerFilasDeArchivo(file); }
function importarDatos(T) {
  const vars = vis(T).filter(v => v.origen !== 'calc'), M = modal(`<div class="row" style="justify-content:space-between"><h2>Importar datos</h2><button class="btn small" data-cerrar>✕ Cerrar</button></div>
    <p class="note" style="margin:0">Desde una planilla Excel o CSV (una fila por parcela, con una columna “parcela”), o desde una <b>foto</b> de la planilla de campo (un renglón por parcela: número de parcela y después los valores). Antes de guardar se revisa todo.</p>
    <div class="row"><label class="btn primary" style="position:relative">📄 Excel o CSV<input type="file" accept=".xlsx,.xls,.csv,.txt" data-imp="archivo" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
      <label class="btn" style="position:relative">📷 Foto de la planilla<input type="file" accept="image/*" capture="environment" data-imp="foto" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label><span class="note" id="imp-msg"></span></div><div id="imp-cuerpo" style="display:grid;gap:10px"></div>`);
  let tabla = null;
  const autoVar = h => { const n = normT(h); if (!n) return ''; const v = vars.find(v => normT(v.id) === n || normT(v.nombre) === n) || vars.find(v => n.length >= 4 && (normT(v.nombre).startsWith(n) || n.startsWith(normT(v.nombre)))) || vars.find(v => n.length >= 3 && normT(v.nombre).includes(n))
    || vars.find(v => { const w = n.split(' ').filter(x => x.length >= 3), nv = normT(v.nombre); return w.length && w.every(x => nv.split(' ').some(y => y.startsWith(x))); }); return v ? v.id : ''; };
  function pintar() {
    const {cols, filas} = tabla, map = tabla.map;
    M.querySelector('#imp-cuerpo').innerHTML = `<div class="callout">${filas.length} parcelas reconocidas${tabla.descartadas ? ` · ${tabla.descartadas} renglones sin número de parcela válido se ignoraron` : ''}. Elegí a qué medición va cada columna y corregí lo que haga falta (en naranja: vacío, no numérico o fuera de rango).</div>
      <div class="tw" style="max-height:52vh;overflow:auto"><table class="imp-tabla"><thead><tr><th class="num">Parcela</th>${cols.map((c, i) => `<th><span style="text-transform:none;font-weight:400">${esc(c)}</span><br><select data-map="${i}"><option value="">No importar</option>${vars.map(v => `<option value="${v.id}" ${map[i] === v.id ? 'selected' : ''}>${esc(v.nombre)}</option>`).join('')}</select></th>`).join('')}</tr></thead>
      <tbody>${filas.map((f, r) => `<tr><td class="num"><b>${f.parcela}</b>${puede.datos(T, f.parcela) ? '' : ' <span class="chip neu" title="No tenés permiso de cargar en esta parcela">bloqueada</span>'}</td>${f.celdas.map((c, i) => { const v = vars.find(x => x.id === map[i]), n = numero(c), mal = map[i] && (n == null ? c !== '' && c != null : (v.min != null && n < v.min) || (v.max != null && n > v.max));
        return `<td class="${mal ? 'mal' : ''}"><input type="text" inputmode="decimal" data-cel="${r}|${i}" value="${esc(c ?? '')}" ${map[i] ? '' : 'style="opacity:.5"'}></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="row"><button class="btn primary" data-imp-ok>Guardar los valores</button><span class="note">Los valores reemplazan a los que ya estaban y quedan en el historial.</span></div>`;
  }
  M.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.map != null) { tabla.map[+t.dataset.map] = t.value; return pintar(); }
    if (t.dataset.cel) { const [r, i] = t.dataset.cel.split('|').map(Number); tabla.filas[r].celdas[i] = t.value; return; }
    if (!t.dataset.imp || !t.files[0]) return; const file = t.files[0], msg = M.querySelector('#imp-msg'); M.querySelector('#imp-cuerpo').innerHTML = '';
    try {
      if (t.dataset.imp === 'archivo') { msg.textContent = 'Leyendo el archivo…'; const F = (await leerPlanilla(file)).map(f => f.map(c => c == null ? '' : String(c).trim()));
        let hi = F.findIndex((f, i) => i < 15 && f.some(c => /^(parcela|parc|plot|n parcela|nro parcela|unidad)$/i.test(normT(c)))), pc;
        if (hi < 0) { hi = F.findIndex(f => f.length > 1 && isNaN(numero(f[0]) ?? NaN)); pc = 0; } else pc = F[hi].findIndex(c => /^(parcela|parc|plot|n parcela|nro parcela|unidad)$/i.test(normT(c)));
        const cab = hi >= 0 ? F[hi] : F[0].map((_, i) => `Columna ${i + 1}`), ign = cab.map((c, i) => i === pc || /^(bloque|bl|rep|repeticion|trat|tratamiento|descripcion|asignada a|asignado|tratamiento nombre)$/.test(normT(c)));
        const idx = cab.map((_, i) => i).filter(i => !ign[i]), rows = F.slice(hi + 1), filas = []; let descartadas = 0;
        rows.forEach(f => { const pn = Math.round(numero(f[pc]) ?? NaN); if (!T.parcelas.some(p => p.parcela === pn)) { if (f.some(c => c !== '')) descartadas++; return; } filas.push({parcela: pn, celdas: idx.map(i => f[i] ?? '')}); });
        tabla = {cols: idx.map(i => cab[i] || `Columna ${i + 1}`), filas, descartadas, map: idx.map(i => autoVar(cab[i]))};
      } else {
        const {lineas} = await leerOcr(file, m => msg.textContent = m), filas = []; let descartadas = 0, maxn = 0;
        lineas.forEach(l => { const nums = (l.match(/-?\d+(?:[.,]\d+)?/g) || []); const pn = parseInt(nums[0]); if (!T.parcelas.some(p => p.parcela === pn)) { descartadas++; return; } const vals = nums.slice(1); maxn = Math.max(maxn, vals.length); filas.push({parcela: pn, celdas: vals}); });
        filas.forEach(f => { while (f.celdas.length < maxn) f.celdas.push(''); });
        const sugeridas = filtroCorte(T, vars).filter(v => v.tipo !== 'texto');
        tabla = {cols: Array.from({length: maxn}, (_, i) => `Columna ${i + 1}`), filas, descartadas, map: Array.from({length: maxn}, (_, i) => sugeridas[i]?.id || '')};
      }
      msg.textContent = `${file.name} leído.`; if (!tabla.filas.length) { M.querySelector('#imp-cuerpo').innerHTML = `<div class="callout warn">No se encontraron parcelas de este ensayo en el archivo. ${t.dataset.imp === 'foto' ? 'Probá con una foto más derecha y con buena luz, un renglón por parcela empezando por su número.' : 'Revisá que haya una columna llamada “parcela” con los números de parcela (101, 102…).'}</div>`; return; }
      pintar();
    } catch (x) { console.error(x); msg.textContent = 'No se pudo leer: ' + x.message; }
    t.value = '';
  });
  M.addEventListener('click', e => { if (!e.target.closest('[data-imp-ok]')) return; let n = 0, bloq = 0, mal = 0;
    tabla.filas.forEach(f => f.celdas.forEach((c, i) => { const vid = tabla.map[i]; if (!vid || c === '' || c == null) return; const v = vars.find(x => x.id === vid), val = v.tipo === 'texto' ? String(c) : numero(c);
      if (val == null) { mal++; return; } if (!puede.datos(T, f.parcela)) { bloq++; return; } if (guardarValor(T, f.parcela, vid, val)) n++; }));
    M.cerrar(); toast(`${n} valores importados${bloq ? ` · ${bloq} en parcelas bloqueadas` : ''}${mal ? ` · ${mal} no numéricos` : ''}`); refrescar(); guardarPronto(); });
}
async function importarTratamientos(T) {
  const M = modal(`<div class="row" style="justify-content:space-between"><h2>Leer productos de una foto o Excel</h2><button class="btn small" data-cerrar>✕ Cerrar</button></div>
    <p class="note" style="margin:0">Sirve para la planilla de tratamientos: un renglón por tratamiento (ej. “T2 Azoxistrobina 20% 300 cc”), o una tabla Excel con columnas de producto y dosis. Las aplicaciones marcadas “SEC” o “secuencial” se separan solas. Se revisa antes de guardar.</p>
    <div class="row"><label class="btn primary" style="position:relative">📷 Foto<input type="file" accept="image/*" capture="environment" data-imp="foto" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
      <label class="btn" style="position:relative">📄 Excel o CSV<input type="file" accept=".xlsx,.xls,.csv,.txt" data-imp="archivo" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label><span class="note" id="imp-msg"></span></div><div id="imp-cuerpo" style="display:grid;gap:10px"></div>`, 900);
  let filas = [];
  const UNI = {cc: 'cc/ha', ml: 'mL/ha', g: 'g/ha', gr: 'g/ha', kg: 'kg/ha', l: 'L/ha', lt: 'L/ha', lts: 'L/ha'};
  function pintar() {
    M.querySelector('#imp-cuerpo').innerHTML = `<div class="tw" style="max-height:52vh;overflow:auto"><table class="imp-tabla"><thead><tr><th>Tratamiento</th><th>Producto</th><th>Dosis</th><th>Unidad</th><th>Momento</th><th>Identificado como</th><th></th></tr></thead><tbody>
      ${filas.map((f, i) => { const r = buscarEnCatalogo(f.prod); return `<tr><td><select data-f="${i}|trat">${T.tratamientos.map(t => `<option value="${t.cod}" ${t.cod === f.trat ? 'selected' : ''}>${t.cod} · ${esc(t.nombre).slice(0, 26)}</option>`).join('')}</select></td>
        <td><input type="text" data-f="${i}|prod" value="${esc(f.prod)}" style="min-width:190px"></td><td class="${numero(f.dosis) == null ? 'mal' : ''}"><input type="text" inputmode="decimal" data-f="${i}|dosis" value="${esc(f.dosis)}" style="width:80px"></td>
        <td><select data-f="${i}|unidad">${UNIDADES.map(u => `<option ${u === f.unidad ? 'selected' : ''}>${u}</option>`).join('')}</select></td><td><select data-f="${i}|momento"><option value="principal">Principal</option><option value="secuencial" ${f.momento === 'secuencial' ? 'selected' : ''}>Secuencial</option></select></td>
        <td class="note">${r ? `SENAVE: ${esc(r[catIdx.prod])} (reg. ${r[catIdx.reg]})` : f.pa ? 'Principio activo: ' + esc(f.pa) : '—'}</td><td><button class="btn small" data-quita="${i}">✕</button></td></tr>`; }).join('')}</tbody></table></div>
      <div class="row"><button class="btn primary" data-ok>Agregar ${filas.length} producto${filas.length === 1 ? '' : 's'} a los tratamientos</button></div>`;
  }
  M.addEventListener('change', async e => { const t = e.target;
    if (t.dataset.f) { const [i, k] = t.dataset.f.split('|'); filas[+i][k] = t.value; if (k === 'prod' || k === 'dosis') pintar(); return; }
    if (!t.dataset.imp || !t.files[0]) return; const file = t.files[0], msg = M.querySelector('#imp-msg');
    try {
      const TI = await import('./lib/tablaImport.js'), TM = await import('./lib/textMatch.js'); let base;
      if (t.dataset.imp === 'foto') { const {lineas} = await leerOcr(file, m => msg.textContent = m); base = TI.filasDesdeLineasOCR(lineas); }
      else { msg.textContent = 'Leyendo…'; base = TI.filasDesdeHojaExcel(await leerPlanilla(file)); }
      const grupos = TI.agruparEnTratamientos(base); filas = [];
      grupos.forEach((g, gi) => { const lab = (g.filas[0]?.labelDetectado || '').toUpperCase(), destino = T.tratamientos.find(x => x.cod.toUpperCase() === lab) || T.tratamientos.filter(x => !x.testigo)[gi] || T.tratamientos[gi] || T.tratamientos[0];
        const fs = []; g.filas.filter(f => f.ingredienteTexto?.trim()).forEach(f => { if (/^(cc|ml|g|gr|grs|kg|l|lt|lts)\.?$/i.test(f.ingredienteTexto.trim()) && fs.length && !f.dosis) { fs[fs.length - 1].unidad = f.ingredienteTexto.trim(); return; } fs.push({...f}); });
        fs.forEach(f => { const ia = TM.buscarIngredienteActivo(f.ingredienteTexto), u = UNI[String(f.unidad || '').toLowerCase().replace('.', '')];
          filas.push({trat: destino.cod, prod: f.ingredienteTexto.trim(), dosis: String(f.dosis || '').replace(/\s/g, ''), unidad: u || (numero(f.dosis) >= 20 ? 'cc/ha' : 'L/ha'), momento: f.secuencial ? 'secuencial' : 'principal', pa: ia ? ia.nombre : ''}); }); });
      msg.textContent = filas.length ? `${file.name}: ${filas.length} productos en ${grupos.length} tratamientos.` : 'No se reconocieron productos. Probá con otra foto o revisá el archivo.'; if (filas.length) pintar();
    } catch (x) { console.error(x); msg.textContent = 'No se pudo leer: ' + x.message; } t.value = ''; });
  M.addEventListener('click', e => { const q = e.target.closest('[data-quita]'); if (q) { filas.splice(+q.dataset.quita, 1); return pintar(); }
    if (!e.target.closest('[data-ok]')) return;
    filas.filter(f => f.prod.trim()).forEach(f => { const t = T.tratamientos.find(x => x.cod === f.trat), r = buscarEnCatalogo(f.prod);
      t.productos.push({reg: r ? Number(r[catIdx.reg]) : null, prod: r ? r[catIdx.prod] : f.prod.trim(), pa: r ? r[catIdx.pa] : f.pa, dosis: numero(f.dosis) ?? 0, unidad: f.unidad, momento: f.momento}); });
    T.cambios.unshift({fecha: ahora(), usuario: S.user.id, parcela: '—', variable: 'Productos importados', antes: null, despues: `${filas.length} productos`, estado: 'aprobado'});
    M.cerrar(); toast('Productos agregados: revisá las dosis'); RENDER.trat(T); guardarPronto(); });
}

/* ================= enviar y recibir entre equipos (por archivo) ================= */
const nuevoIdAp = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
function cardIntercambio(T) {
  const r = rolEn(T), gestion = puede.asignar(T), dueno = USERS[T.owner];
  const destinos = [...new Set([...(T.sitios || []).flatMap(x => x.ops || []), ...Object.keys(T.trabajo || {}), ...Object.values(T.asig), ...Object.keys(T.compartido || {})])].filter(id => USERS[id] && id !== S.user.id);
  return `<div class="card" id="card-intercambio"><h3>Enviar y recibir</h3><p class="note" style="margin:0">Cada persona usa la app en su celular, aunque esté en otro punto del país. ${gestion ? 'Mandale el ensayo a cada operador u observador (por WhatsApp o correo); el operador te devuelve sus datos de la misma forma y la app los suma sin pisar lo tuyo.' : r === 'operador' ? `Cuando termines de cargar, mandale tus datos a ${esc(dueno?.nombre || 'el responsable')}. Si te mandan una versión nueva del ensayo, recibila acá.` : 'Cuando te manden una versión nueva del ensayo, recibila acá para ver los últimos avances.'}</p>
    <div class="row">${gestion && destinos.length ? `<label class="f" style="grid-auto-flow:column;align-items:center">Enviar a <select id="enviar-a">${destinos.map(id => `<option value="${id}">${esc(USERS[id].nombre)} · ${ROLNOM[rolEn(T, USERS[id])] || PERFILES[USERS[id].perfil]}</option>`).join('')}</select></label><button class="btn primary small" id="btn-enviar-sel">📤 Enviar ensayo</button>` : ''}
      ${r === 'operador' ? `<button class="btn primary" id="btn-mis-datos">📤 Enviar mis datos a ${esc(dueno?.nombre.split(' ')[0] || 'el responsable')}</button>` : ''}
      <button class="btn" id="btn-recibir-e">📥 Recibir archivo</button>
      ${gestion ? `<button class="btn small" id="btn-nuevo-op">+ Operador nuevo</button>` : ''}</div></div>`;
}
function nuevoPerfilEnEnsayo(T, perfil) {
  const M = modal(`<div class="row" style="justify-content:space-between"><h2>Nuevo ${perfil}</h2><button class="btn small" data-cerrar>✕</button></div><p class="note" style="margin:0">Para alguien que trabaja en otro lugar con su propio celular. Después le mandás el ensayo con “Enviar” y entra directo con este perfil.</p>
    <form id="f-np" style="display:grid;gap:10px"><label class="f">Nombre y apellido<input type="text" name="n" required></label>${T.sitios ? `<label class="f">Lugar a cargo<select name="s"><option value="">Ninguno por ahora</option>${T.sitios.map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('')}</select></label>` : ''}<button class="btn primary" type="submit">Crear</button></form>`, 460);
  M.querySelector('#f-np').onsubmit = ev => { ev.preventDefault(); const f = new FormData(ev.target), nombre = String(f.get('n')).trim(); if (!nombre) return; const id = 'u' + Date.now();
    USERS[id] = {id, nombre, perfil, equipo: T.equipo || null, color: PALETA[(Object.keys(USERS).length + 3) % PALETA.length], creado: new Date().toISOString()};
    if (!T.equipo) T.invitados = [...new Set([...(T.invitados || []), id])];
    const sid = f.get('s'); if (sid) { const st = T.sitios.find(x => x.id === sid); st.ops = [id]; } else { T.trabajo = T.trabajo || {}; T.trabajo[id] = 'parcelas'; }
    M.cerrar(); toast(`${nombre} sumado. Ahora mandale el ensayo con “Enviar”.`); RENDER.equipo(T); guardarPronto(); };
}
async function enviarPaquete(T, uid) {
  await guardarAhora(); const u = USERS[uid], yo = S.user, deOp = rolEn(T) === 'operador';
  const ids = new Set([T.owner, uid, yo.id, ...Object.values(T.asig), ...Object.keys(T.trabajo || {}), ...Object.keys(T.compartido || {}), ...(T.sitios || []).flatMap(x => x.ops || [])]);
  const perfiles = Object.fromEntries([...ids].filter(id => USERS[id]).map(id => [id, USERS[id]])), equipos = T.equipo && EQUIPOS[T.equipo] ? {[T.equipo]: EQUIPOS[T.equipo]} : {};
  let imagenes = [];
  { const mias = (await DB.imagenesDe(T.id).catch(() => [])).filter(i => deOp ? i.autor === yo.id : i.tipo === 'papel' || i.tipo === 'aerea'); imagenes = await Promise.all(mias.map(async i => ({...i, blob: undefined, data: await blobAData(i.blob)}))); }
  const js = {app: 'Ensayos de Campo', version: 2, tipo: 'paquete', de: yo.id, para: uid, fecha: new Date().toISOString(), ensayos: [T], config: {perfiles, equipos, custom: [], pulv: PULV}, imagenes};
  const nombre = `${nombreArchivo(T.id)}_${deOp ? 'datos_de_' + nombreArchivo(yo.nombre.split(' ')[0]) : 'para_' + nombreArchivo(u?.nombre.split(' ')[0] || 'equipo')}.json`;
  const archivo = new File([JSON.stringify(js)], nombre, {type: 'application/json'});
  const texto = deOp ? `Datos de ${yo.nombre} del ensayo "${T.titulo}". Abrí Ensayos de Campo → 📥 Recibir archivo y elegí este archivo.` : `${u?.nombre.split(' ')[0] || ''}, te paso el ensayo "${T.titulo}". Abrí la app Ensayos de Campo (${LINK_APP}) → 📥 Recibir archivo y elegí este archivo.`;
  T.cambios.unshift({fecha: ahora(), usuario: yo.id, parcela: '—', variable: deOp ? 'Datos enviados' : 'Ensayo enviado', antes: null, despues: u?.nombre || '', estado: 'aprobado'});
  if (navigator.canShare?.({files: [archivo]})) { try { await navigator.share({files: [archivo], title: T.titulo, text: texto}); toast('Listo: archivo compartido'); return; } catch (e) { if (e.name === 'AbortError') return; } }
  descargar(nombre, archivo); toast('Archivo descargado: mandalo por WhatsApp o correo (está en Descargas)');
  const M = modal(`<div class="row" style="justify-content:space-between"><h2>Mandar el archivo</h2><button class="btn small" data-cerrar>✕</button></div>
    <p style="margin:0">Se descargó <b>${esc(nombre)}</b>. Mandáselo a ${esc(u?.nombre || 'la persona')} por WhatsApp (clip → Documento) o por correo, con este mensaje:</p><div class="link-app">${esc(texto)}</div>
    <div class="row"><button class="btn primary" id="cp-msg">Copiar el mensaje</button></div>`, 520);
  M.querySelector('#cp-msg').onclick = async () => { try { await navigator.clipboard.writeText(texto); toast('Mensaje copiado'); } catch (e) {} };
}
function fusionar(L, R, de) {
  const autor = USERS[de], autoridad = autor && ['dueño', 'gerente'].includes(rolEn(L, autor)), res = {valores: 0, notas: 0, aplic: 0, cambios: 0};
  if (autoridad) { ['titulo', 'cultivo', 'tipo', 'lugar', 'campana', 'objetivo', 'tratamientos', 'variables', 'asig', 'trabajo', 'compartido', 'invitados', 'porCorte', 'cortes', 'uniformizacion', 'dron', 'caldo', 'parcela', 'equipo'].forEach(k => { if (R[k] !== undefined) L[k] = structuredClone(R[k]); }); }
  if (R.sitios) { L.sitios = L.sitios || []; R.sitios.forEach(rs => { const ls = L.sitios.find(x => x.id === rs.id); if (!ls) L.sitios.push(structuredClone(rs)); else if (autoridad) Object.assign(ls, structuredClone(rs)); }); }
  R.parcelas.forEach(rp => { let lp = L.parcelas.find(x => x.parcela === rp.parcela); if (!lp) { L.parcelas.push(structuredClone(rp)); return; }
    lp.ts = lp.ts || {}; lp.sub = lp.sub || {};
    Object.keys(rp.valores || {}).forEach(vid => { const tr = rp.ts?.[vid] || '', tl = lp.ts[vid] || ''; const vacio = lp.valores[vid] == null || lp.valores[vid] === '';
      if ((tr > tl || (vacio && !tl)) && JSON.stringify(lp.valores[vid]) !== JSON.stringify(rp.valores[vid])) { lp.valores[vid] = rp.valores[vid]; if (rp.sub?.[vid] !== undefined) lp.sub[vid] = structuredClone(rp.sub[vid]); if (tr) lp.ts[vid] = tr; res.valores++; } }); });
  if (R.papeles?.length) { L.papeles = L.papeles || []; R.papeles.forEach(rp => { if (!L.papeles.some(x => x.id === rp.id)) { L.papeles.push(structuredClone(rp)); res.papeles = (res.papeles || 0) + 1; } }); }
  const kN = n => [n.nivel, n.ref, n.texto, n.autor].join('¦'); const hayN = new Set(L.notas.map(kN)); R.notas.forEach(n => { if (!hayN.has(kN(n))) { L.notas.push(structuredClone(n)); res.notas++; } });
  R.aplicaciones.forEach(ra => { const la = L.aplicaciones.find(x => String(x.id) === String(ra.id)); if (!la) { L.aplicaciones.push(structuredClone(ra)); res.aplic++; } else if (la.estado !== 'realizada' && ra.estado === 'realizada') { Object.assign(la, structuredClone(ra)); res.aplic++; } });
  const kC = c => [c.fecha, c.usuario, c.parcela, c.variable, JSON.stringify(c.despues)].join('¦'), mapaC = new Map(L.cambios.map(c => [kC(c), c]));
  R.cambios.forEach(c => { const l = mapaC.get(kC(c)); if (!l) { L.cambios.push(structuredClone(c)); res.cambios++; } else if (l.estado === 'pendiente' && c.estado !== 'pendiente') { l.estado = c.estado; l.comentario = c.comentario; } });
  L.cambios.sort((a, b) => { const f = x => { const m = String(x.fecha).match(/(\d+)\/(\d+) (\d+):(\d+)/); return m ? +m[2] * 1e6 + +m[1] * 1e4 + +m[3] * 100 + +m[4] : 0; }; return f(b) - f(a); });
  if (L.cortes || L.porCorte) armarCortes(L); else recalc(L);
  return res;
}
function recibirArchivo() {
  const M = modal(`<div class="row" style="justify-content:space-between"><h2>Recibir archivo</h2><button class="btn small" data-cerrar>✕</button></div>
    <p class="note" style="margin:0">Elegí el archivo que te mandaron (ensayo, datos de un operador o respaldo). Si ya tenés ese ensayo, la app suma lo nuevo sin borrar lo tuyo.</p>
    <label class="btn primary" style="position:relative;justify-self:start">📥 Elegir archivo<input type="file" accept=".json,application/json,text/plain,*/*" id="rec-file" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label><div id="rec-msg"></div>`, 560);
  M.querySelector('#rec-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; let js; try { js = JSON.parse(await f.text()); } catch (x) { M.querySelector('#rec-msg').innerHTML = '<div class="callout warn">El archivo no se pudo leer. ¿Es un archivo de Ensayos de Campo (.json)?</div>'; return; }
    if (js?.app !== 'Ensayos de Campo' || !Array.isArray(js.ensayos)) { M.querySelector('#rec-msg').innerHTML = '<div class="callout warn">No es un archivo de Ensayos de Campo.</div>'; return; }
    const res = await recibirPaquete(js); M.cerrar();
    const para = js.para && USERS[js.para];
    if (para && S.user?.id !== para.id && (js.tipo === 'paquete') && (!S.user || await confirmar('Entrar con tu perfil', `Este ensayo se lo mandaron a <b>${esc(para.nombre)}</b> (${PERFILES[para.perfil]}). ¿Sos vos? Si decís que sí, entrás con ese perfil para trabajar en lo que te asignaron.`, {ok: `Sí, soy ${para.nombre.split(' ')[0]}`, cancelar: 'No'}))) { S.user = para; }
    const T = byId(js.ensayos[0].id); listaCuentas();
    toast(res.nuevo ? `Ensayo “${T.titulo}” recibido` : `Se sumaron ${res.valores} valores, ${res.notas} notas y ${res.aplic} aplicaciones`);
    if (S.user && T && rolEn(T)) { S.rubro = T.rubro; abrir(T, rolEn(T) === 'operador' ? 'datos' : rolEn(T) === 'lector' ? 'campo' : 'equipo'); } else if (S.user) irInicio(); else pantalla('bienvenida');
  };
}
async function recibirPaquete(js) {
  Object.entries(js.config?.perfiles || {}).forEach(([id, u]) => { if (!USERS[id]) USERS[id] = u; });
  Object.entries(js.config?.equipos || {}).forEach(([id, q]) => { if (!EQUIPOS[id]) EQUIPOS[id] = q; });
  (js.config?.custom || []).forEach(c => { if (!CUSTOM.some(x => x.id === c.id)) CUSTOM.push(c); });
  (js.config?.pulv || []).forEach(q => { const i = PULV.findIndex(x => x.id === q.id); if (i < 0) PULV.push(q); else if (js.de && USERS[js.de] && q.mod && (!PULV[i].mod || q.mod > PULV[i].mod)) PULV[i] = q; });
  let total = {valores: 0, notas: 0, aplic: 0, nuevo: false};
  for (const R of js.ensayos) { const L = byId(R.id); if (!L) { TRIALS.push(structuredClone(R)); total.nuevo = true; } else { const r = fusionar(L, R, js.de); total.valores += r.valores; total.notas += r.notas; total.aplic += r.aplic; } }
  const ya = new Set((await DB.todasLasImagenes().catch(() => [])).map(i => i.id));
  for (const im of js.imagenes || []) if (!ya.has(im.id)) await DB.guardarImagen({...im, data: undefined, blob: await dataABlob(im.data)});
  await guardarAhora(); return total;
}

/* ================= control de parcela (panel lateral) ================= */
let notaNivel = 'parcela';
function abrirDrawer(pn) {
  const T = S.T, p = T.parcelas.find(x => x.parcela === pn); if (!p) return; S.sel = pn;
  const ed = puede.datos(T, pn), C = colTrat(T), a = USERS[T.asig[pn]] || USERS[Object.keys(T.trabajo || {}).find(k => T.trabajo[k] === 'ensayo')];
  const medida = v => { const val = p.valores[v.id], dis = !ed || auto(v) ? 'disabled' : '';
    let campo;
    if (v.entrada) { const s = p.sub[v.id] || {}, inp = (k, l, x, st = 'any') => `<label class="f">${l}<input type="number" step="${st}" min="0" data-e="${v.id}" data-k="${k}" value="${x ?? ''}" ${dis}></label>`;
      const ins = v.entrada === 'ms' ? `<div class="grid2">${Array.from({length: T.parcela.marcos || 2}, (_, i) => inp('pv' + i, `Marco ${i + 1}: peso verde (g)`, s.pv?.[i])).join('')}${inp('sv', 'Submuestra en verde (g)', s.sv)}${inp('ss', 'Submuestra seca (g)', s.ss)}</div>`
        : `<div class="grid2">${inp('peso', `Grano cosechado (kg) en ${fmt(T.parcela.area_util_m2, 1)} m²`, s.peso)}${inp('hum', 'Humedad del grano (%)', s.hum, 0.1)}</div>`;
      campo = `<div class="calc">${ins}<div class="row"><span class="note">Resultado</span><input type="number" step="any" data-m="${v.id}" value="${val ?? ''}" ${dis} style="width:120px;text-align:right;font-family:var(--f-data)"><span class="note">${esc(v.unidad)}</span><span class="note" data-cinfo="${v.id}">${calcInfo(T, v, s)}</span></div></div>`; }
    else if (v.origen === 'calc') campo = `<div class="code" style="font-size:.95rem">${val == null ? '—' : fmt(val, v.dec ?? 2)} ${esc(v.unidad)}</div>`;
    else if (v.tipo === 'texto') campo = `<textarea data-m="${v.id}" ${dis} placeholder="Escribí la observación">${esc(val ?? '')}</textarea>`;
    else if (v.tipo === 'escala' && v.sub <= 1) campo = `<select data-m="${v.id}" ${dis}><option value="">Elegir nota</option>${(v.escala || []).map((e, i) => `<option value="${i + 1}" ${Number(val) === i + 1 ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>`;
    else if (v.sub > 1) { const s = p.sub[v.id] || [];
      campo = `<div class="subs">${Array.from({length: v.sub}, (_, i) => `<input type="number" step="any" ${v.min != null ? `min="${v.min}"` : ''} ${v.max != null ? `max="${v.max}"` : ''} data-s="${v.id}" data-i="${i}" value="${s[i] ?? ''}" ${dis} aria-label="${esc(v.nombre)} submuestra ${i + 1}" placeholder="${i + 1}">`).join('')}</div>
        <div class="note" data-prom="${v.id}">Promedio: <b>${val == null ? '—' : fmt(val, v.dec ?? 2)}</b> ${esc(v.unidad)}${val != null && !s.length ? ' (cargado sin submuestras)' : ''}</div>`; }
    else if (v.origen === 'dron') campo = `<div class="code" style="font-size:.95rem">${fmt(val, v.dec ?? 2)} ${esc(v.unidad)}</div>`;
    else campo = `<div class="row"><input type="number" step="any" data-m="${v.id}" value="${val ?? ''}" ${dis} style="width:140px;text-align:right;font-family:var(--f-data)"><span class="note">${esc(v.unidad)}</span></div>`;
    return `<div class="medida" data-med="${v.id}"><div class="row" style="justify-content:space-between"><b>${esc(v.nombre)}</b>${v.origen === 'dron' ? '<span class="chip dron">dron</span>' : v.origen === 'calc' ? '<span class="chip neu">calculada</span>' : val == null || val === '' ? '<span class="chip warn">pendiente</span>' : '<span class="chip ok">cargado</span>'}</div>
      ${campo}<details><summary>Cómo se mide${v.momento ? ' · ' + esc(v.momento) : ''}</summary><p>${esc(v.metodo)}${v.min != null && v.tipo !== 'texto' ? ` Rango válido: ${v.min} a ${v.max}.` : ''}</p></details></div>`; };
  const refN = () => notaNivel === 'parcela' ? pn : notaNivel === 'bloque' ? refBloque(T, p) : p.trat;
  const notasDe = () => T.notas.filter(n => n.nivel === notaNivel && String(n.ref) === String(refN()));
  const d = $('#drawer');
  d.innerHTML = `<header><div class="row" style="justify-content:space-between"><h2>${esLal(T) ? 'Franja' : 'Parcela'} ${T.sitios ? pn % 1000 : pn}${T.sitios ? ` <span class="chip acc">${esc(nomSitio(T, p.sitio))}</span>` : ''}</h2><button class="btn small" id="dr-cerrar" aria-label="Cerrar">✕ Cerrar</button></div>
    <div class="row note"><span><span class="swatch" style="background:${C[p.trat]}"></span> <b style="color:var(--ink)">${p.trat}</b> · ${esc(tratNom(T, p.trat))}</span><span>${esLal(T) ? "Par" : "Bloque"} ${p.bloque}</span>${a ? `<span class="row" style="gap:5px">${avatar(a)}${esc(a.nombre)}</span>` : '<span>Sin asignar</span>'}</div>
    ${(() => { const hechas = (T.aplicaciones || []).filter(a => a.estado === 'realizada' && aplicaA(a, p.trat) && a.fecha <= HOY && (!p.sitio || !a.sitio || a.sitio === 'todos' || a.sitio === p.sitio)).sort((x, y) => y.fecha.localeCompare(x.fecha));
      const tr = hechas.find(a => a.tipo === 'Aplicación de tratamientos'), lab = hechas.find(a => a.tipo !== 'Aplicación de tratamientos');
      const t = T.tratamientos.find(x => x.cod === p.trat);
      const l1 = tr ? `Última aplicación del tratamiento: <b>${fechaTxt(tr.fecha)}</b>${tr.estadio ? ' (' + esc(tr.estadio.split(' (')[0]) + ')' : ''}${dias(tr.fecha) <= 120 ? ` · hoy <b>${dias(tr.fecha)} DDA</b>` : ''}` : t?.testigo ? 'Testigo: no recibe la aplicación de tratamientos.' : '';
      const l2 = lab ? `Última labor: ${esc(lab.tipo)} ${cuando(lab.fecha)} (${fechaTxt(lab.fecha)})` : '';
      const pul = hechas.find(a => PULVERIZA.includes(a.tipo)), np = (T.papeles || []).filter(x => x.parcela === pn).length;
      const l3 = pul && puedeAplic(T) ? `<button class="btn small" data-papel-dr="${pul.id}" style="margin-top:4px">🔍 Papel hidrosensible${np ? ` (${np} tarjeta${np > 1 ? 's' : ''})` : ''}</button>` : np ? `Papel hidrosensible: ${np} tarjeta${np > 1 ? 's' : ''}` : '';
      return l1 || l2 || l3 ? `<div class="ultima">${[l1, l2, l3].filter(Boolean).join('<br>')}</div>` : ''; })()}
    ${!ed ? `<div class="chip neu" style="justify-self:start">${rolEn(T) === 'lector' ? 'Solo lectura' : 'Parcela no asignada a vos: solo lectura'}</div>` : ''}</header>
    <div class="body"><div style="display:grid;gap:6px"><h3>Resultados</h3>${T.cortes?.length ? '<div class="seg" id="seg-corte-dr"></div>' : ''}</div>${filtroCorte(T, vis(T)).map(medida).join('') || '<p class="note">El ensayo no tiene mediciones definidas.</p>'}
      <div style="display:grid;gap:8px"><div class="row" style="justify-content:space-between"><h3>Fotos de la parcela</h3>${rolEn(T) !== 'lector' ? fotoBtn(pn) : ''}</div><div class="fotos" data-fotos="${pn}"></div></div>
      <div data-fa-p="${pn}" hidden style="display:grid;gap:6px"></div>
      <div style="display:grid;gap:8px"><h3>Notas</h3><div class="seg" id="seg-nota"></div><div id="notas-list"></div>
        ${puede.nota(T, notaNivel, refN()) ? `<textarea id="nota-txt" data-voz placeholder="Escribí una nota para ${notaNivel === 'parcela' ? 'esta parcela' : notaNivel === 'bloque' ? 'todo el bloque ' + p.bloque : 'el tratamiento ' + p.trat + ' (todas sus parcelas)'}"></textarea><button class="btn small" id="nota-add" style="justify-self:start">Agregar nota</button>` : '<p class="note" style="margin:0">No podés agregar notas en este nivel.</p>'}</div></div>
    <footer><span class="note" id="dr-msg">${ed ? 'Los cambios quedan en el historial.' : ''}</span>${ed ? '<button class="btn primary" id="dr-guardar">Guardar resultados</button>' : ''}</footer>`;
  seg('#seg-nota', [['parcela', `${esLal(T) ? 'Franja' : 'Parcela'} ${T.sitios ? pn % 1000 : pn}`], ['tratamiento', `${esLal(T) ? 'Lado' : 'Tratamiento'} ${p.trat}`], ['bloque', `${esLal(T) ? 'Par' : 'Bloque'} ${p.bloque}`]], notaNivel, v => { notaNivel = v; abrirDrawer(pn); });
  $('#notas-list').innerHTML = listaNotas(T, notasDe());
  segCorte('#seg-corte-dr', T, () => abrirDrawer(pn)); pintarFotos(T, pn); vozEn(d);
  recorteParcela(T, pn).then(r => { const h = d.querySelector(`[data-fa-p="${pn}"]`); if (!r || !h) return; h.hidden = false;
    h.innerHTML = `<h3>Foto aérea de la ${esLal(T) ? 'franja' : 'parcela'}</h3><img src="${r.url}" alt="Recorte de la foto aérea" style="width:100%;max-height:320px;object-fit:contain;border-radius:8px;background:#222">`; }).catch(e => console.warn(e));
  d.onchange = e => { if (e.target.dataset.fotoIn != null) subirFotos(e.target, T, pn); };
  d.hidden = false; $('#scrim').hidden = false;
  d.oninput = e => { const ev = e.target.dataset.e; if (ev) { const v = T.variables.find(x => x.id === ev), sb = leerEntrada(d, v), r = calcEntrada(T, v, sb);
      if (r != null) d.querySelector(`[data-m="${ev}"]`).value = Math.round(r * 10 ** (v.dec ?? 0)) / 10 ** (v.dec ?? 0); d.querySelector(`[data-cinfo="${ev}"]`).textContent = calcInfo(T, v, sb); return; }
    const vid = e.target.dataset.s; if (!vid) return; const v = T.variables.find(x => x.id === vid), vals = [...d.querySelectorAll(`[data-s="${vid}"]`)].map(i => parseFloat(i.value)).filter(x => !isNaN(x));
    d.querySelector(`[data-prom="${vid}"]`).innerHTML = `Promedio: <b>${vals.length ? fmt(vals.reduce((s, x) => s + x, 0) / vals.length, v.dec ?? 2) : '—'}</b> ${esc(v.unidad)} · ${vals.length} de ${v.sub} submuestras`; };
  d.onclick = async e => {
    if (e.target.closest('#dr-cerrar')) return cerrarDrawer();
    const pd = e.target.closest('[data-papel-dr]'); if (pd) return leerPapel(T, pd.dataset.papelDr, pn);
    if (await clicFotos(e, T, pn)) return;
    if (e.target.closest('#nota-add')) { const t = $('#nota-txt').value.trim(); if (!t) return; T.notas.push({nivel: notaNivel, ref: refN(), texto: t, autor: S.user.id, fecha: ahora()}); toast('Nota agregada'); abrirDrawer(pn); refrescar(); return; }
    if (e.target.closest('#dr-guardar')) { let n = 0, fuera = [];
      filtroCorte(T, vis(T)).forEach(v => { if (auto(v)) return;
        if (v.sub > 1 && v.tipo !== 'texto') { const ins = [...d.querySelectorAll(`[data-s="${v.id}"]`)], raw = ins.map(i => i.value === '' ? null : parseFloat(i.value)), vals = raw.filter(x => x != null && !isNaN(x));
          if (!vals.length) return; if (vals.some(x => (v.min != null && x < v.min) || (v.max != null && x > v.max))) fuera.push(v.nombre);
          if (guardarValor(T, pn, v.id, +(vals.reduce((s, x) => s + x, 0) / vals.length).toFixed(4), raw)) n++; }
        else { const el = d.querySelector(`[data-m="${v.id}"]`); if (!el) return; const raw = el.value; if (raw === '') return;
          const val = v.tipo === 'texto' ? raw : parseFloat(raw); if (v.tipo !== 'texto' && ((v.min != null && val < v.min) || (v.max != null && val > v.max))) fuera.push(v.nombre);
          if (guardarValor(T, pn, v.id, val, v.entrada ? leerEntrada(d, v) : undefined)) n++; } });
      toast(n ? `${n} resultado${n > 1 ? 's' : ''} guardado${n > 1 ? 's' : ''}` : 'Sin cambios para guardar');
      abrirDrawer(pn); if (fuera.length) $('#dr-msg').innerHTML = `<span class="chip warn">Revisá</span> fuera del rango válido: ${esc(fuera.join(', '))}`; refrescar(); }
  };
  mapa.redibujar();
}
/* calculadoras de carga: materia seca y rendimiento a 13 % */
function leerEntrada(d, v) { const g = k => { const el = d.querySelector(`[data-e="${v.id}"][data-k="${k}"]`); return el && el.value !== '' ? +el.value : null; };
  if (v.entrada === 'ms') return {pv: Array.from({length: S.T.parcela.marcos || 2}, (_, i) => g('pv' + i)), sv: g('sv'), ss: g('ss')};
  return {peso: g('peso'), hum: g('hum')}; }
function calcEntrada(T, v, s) {
  if (v.entrada === 'ms') { const pv = (s.pv || []).filter(x => x != null); if (!pv.length || !s.sv || s.ss == null) return null; return pv.reduce((a, x) => a + x, 0) / pv.length / (T.parcela.marco || 0.25) * (s.ss / s.sv) * 10; }
  if (s.peso == null || s.hum == null) return null; return s.peso * (100 - s.hum) / 87 * 10000 / T.parcela.area_util_m2; }
function calcInfo(T, v, s) {
  if (v.entrada === 'ms') return s.sv && s.ss != null ? `MS ${fmt(s.ss / s.sv * 100, 1)} % · marco de ${T.parcela.marco || 0.25} m²` : 'Cargá los pesos para calcular';
  return s.peso != null && s.hum != null ? `corregido a 13 % (cosecha al ${fmt(s.hum, 1)} %)` : 'Cargá peso y humedad para calcular'; }
function cerrarDrawer() { $('#drawer').hidden = true; $('#scrim').hidden = true; if (S.T) { S.sel = null; mapa.redibujar(); } }
$('#scrim').onclick = cerrarDrawer;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#drawer').hidden) cerrarDrawer(); });
function refrescar() { if (!$('#s-ensayo').hidden) { const k = PASOS[S.paso][0]; if (k === 'campo') mapa.redibujar(); else RENDER[k](S.T); irPasoNav(); } }


/* ================= guardado automático en este equipo ================= */
const ULT = new Map(); let cfgUlt = '', tGuardar = null, estadoGuardado = 'ok'; ULT_LISTO = true;
const cfgActual = () => ({perfiles: USERS, equipos: EQUIPOS, custom: CUSTOM, pulv: PULV, meta: META, sesion: {user: S.user?.id || null, rubro: S.rubro || null}});
function marcarGuardados() { ULT.clear(); TRIALS.forEach(T => ULT.set(T.id, JSON.stringify(T))); cfgUlt = JSON.stringify(cfgActual()); }
function guardarPronto(ms = 400) { clearTimeout(tGuardar); tGuardar = setTimeout(guardarAhora, ms); }
async function guardarAhora() {
  clearTimeout(tGuardar); if (ESTADO_DB === 'error') return pintarGuardado();
  const cambiados = [], borrados = [...ULT.keys()].filter(id => !TRIALS.some(T => T.id === id));
  TRIALS.forEach(T => { const j = JSON.stringify(T); if (ULT.get(T.id) !== j) cambiados.push([T.id, j]); });
  const c = JSON.stringify(cfgActual()), cfgCambio = c !== cfgUlt;
  if (!cambiados.length && !borrados.length && !cfgCambio) return;
  estadoGuardado = 'guardando'; pintarGuardado();
  try {
    if (cambiados.length) await DB.guardarEnsayos(cambiados.map(([, j]) => JSON.parse(j)));
    if (borrados.length) await DB.borrarEnsayos(borrados);
    if (cfgCambio) await DB.guardarConfig(JSON.parse(c));
    cambiados.forEach(([id, j]) => ULT.set(id, j)); borrados.forEach(id => ULT.delete(id)); cfgUlt = c;
    estadoGuardado = 'ok'; META.ultimoGuardado = new Date().toISOString();
  } catch (e) { console.error('No se pudo guardar', e); estadoGuardado = 'error'; }
  pintarGuardado();
}
function pintarGuardado() {
  const b = $('#bar-sync'); if (!b) return; const err = ESTADO_DB === 'error' || estadoGuardado === 'error';
  b.className = 'pill' + (err ? ' pend' : estadoGuardado === 'guardando' ? ' off' : '');
  b.innerHTML = `<span class="dot"></span><span>${err ? 'No se pudo guardar' : estadoGuardado === 'guardando' ? 'Guardando…' : 'Guardado'}</span>`;
  b.title = err ? 'El navegador no permitió guardar. Tocá para ver opciones.' : 'Todo se guarda solo en este equipo. Tocá para respaldos y datos.';
}
['click', 'change', 'input', 'submit', 'keyup'].forEach(ev => document.addEventListener(ev, () => guardarPronto(), true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarAhora(); });
addEventListener('pagehide', () => guardarAhora());
$('#bar-sync').onclick = () => abrirDatos();

/* ================= ventanas: confirmar y datos/respaldo ================= */
function confirmar(titulo, texto, {ok = 'Aceptar', peligro = false, cancelar = 'Cancelar'} = {}) {
  return new Promise(res => {
    const f = document.createElement('div'); f.className = 'modal-fondo'; f.style.zIndex = 120;
    f.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" style="width:min(460px,100%)"><h2 style="font-size:1.2rem">${esc(titulo)}</h2><p style="margin:0">${texto}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-r="0">${esc(cancelar)}</button><button class="btn primary ${peligro ? 'peligro' : ''}" data-r="1">${esc(ok)}</button></div></div>`;
    document.body.append(f); f.querySelector('[data-r="1"]').focus();
    const fin = v => { f.remove(); document.removeEventListener('keydown', k, true); res(v); };
    const k = e => { if (e.key === 'Escape') { e.stopPropagation(); fin(false); } };
    document.addEventListener('keydown', k, true);
    f.onclick = e => { const b = e.target.closest('[data-r]'); if (b) fin(b.dataset.r === '1'); else if (e.target === f) fin(false); };
  });
}
function descargar(nombre, contenido, tipo = 'application/octet-stream') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], {type: tipo}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const nombreArchivo = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 60);
const blobAData = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
const dataABlob = async d => (await fetch(d)).blob();
async function respaldoJSON() {
  await guardarAhora();
  const imgs = await DB.todasLasImagenes().catch(() => []);
  const imagenes = await Promise.all(imgs.map(async i => ({...i, blob: undefined, data: await blobAData(i.blob)})));
  return {app: 'Ensayos de Campo', version: 2, fecha: new Date().toISOString(), ensayos: TRIALS, config: cfgActual(), imagenes};
}
async function restaurar(js, modo) {
  if (js?.app !== 'Ensayos de Campo' || !Array.isArray(js.ensayos)) throw new Error('El archivo no es un respaldo de Ensayos de Campo v2.');
  if (modo === 'reemplazar') { await DB.borrarTodo(); cargarEstado(js.ensayos, js.config || {}); }
  else {
    js.ensayos.forEach(T => { const i = TRIALS.findIndex(x => x.id === T.id); if (i >= 0) TRIALS[i] = T; else TRIALS.push(T); });
    Object.assign(USERS, js.config?.perfiles || {}); Object.assign(EQUIPOS, js.config?.equipos || {});
    (js.config?.custom || []).forEach(c => { if (!CUSTOM.some(x => x.id === c.id)) CUSTOM.push(c); });
    (js.config?.pulv || []).forEach(q => { if (!PULV.some(x => x.id === q.id)) PULV.push(q); });
  }
  for (const im of js.imagenes || []) await DB.guardarImagen({...im, data: undefined, blob: await dataABlob(im.data)});
  ULT.clear(); cfgUlt = ''; await guardarAhora();
}
async function abrirDatos() {
  const u = await DB.uso(), mb = x => fmt((x || 0) / 1048576, 1), propios = TRIALS.filter(T => !T.ejemplo).length, ej = TRIALS.filter(T => T.ejemplo).length;
  const f = document.createElement('div'); f.className = 'modal-fondo'; f.id = 'datos';
  f.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="datos-t">
    <div class="row" style="justify-content:space-between"><h2 id="datos-t">Tus datos</h2><button class="btn small" data-a="cerrar">✕ Cerrar</button></div>
    <div class="callout">${ESTADO_DB === 'error' || estadoGuardado === 'error' ? '<b>El navegador no permitió guardar.</b> Puede pasar en una ventana privada o con poco espacio. Descargá un respaldo ahora para no perder lo cargado.' : `<b>Todo se guarda solo en este equipo</b>, en este navegador, y funciona sin internet. ${META.ultimoGuardado ? 'Último guardado: ' + new Date(META.ultimoGuardado).toLocaleString('es-PY') : ''}`}</div>
    <dl class="kv"><dt>Ensayos propios</dt><dd>${propios}</dd><dt>Ensayos de ejemplo</dt><dd>${ej}</dd><dt>Perfiles</dt><dd>${Object.keys(USERS).length}</dd>
      ${u ? `<dt>Espacio usado</dt><dd>${mb(u.usage)} MB de ${mb(u.quota)} MB disponibles</dd>` : ''}<dt>Último respaldo</dt><dd>${META.ultimoRespaldo ? new Date(META.ultimoRespaldo).toLocaleString('es-PY') : 'Nunca'}</dd></dl>
    <div class="grid2"><div class="card"><h3>Respaldo</h3><p class="note" style="margin:0">Si se borran los datos del navegador, se pierde lo cargado. Descargá un respaldo cada tanto (sobre todo antes de cambiar de equipo) y guardalo en OneDrive o un pendrive.</p>
        <button class="btn primary" data-a="bajar">Descargar respaldo (.json)</button>
        <label class="btn" style="position:relative">Restaurar un respaldo…<input type="file" accept=".json,application/json" data-a="subir" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>
      <div class="card"><h3>Ejemplos</h3><p class="note" style="margin:0">Los ensayos y perfiles de ejemplo (Marta, Ana, Luis y Carlos) sirven para aprender y para el recorrido de Ayuda. Podés quitarlos sin tocar tus ensayos.</p>
        ${ej ? '<button class="btn" data-a="quitar-ej">Quitar los ejemplos</button>' : ''}<button class="btn" data-a="restaurar-ej">${ej ? 'Volver a cargar los ejemplos como nuevos' : 'Cargar los ejemplos'}</button>
        <button class="btn peligro" data-a="borrar-todo" style="margin-top:6px">Borrar todos los datos de este equipo</button></div></div></div>`;
  document.body.append(f);
  const cerrar = () => f.remove();
  f.onclick = async e => { if (e.target === f) return cerrar(); const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'cerrar') cerrar();
    if (a === 'bajar') { const js = await respaldoJSON(); META.ultimoRespaldo = new Date().toISOString(); descargar(`respaldo_ensayos_${HOY}.json`, JSON.stringify(js), 'application/json'); guardarPronto(); toast('Respaldo descargado'); cerrar(); }
    if (a === 'quitar-ej' && await confirmar('Quitar los ejemplos', 'Se borran los ensayos y perfiles de ejemplo de este equipo. Tus ensayos y perfiles no se tocan.', {ok: 'Quitar', peligro: true})) {
      await quitarEjemplos(); toast('Ejemplos quitados'); cerrar(); volverAlInicio(); }
    if (a === 'restaurar-ej') { await cargarEjemplos(); toast('Ejemplos cargados'); cerrar(); volverAlInicio(); }
    if (a === 'borrar-todo' && await confirmar('Borrar todos los datos', 'Se borran <b>todos</b> los ensayos, perfiles, fotos e indicadores de este equipo. No se puede deshacer. ¿Descargaste un respaldo?', {ok: 'Borrar todo', peligro: true})
      && await confirmar('¿Seguro?', 'Última confirmación: se borra todo lo guardado en este navegador.', {ok: 'Sí, borrar todo', peligro: true})) {
      await DB.borrarTodo(); TRIALS.length = 0; Object.keys(USERS).forEach(k => delete USERS[k]); Object.keys(EQUIPOS).forEach(k => delete EQUIPOS[k]); CUSTOM.length = 0;
      S.user = null; S.T = null; ULT.clear(); cfgUlt = ''; await guardarAhora(); cerrar(); cerrarDrawer(); listaCuentas(); pantalla('bienvenida'); toast('Se borraron todos los datos'); }
  };
  f.onchange = async e => { if (e.target.dataset.a !== 'subir') return; const file = e.target.files[0]; if (!file) return;
    let js; try { js = JSON.parse(await file.text()); } catch (x) { return toast('El archivo no se pudo leer'); }
    const n = js.ensayos?.length || 0;
    const reemplazar = await confirmar('Restaurar respaldo', `El respaldo tiene ${n} ensayo${n === 1 ? '' : 's'}${js.fecha ? ' (del ' + new Date(js.fecha).toLocaleDateString('es-PY') + ')' : ''}. ¿Querés <b>sumarlo</b> a lo que ya hay (los ensayos con el mismo código se actualizan) o <b>reemplazar</b> todo?`, {ok: 'Reemplazar todo', cancelar: 'Sumar', peligro: true});
    try { await restaurar(js, reemplazar ? 'reemplazar' : 'sumar'); toast('Respaldo restaurado'); cerrar(); listaCuentas(); if (!S.user || !USERS[S.user.id]) { S.user = null; pantalla('bienvenida'); } else volverAlInicio(); }
    catch (x) { toast(x.message); } };
}
async function quitarEjemplos() {
  const ids = TRIALS.filter(T => T.ejemplo).map(T => T.id);
  for (let i = TRIALS.length - 1; i >= 0; i--) if (TRIALS[i].ejemplo) TRIALS.splice(i, 1);
  Object.keys(USERS).forEach(k => { if (USERS[k].ejemplo) delete USERS[k]; }); Object.keys(EQUIPOS).forEach(k => { if (EQUIPOS[k].ejemplo) delete EQUIPOS[k]; });
  for (let i = PULV.length - 1; i >= 0; i--) if (PULV[i].ejemplo) PULV.splice(i, 1);
  if (S.user?.ejemplo) S.user = null; if (S.T?.ejemplo) S.T = null; await DB.borrarEnsayos(ids); await guardarAhora(); listaCuentas();
}
async function cargarEjemplos() {
  const sem = JSON.parse(SEMILLA);
  sem.trials.forEach(T => { const i = TRIALS.findIndex(x => x.id === T.id); if (i >= 0) TRIALS[i] = T; else TRIALS.push(T); });
  Object.assign(USERS, sem.users); Object.assign(EQUIPOS, sem.equipos); (sem.pulv || []).forEach(q => { const i = PULV.findIndex(x => x.id === q.id); if (i >= 0) PULV[i] = q; else PULV.push(q); }); await guardarAhora(); listaCuentas();
}
function volverAlInicio() { cerrarDrawer(); if (S.user && USERS[S.user.id]) { S.user = USERS[S.user.id]; if (S.rubro) irInicio(); else irRubro(); } else { S.user = null; pantalla('bienvenida'); } }

/* ================= instalar y compartir ================= */
const LINK_APP = 'https://diegobc017-blip.github.io/ensayos-campo/';
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esMovil = esIOS || /android|mobile/i.test(navigator.userAgent);
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function bannerInstalar() {
  if (instalada() || META.ocultarInstalar || !esMovil) return '';
  return `<div class="banner"><span class="ico" aria-hidden="true">📲</span><span><b>Instalá la app en este celular</b><span class="note">Así abre desde la pantalla de inicio, funciona sin señal y tus datos quedan guardados.</span></span>
    <span class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn small primary" id="ban-como">Cómo</button><button class="btn small" id="ban-cerrar" aria-label="Ocultar">✕</button></span></div>`;
}
function pasosInstalar() {
  if (instalada()) return '<p style="margin:0">✓ La app ya está instalada en este equipo.</p>';
  if (typeof pedidoInstalar !== 'undefined' && pedidoInstalar) return '<button class="btn primary" id="inst-ya">⭳ Instalar ahora</button>';
  if (esIOS) return `<ol class="pasos-inst"><li>Abrí este link en <b>Safari</b> (en iPhone o iPad tiene que ser Safari).</li><li>Tocá el botón <b>Compartir</b> <span class="kbd">□↑</span> abajo de la pantalla.</li><li>Elegí <b>“Agregar a inicio”</b> y después <b>Agregar</b>.</li><li>Abrí la app desde el ícono nuevo de la pantalla de inicio.</li></ol>`;
  if (/android/i.test(navigator.userAgent)) return `<ol class="pasos-inst"><li>Abrí este link en <b>Chrome</b>.</li><li>Tocá el menú <span class="kbd">⋮</span> arriba a la derecha.</li><li>Elegí <b>“Instalar app”</b> (o “Agregar a pantalla principal”) y confirmá.</li><li>Abrí la app desde el ícono nuevo.</li></ol>`;
  return `<ol class="pasos-inst"><li>Abrí este link en <b>Chrome</b> o <b>Edge</b>.</li><li>Tocá el ícono de instalar <span class="kbd">⊕</span> a la derecha de la barra de direcciones (o menú → “Instalar Ensayos de Campo”).</li><li>Queda como un programa más, con su ícono, y abre sin internet.</li></ol>`;
}
async function abrirInstalar() {
  const enEstaPC = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
  const M = modal(`<div class="row" style="justify-content:space-between"><h2>Instalar y compartir</h2><button class="btn small" data-cerrar>✕ Cerrar</button></div>
    <div class="grid2"><div class="card"><h3>Instalar en este equipo</h3>${pasosInstalar()}
      <p class="note" style="margin:0">Una vez instalada abre sin internet. Los datos quedan en cada equipo: para pasarlos de uno a otro usá el respaldo (indicador “Guardado”).</p></div>
    <div class="card"><h3>Pasarle la app a otra persona</h3><p class="note" style="margin:0">Mandale este link por WhatsApp o correo. Lo abre en el celular o la PC y la instala con los mismos pasos. No hace falta cuenta ni pagar nada.</p>
      <div class="link-app"><span class="code">${esc(LINK_APP)}</span></div>
      <div class="row"><button class="btn primary" id="comp-share">Compartir…</button><a class="btn" id="comp-wa" href="https://wa.me/?text=${encodeURIComponent('Te paso la app Ensayos de Campo para cargar y analizar ensayos (funciona sin internet): ' + LINK_APP)}" target="_blank" rel="noopener">WhatsApp</a><button class="btn" id="comp-copiar">Copiar link</button></div>
      <div id="qr" class="qr" aria-label="Código QR del link"></div><p class="note" style="margin:0;text-align:center">También pueden escanear este código con la cámara del celular.</p>
      ${enEstaPC ? '<p class="note" style="margin:0">Ahora estás usando la copia de esta PC. El link de arriba es la versión publicada en internet, la que se instala en celulares.</p>' : ''}</div></div>`, 860);
  try { const {default: qrcode} = await import('./vendor/qrcode/qrcode.mjs'); const q = qrcode(0, 'M'); q.addData(LINK_APP); q.make(); M.querySelector('#qr').innerHTML = q.createSvgTag({cellSize: 5, margin: 3, scalable: true}); } catch (e) { console.warn(e); }
  M.addEventListener('click', async e => {
    if (e.target.closest('#inst-ya')) { if (pedidoInstalar) { pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; M.cerrar(); } }
    if (e.target.closest('#comp-copiar')) { try { await navigator.clipboard.writeText(LINK_APP); toast('Link copiado'); } catch (x) { prompt('Copiá el link:', LINK_APP); } }
    if (e.target.closest('#comp-share')) { if (navigator.share) { try { await navigator.share({title: 'Ensayos de Campo', text: 'App para cargar y analizar ensayos de campo (funciona sin internet)', url: LINK_APP}); } catch (x) {} } else { try { await navigator.clipboard.writeText(LINK_APP); toast('Link copiado: pegalo donde quieras'); } catch (x) {} } }
  });
}

/* ================= ayuda y recorrido guiado ================= */
const conTexto = (sel, txt) => $$(sel).find(e => e.textContent.includes(txt));
const cardDe = el => el?.closest('.card') || el;
function comoUsuario(id, rubro) { if (S.user?.id !== id) S.user = USERS[id]; S.rubro = rubro; }
function enEjemplo(paso, T = EJ_()) {
  comoUsuario(T === EJ_() ? 'marta' : 'marta', T.rubro); cerrarDrawer();
  if (S.T !== T || $('#s-ensayo').hidden) abrir(T, paso); else if (PASOS[S.paso][0] !== paso) irPaso(PASOS.findIndex(x => x[0] === paso));
}
function enParcela(pn) { if (S.T !== EJ_() || $('#s-ensayo').hidden) enEjemplo('datos'); if (S.sel !== pn || $('#drawer').hidden) { notaNivel = 'parcela'; abrirDrawer(pn); } }
const P1 = () => EJ_().parcelas.find(p => p.bloque === 1 && !EJ_().tratamientos.find(t => t.cod === p.trat).testigo).parcela;
const TOUR = [
  {g: 'Empezar', t: 'Entrar a la app', d: 'Cada persona entra con su perfil. Al crearlo se elige si trabaja como independiente, gerente u operador. Los perfiles y todos los datos quedan guardados en este equipo, sin internet.',
    go: () => { cerrarDrawer(); pantalla('bienvenida'); segAcceso('ingresar'); }, el: () => $('#s-bienvenida .welcome > .card')},
  {g: 'Empezar', t: 'Instalar y compartir', d: 'La app se instala en el celular, la tablet o la PC desde su link, y después abre sin internet. Desde acá se le pasa el link a otra persona (WhatsApp, correo o código QR).',
    go: () => { cerrarDrawer(); pantalla('bienvenida'); segAcceso('ingresar'); }, el: () => $('#btn-compartir-ini')},
  {g: 'El ensayo', t: 'Cómo va este ensayo', d: 'Arriba de cada ensayo hay una lista de lo que está hecho y lo que falta, con el siguiente paso sugerido y un botón para ir directo.',
    go: () => enEjemplo('plan'), el: () => $('.comova')},
  {g: 'Empezar', t: 'Tres formas de trabajar', d: 'El gerente organiza al equipo y revisa lo que se carga; el operador carga datos solo en las parcelas que le asignan; el independiente trabaja solo o suma operadores. El rol se elige al crear el perfil.',
    go: () => { pantalla('bienvenida'); segAcceso('crear'); }, el: () => $('#nc-perfiles')},
  {g: 'Empezar', t: 'Elegir el rubro', d: 'Lo primero es el rubro: agrícola, hortícola, forestal o pasturas. El rubro define la forma de la parcela, los tipos de ensayo, los cultivos y las mediciones que se sugieren. Así cada uno ve solo lo suyo.',
    go: () => { comoUsuario('marta', 'agricola'); irRubro(); }, el: () => $('#rubros')},
  {g: 'Empezar', t: 'Barra superior', d: 'Arriba siempre están el estado del guardado, el rubro (para cambiarlo), el perfil (para cambiar de persona) y este botón de Ayuda.',
    go: () => { comoUsuario('marta', 'agricola'); irInicio(); }, el: () => $('#appbar .in')},
  {g: 'Empezar', t: 'Guardado y respaldo', d: 'Cada cambio se guarda solo en este equipo, sin internet: este indicador lo confirma. Tocándolo se descarga un respaldo de todo (conviene hacerlo seguido), se restaura uno o se quitan los ejemplos.',
    go: () => { comoUsuario('marta', 'agricola'); if ($('#s-inicio').hidden) irInicio(); }, el: () => $('#bar-sync')},
  {g: 'Empezar', t: 'Mis ensayos', d: 'La lista de ensayos del rubro, con el avance de la carga y los cambios pendientes de revisión. Este es el ensayo de ejemplo que vamos a recorrer: fungicidas para roya asiática en soja, 6 tratamientos × 4 bloques.',
    go: () => { comoUsuario('marta', 'agricola'); irInicio(); }, el: () => cardDe($('#s-inicio [data-abrir="DEMO-AG-02"]'))},
  {g: 'Empezar', t: 'Crear un ensayo nuevo', d: 'Un asistente de 3 pasos: datos (nombre, cultivo, tipo, lugar, si se usa dron y qué operadores trabajan), parcela y tratamientos (sortea el croquis y avisa si faltan grados de libertad) y qué se va a medir.',
    go: () => { comoUsuario('marta', 'agricola'); if ($('#s-inicio').hidden) irInicio(); }, el: () => $('#btn-nuevo')},
  {g: 'Empezar', t: 'Tu equipo', d: 'El gerente ve a su equipo y el código de invitación: los operadores se suman con ese código y desde ahí se les pueden asignar ensayos y parcelas.',
    go: () => { comoUsuario('marta', 'agricola'); if ($('#s-inicio').hidden) irInicio(); }, el: () => cardDe(conTexto('#s-inicio .card h3', 'Equipo'))},
  {g: 'El ensayo', t: 'Encabezado del ensayo', d: 'Código, nombre, rubro, cultivo, lugar y diseño. El gerente o el independiente puede renombrarlo (queda en el historial) y la etiqueta muestra tu rol en este ensayo.',
    go: () => enEjemplo('plan'), el: () => $('.ehead')},
  {g: 'El ensayo', t: 'Los pasos del ensayo', d: 'Todo el trabajo está ordenado en 9 pasos, de la planificación al informe. Se puede ir a cualquiera tocándolo; el número naranja marca cambios por revisar.',
    go: () => enEjemplo('plan'), el: () => $('#steps')},
  {g: 'El ensayo', t: 'Planificación y diseño', d: 'Objetivo, datos del ensayo y diseño estadístico. La app controla que el error tenga al menos 12 grados de libertad y que haya testigo, dos condiciones básicas para que el análisis sirva.',
    go: () => enEjemplo('plan'), el: () => $('#panel .grid2')},
  {g: 'El ensayo', t: 'Editar, duplicar o eliminar', d: 'Los datos del ensayo (cultivo, lugar, campaña, objetivo) se corrigen con “Editar datos”. “Duplicar” copia el diseño, tratamientos y mediciones para repetir el ensayo en otro lugar o campaña; “Eliminar” lo borra del equipo.',
    go: () => enEjemplo('plan'), el: () => cardDe($('#btn-duplicar'))},
  {g: 'El ensayo', t: 'El dron es opcional', d: 'Si no se usa dron, el ensayo se centra en lo que se mide a campo y en lo que se aplica. Si se activa, aparecen las capas de imagen (RGB, multiespectral, NDVI, térmica) y las mediciones del dron.',
    go: () => enEjemplo('plan'), el: () => cardDe($('#op-dron'))},
  {g: 'El ensayo', t: 'Tratamientos con registro SENAVE', d: 'Cada tratamiento con su producto, principio activo, dosis y el estado del registro en el listado de SENAVE (vigente, vencido o cancelado), para no ensayar productos dados de baja.',
    go: () => enEjemplo('trat'), el: () => $('#panel .tw')},
  {g: 'El ensayo', t: 'Identificar productos', d: 'Buscador del listado SENAVE por nombre comercial, principio activo o número de registro. El producto elegido se agrega al tratamiento con un toque.',
    go: () => { enEjemplo('trat'); const q = $('#q-prod'); if (q && !q.value) { q.value = 'protioconazol'; q.dispatchEvent(new Event('input')); } }, el: () => cardDe($('#q-prod'))},
  {g: 'El ensayo', t: 'Leer productos de una foto o Excel', d: 'Con una foto de la planilla de tratamientos (o un Excel), la app reconoce productos y dosis, separa las aplicaciones secuenciales y busca cada producto en el listado SENAVE. Todo se revisa antes de guardar, y funciona sin internet.',
    go: () => enEjemplo('trat'), el: () => $('#btn-imp-trat')},
  {g: 'El ensayo', t: 'Dosificación por parcela', d: 'Calcula cuánto producto y caldo preparar para cada parcela, para todas las repeticiones (con 20 % de sobrante) y por mochila, según el volumen de caldo por hectárea.',
    go: () => enEjemplo('trat'), el: () => cardDe($('#t-dosis'))},
  {g: 'En el campo', t: 'Aplicaciones y manejo', d: 'Registro con fecha de todo lo que se aplica o se hace: aplicaciones de los tratamientos, siembra, fertilización, controles y cosecha. El resumen muestra lo realizado, lo planificado y lo próximo.',
    go: () => enEjemplo('aplic'), el: () => $('.kpis')},
  {g: 'En el campo', t: 'Condiciones de aplicación', d: 'Al registrar una pulverización se cargan temperatura, humedad y viento, y la app avisa si quedaron fuera de lo permitido por la Ley 3742/09 (más de 32 °C, menos de 60 % de humedad o viento mayor a 10 km/h), como en esta segunda aplicación.',
    go: () => enEjemplo('aplic'), el: () => conTexto('#panel .apl', 'Fuera de lo permitido')},
  {g: 'En el campo', t: 'Pulverizadora y calibración', d: 'Se carga cada pulverizadora (mochila, barra de parcelas, de arrastre o dron) con sus boquillas por color ISO, la presión y la velocidad. Con el caudal medido de cada pico la app calcula el volumen en L/ha, la uniformidad entre picos, qué boquillas cambiar y a qué velocidad o presión ir para lograr el volumen buscado.',
    go: () => { enEjemplo('aplic'); const d = $('#card-pulv'); if (d) d.open = true; }, el: () => $('#card-pulv')},
  {g: 'En el campo', t: 'Datos de cada pulverización', d: 'En cada aplicación queda el equipo usado, la presión, la velocidad, el volumen, la hora, la dirección del viento, el adyuvante y el pH del agua. Con la temperatura y la humedad la app calcula el ΔT (lo ideal es entre 2 y 8 °C).',
    go: () => enEjemplo('aplic'), el: () => conTexto('#panel .apl', 'Equipo:')},
  {g: 'En el campo', t: 'Lector de papel hidrosensible', d: 'Con la cámara del celular: aparecen líneas guía para alinear el papel, un nivel y el enfoque. La app endereza la foto, aplica un filtro para ver mejor las manchas, mide la cobertura de cada metro lineal y cuenta las gotas en chicas, medianas y grandes (dos gotas pegadas cuentan como dos). También lee fotos o escaneos.',
    go: () => enEjemplo('aplic'), el: () => $('#panel [data-papel]')},
  {g: 'En el campo', t: 'Calidad de aplicación', d: 'Las tarjetas se resumen por tratamiento y posición (tercio superior, inferior, etc.): cobertura, gotas por cm², tamaño de gota y si la densidad alcanza lo recomendado para el producto. Con un toque se pasan a Carga de datos para analizarlas como cualquier medición.',
    go: () => { enEjemplo('aplic'); const d = $('#panel .calidad'); if (d) d.open = true; }, el: () => $('#panel .calidad')},
  {g: 'En el campo', t: 'Croquis de parcelas', d: 'El croquis sorteado por bloques. Cada parcela muestra su tratamiento y cuántas mediciones le faltan; tocándola se abre el control de parcela.',
    go: () => enEjemplo('campo'), el: () => $('#viewer-host')},
  {g: 'En el campo', t: 'Colorear el croquis', d: 'El croquis se puede pintar por tratamiento o por operador asignado, para ver de un vistazo quién controla cada sector.',
    go: () => { enEjemplo('campo'); const c = conTexto('#panel label', 'Color por tratamiento')?.querySelector('input'); if (c && !c.checked) c.click(); }, el: () => cardDe(conTexto('#panel label', 'Color por tratamiento'))},
  {g: 'En el campo', t: 'Control de parcela', d: 'Al tocar una parcela se abre su control: tratamiento, bloque, a quién está asignada y cuántos días pasaron desde la última aplicación.',
    go: () => enParcela(P1()), el: () => $('#drawer header')},
  {g: 'En el campo', t: 'Submuestras y método', d: 'Las mediciones con varias lecturas (10 folíolos, 8 pesadas) se cargan una por una y la app calcula el promedio. Debajo, “Cómo se mide” explica el método y el momento de evaluación, y avisa si un valor queda fuera de rango.',
    go: () => { enParcela(P1()); const dt = $('[data-med="sev_roya"] details'); if (dt) dt.open = true; }, el: () => $('[data-med="sev_roya"]')},
  {g: 'En el campo', t: 'Calculadora de rendimiento', d: 'Se carga el peso del grano cosechado y su humedad; la app corrige a 13 % de humedad y lo lleva a kg/ha con el área cosechada de la parcela.',
    go: () => enParcela(P1()), el: () => $('[data-med="rend_kg"]')},
  {g: 'En el campo', t: 'Notas en tres niveles', d: 'Notas de la parcela, del tratamiento (valen para todas sus parcelas) o del bloque entero. Cada nota guarda autor y fecha y sale en el informe.',
    go: () => enParcela(P1()), el: () => $('#seg-nota')?.parentElement},
  {g: 'En el campo', t: 'Fotos de la parcela', d: 'Desde el celular o la tablet se sacan fotos de cada parcela (o del ensayo completo, en Planificación). Quedan guardadas en el equipo con autor y fecha.',
    go: () => enParcela(P1()), el: () => $('[data-fotos]')?.parentElement},
  {g: 'Datos y equipo', t: 'Mediciones y métodos', d: 'Cada medición trae su método precargado y la fuente. Se puede elegir otro método de una lista, escribir uno propio, cambiar las submuestras o agregar más mediciones del catálogo del rubro.',
    go: () => enEjemplo('medir'), el: () => $('#panel .varc')},
  {g: 'Datos y equipo', t: 'Indicadores propios', d: 'Si una medición no está en el catálogo se crea un indicador propio: nombre, unidad, tipo (número, porcentaje, conteo, escala o texto), rango y método. Queda guardado para otros ensayos.',
    go: () => enEjemplo('medir'), el: () => $('#f-indic')},
  {g: 'Datos y equipo', t: 'Carga de datos', d: 'Una tabla con un renglón por parcela para cargar rápido. Las mediciones con submuestras o calculadora se cargan con “Controlar”. El operador solo puede escribir en sus parcelas.',
    go: () => enEjemplo('datos'), el: () => $('#panel .tw')},
  {g: 'Datos y equipo', t: 'Importar datos', d: 'Los valores también se traen de una planilla Excel o CSV (una fila por parcela) o de una foto de la planilla de campo. La app reconoce la columna de cada medición; antes de guardar se revisa y se marca lo que está fuera de rango.',
    go: () => enEjemplo('datos'), el: () => $('#btn-importar')},
  {g: 'Datos y equipo', t: 'Operadores y asignaciones', d: 'El gerente elige qué operadores trabajan en el ensayo y con qué alcance (todo el ensayo o solo sus parcelas), y reparte bloques o parcelas tocándolas.',
    go: () => enEjemplo('equipo'), el: () => cardDe(conTexto('#panel h3', 'Operadores de este trabajo'))},
  {g: 'Datos y equipo', t: 'Historial y revisión', d: 'Cada cambio queda registrado con quién, cuándo, el valor anterior y el nuevo. Lo que carga un operador queda pendiente hasta que el gerente lo aprueba u observa con un comentario.',
    go: () => enEjemplo('equipo'), el: () => cardDe(conTexto('#panel h3', 'Historial de cambios'))},
  {g: 'Resultados', t: 'Análisis de varianza', d: 'Con todas las parcelas cargadas, la app calcula el ANAVA del diseño en bloques, la media y el coeficiente de variación de cada medición.',
    go: () => { varAnal = 'sev_roya'; enEjemplo('anal'); if ($('#var-anal')?.value !== 'sev_roya') RENDER.anal(EJ_()); }, el: () => $('#anal-body .grid2 > .card')},
  {g: 'Resultados', t: 'Medias, Tukey y eficacia', d: 'Medias con letras de Tukey (las que comparten letra no difieren) y, para enfermedades y plagas, el porcentaje de control respecto del testigo (Abbott).',
    go: () => { varAnal = 'sev_roya'; enEjemplo('anal'); }, el: () => $$('#anal-body .grid2 > .card')[1]},
  {g: 'Resultados', t: 'Lectura automática', d: 'Un párrafo con la interpretación: si hubo diferencias, qué tratamiento fue mejor, con cuáles no difiere y la precisión del ensayo. Sirve de base para el informe.',
    go: () => { varAnal = 'sev_roya'; enEjemplo('anal'); }, el: () => $('#anal-body .callout')},
  {g: 'Resultados', t: 'Informe en Word o PDF', d: 'Un toque genera el informe completo en Word: métodos, tratamientos, aplicaciones y, por cada variable, ANAVA, gráfico, Tukey y la lectura. También se imprime o se guarda como PDF.',
    go: () => enEjemplo('exp'), el: () => $('#ex-word')},
  {g: 'Resultados', t: 'Excel, CSV y QGIS', d: 'La planilla Excel trae todo en hojas; el CSV va directo a InfoStat o R. Con la esquina GPS de la parcela 101 y el rumbo, las parcelas se exportan a QGIS (con colores y etiquetas) o a Google Earth.',
    go: () => enEjemplo('exp'), el: () => $('#ex-qgis')},
  {g: 'Otros rubros y roles', t: 'Pasturas: cortes y producción', d: 'En pasturas se cargan varios cortes: la app calcula la materia seca con los pesos del marco, suma la producción acumulada y la tasa de crecimiento, y grafica la producción por corte de cada cultivar.',
    go: () => { varAnal = null; enEjemplo('anal', PA_()); }, el: () => $('#g-cortes')},
  {g: 'Otros rubros y roles', t: 'Lo que ve un operador', d: 'Ana es operadora: al entrar ve “Mis tareas”, solo con sus parcelas y lo que le falta medir, y las abre directo con “Controlar”.',
    go: () => { cerrarDrawer(); comoUsuario('ana', 'agricola'); irInicio(); }, el: () => cardDe($('#s-inicio [data-abrir="DEMO-AG-02"]'))},
  {g: 'Lado a lado y dron', t: 'Lado a lado en la chacra del productor', d: 'Además del ensayo experimental, se puede crear un lado a lado: el producto que se quiere probar contra el que usa el productor (y si se quiere una franja testigo), en macroparcelas o microparcelas dentro de su lote. No es un ensayo experimental, sirve para probar la eficacia a campo.',
    go: () => { if (!LAL_()) return; cerrarDrawer(); comoUsuario('marta', 'agricola'); irInicio(); }, el: () => cardDe($('#s-inicio [data-abrir="DEMO-LAL-01"]')), si: () => !!LAL_()},
  {g: 'Lado a lado y dron', t: 'Franjas desde el GPS', d: 'Las franjas se generan desde tu ubicación (parado en la esquina de inicio, con el rumbo y las medidas), caminando y marcando las 4 esquinas, o tocando las esquinas sobre el mapa satelital. La app dibuja el área y la divide en franjas iguales, con su superficie.',
    go: () => { if (!LAL_()) return; enEjemplo('campo', LAL_()); }, el: () => cardDe($('#lal-gps')) || $('#lal-mapa'), si: () => !!LAL_()},
  {g: 'Lado a lado y dron', t: 'Comparación directa', d: 'Cada medición del producto probado frente al del productor: diferencia y porcentaje, quién fue mejor, la eficacia respecto del testigo y, en rendimiento, si la diferencia paga el costo extra del producto. El informe en Word trae esta comparación con gráficos y una conclusión.',
    go: () => { if (!LAL_()) return; varLal = 'rend_kg'; enEjemplo('anal', LAL_()); }, el: () => $('#panel .card'), si: () => !!LAL_()},
  {g: 'Lado a lado y dron', t: 'Foto aérea del dron por bloque', d: 'No hace falta un dron multiespectral: se carga una foto común tomada desde arriba, se marcan las 4 esquinas del ensayo y, con las medidas del croquis, la app recorta la imagen de cada bloque (o de cada franja). Queda como foto general del ensayo, en el control de cada parcela y en el informe.',
    go: () => { enEjemplo('campo'); setTimeout(() => $('#card-aerea')?.scrollIntoView({block: 'center'}), 50); }, el: () => $('#card-aerea')},
  {g: 'Varios lugares', t: 'Un ensayo en varios lugares', d: 'El mismo ensayo se puede repetir en distintos puntos del país: cada lugar tiene su croquis sorteado, su operador y su avance. Este ejemplo, una red de cultivares de soja, está en Hohenau, Naranjal y San Pedro, con un operador en cada lugar. Se suman lugares desde Equipo o al crear el ensayo.',
    go: () => { if (!RED_()) return; S.sitio = 'todos'; enEjemplo('equipo', RED_()); }, el: () => cardDe(conTexto('#panel h3', 'Lugares del ensayo')) || $('#panel .sitios'), si: () => !!RED_()},
  {g: 'Varios lugares', t: 'Elegir el lugar', d: 'Arriba se elige qué lugar mirar: “Todos” muestra la red completa y cada lugar muestra su croquis, sus datos y sus aplicaciones. El operador entra directo a su lugar (marcado con ★).',
    go: () => { if (!RED_()) return; enEjemplo('campo', RED_()); }, el: () => $('#seg-sitio'), si: () => !!RED_()},
  {g: 'Varios lugares', t: 'Análisis de la red', d: 'Con “Todos”, el análisis combina los lugares: ANAVA combinado (lugares, bloques dentro de lugares, tratamientos e interacción tratamiento × lugar), medias de cada lugar y Tukey. Si se elige un lugar, se analiza solo. El Word trae las dos cosas.',
    go: () => { if (!RED_()) return; S.sitio = 'todos'; varAnal = 'rend_kg'; enEjemplo('anal', RED_()); RENDER.anal(RED_()); }, el: () => $('#anal-body .card'), si: () => !!RED_()},
  {g: 'Varios lugares', t: 'Enviar y recibir trabajo', d: 'Como cada uno usa la app en su celular, el gerente le manda el ensayo al operador por WhatsApp o correo; el operador carga sus datos sin internet y devuelve el archivo. Al recibirlo, la app suma lo nuevo sin borrar nada y lo deja para revisar.',
    go: () => { if (!RED_()) return; S.sitio = 'todos'; enEjemplo('equipo', RED_()); }, el: () => $('#card-intercambio'), si: () => !!RED_()},
  {g: 'Varios lugares', t: 'Entrar como observador', d: 'Un observador (por ejemplo un cliente o un técnico de la empresa) ve todos los avances, datos, análisis e informes, pero no puede modificar nada. Se suma desde Equipo → “Sumar un observador”. Lucía es la observadora del ejemplo.',
    go: () => { cerrarDrawer(); comoUsuario('lucia', 'agricola'); irInicio(); }, el: () => cardDe($('#s-inicio [data-abrir="DEMO-AG-01"]')) || $('#s-inicio'), si: () => !!USERS.lucia && !!RED_()},
  {g: 'Otros rubros y roles', t: 'Ayuda siempre a mano', d: 'Desde este botón se vuelve al recorrido o se va directo a cualquier función. ¡Listo! Ya podés explorar la app por tu cuenta con cualquiera de las cuentas de ejemplo.',
    go: () => { comoUsuario('marta', 'agricola'); irInicio(); }, el: () => $('#btn-ayuda')}
];
const TR = {i: -1};
function tourPos() {
  if (TR.i < 0) return; const st = TOUR[TR.i], el = TR.el, hole = $('#tour-hole'), pop = $('#tour-pop'), vw = innerWidth, vh = innerHeight, m = 8;
  let r = el && el.isConnected ? el.getBoundingClientRect() : null;
  if (!r || (!r.width && !r.height)) { hole.style.cssText = `top:${vh / 2}px;left:${vw / 2}px;width:0;height:0`; r = null; }
  else { const t = Math.max(m, r.top - 6), l = Math.max(m, r.left - 6), rr = Math.min(vw - m, r.right + 6); let b = Math.min(vh - m, r.bottom + 6);
    if (b - t > vh * 0.55) b = t + vh * (vw < 640 ? 0.42 : 0.5);
    hole.style.cssText = `top:${t}px;left:${l}px;width:${Math.max(0, rr - l)}px;height:${Math.max(0, b - t)}px`; r = {top: t, left: l, bottom: b, right: rr}; }
  const pw = pop.offsetWidth, ph = pop.offsetHeight; let x, y;
  if (!r) { x = (vw - pw) / 2; y = (vh - ph) / 2; }
  else if (vw < 640) { x = (vw - pw) / 2; y = (r.bottom + ph + 12 < vh) ? r.bottom + 10 : (r.top - ph - 10 > 0 ? r.top - ph - 10 : vh - ph - 12); }
  else { const cl = cy => Math.min(Math.max(m, cy), vh - ph - m), lx = Math.min(Math.max(m, r.left), vw - pw - m);
    const cand = [[r.right + 14, cl(r.top)], [r.left - pw - 14, cl(r.top)], [lx, r.bottom + 12], [lx, r.top - ph - 12]];
    const ok = ([cx, cy]) => cx >= m && cx + pw <= vw - m && cy + ph <= vh - m && cy >= m;
    const fit = cand.find(ok);
    [x, y] = fit || [vw - pw - 16, vh - ph - 16]; }
  pop.style.left = Math.round(Math.max(m, Math.min(x, vw - pw - m))) + 'px'; pop.style.top = Math.round(Math.max(m, y)) + 'px';
}
async function tourEmpezar(i = 0) {
  if (!EJ_() || !PA_() || !USERS.marta || !USERS.ana) {
    if (!await confirmar('Faltan los ejemplos', 'El recorrido se hace sobre los ensayos de ejemplo, que fueron quitados de este equipo. ¿Los vuelvo a cargar? Tus ensayos no se tocan.', {ok: 'Cargar ejemplos'})) return;
    await cargarEjemplos();
  }
  TR.antes = {user: S.user?.id, rubro: S.rubro, T: S.T?.id, paso: S.paso, pantalla: ['bienvenida', 'rubro', 'inicio', 'nuevo', 'ensayo'].find(x => !$('#s-' + x).hidden)};
  tourIr(i);
}
function tourIr(i) {
  const d = i < TR.i ? -1 : 1; while (i > 0 && i < TOUR.length - 1 && TOUR[i].si && !TOUR[i].si()) i += d;
  TR.i = Math.max(0, Math.min(TOUR.length - 1, i)); const st = TOUR[TR.i];
  $('#ayuda').hidden = true; $('#tour').hidden = false;
  try { st.go(); } catch (e) { console.warn('recorrido', e); }
  $('#tour-grupo').textContent = st.g; $('#tour-n').textContent = `${TR.i + 1} de ${TOUR.length}`; $('#tour-t').textContent = st.t; $('#tour-d').textContent = st.d;
  $('#tour-prog').style.width = ((TR.i + 1) / TOUR.length * 100) + '%'; $('#tour-prev').disabled = TR.i === 0; $('#tour-prev').style.visibility = TR.i ? 'visible' : 'hidden';
  $('#tour-next').textContent = TR.i === TOUR.length - 1 ? 'Terminar' : 'Siguiente →';
  requestAnimationFrame(() => { TR.el = st.el(); if (TR.el) { const big = TR.el.offsetHeight > innerHeight * 0.35; TR.el.scrollIntoView({block: big ? 'start' : 'center', inline: 'nearest'}); if (big && !TR.el.closest('#drawer')) scrollBy(0, -70); }
    requestAnimationFrame(() => { tourPos(); $('#tour-next').focus({preventScroll: true}); }); });
}
function tourSalir() {
  TR.i = -1; $('#tour').hidden = true; cerrarDrawer(); const a = TR.antes; TR.antes = null;
  if (a) { S.user = a.user && USERS[a.user] ? USERS[a.user] : null; S.rubro = a.rubro; const T = a.T && byId(a.T);
    if (!S.user) pantalla('bienvenida'); else if (a.pantalla === 'ensayo' && T && rolEn(T)) abrir(T, PASOS[a.paso]?.[0]); else if (a.pantalla === 'rubro' || !S.rubro) irRubro(); else irInicio(); }
  pintarGuardado(); guardarPronto();
}
$('#tour-next').onclick = () => TR.i === TOUR.length - 1 ? (tourSalir(), toast('Recorrido terminado')) : tourIr(TR.i + 1);
$('#tour-prev').onclick = () => tourIr(TR.i - 1);
$('#tour-x').onclick = tourSalir;
$('#tour-idx').onclick = () => { $('#tour').hidden = true; abrirAyuda(); };
addEventListener('resize', () => tourPos()); addEventListener('scroll', () => tourPos(), true);
addEventListener('keydown', e => { if (TR.i < 0) { if (e.key === 'Escape' && !$('#ayuda').hidden) { $('#ayuda').hidden = true; e.stopPropagation(); } return; }
  if (!$('#ayuda').hidden) { if (e.key === 'Escape') { $('#ayuda').hidden = true; tourSalir(); e.stopPropagation(); } return; }
  if (e.key === 'Escape') { tourSalir(); e.stopPropagation(); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { $('#tour-next').click(); e.preventDefault(); } else if (e.key === 'ArrowLeft' && TR.i > 0) { tourIr(TR.i - 1); e.preventDefault(); } }, true);
function abrirAyuda() {
  const grupos = [...new Set(TOUR.map(x => x.g))];
  $('#ayuda-empezar').textContent = `Empezar el recorrido (${TOUR.length} funciones)`;
  $('#ayuda-inst').hidden = false;
  $('#ayuda-lista').innerHTML = grupos.map(g => `<section><h3>${g}</h3>${TOUR.map((x, i) => x.g === g ? `<button data-ti="${i}"><span class="n">${i + 1}</span><span>${esc(x.t)}</span></button>` : '').join('')}</section>`).join('');
  $('#ayuda').hidden = false; $('#ayuda-empezar').focus();
}
$('#btn-ayuda').onclick = abrirAyuda; $('#ayuda-inst').onclick = () => { $('#ayuda').hidden = true; abrirInstalar(); }; $('#btn-compartir-ini').onclick = () => abrirInstalar(); $('#btn-recibir-ini').onclick = () => recibirArchivo(); $('#btn-tour-inicio').onclick = () => tourEmpezar(0);
$('#ayuda-x').onclick = () => { $('#ayuda').hidden = true; if (TR.i >= 0) tourSalir(); };
$('#ayuda').onclick = e => { if (e.target.id === 'ayuda') { $('#ayuda').hidden = true; if (TR.i >= 0) tourSalir(); } const b = e.target.closest('[data-ti]'); if (b) { $('#ayuda').hidden = true; TR.i < 0 ? tourEmpezar(+b.dataset.ti) : tourIr(+b.dataset.ti); } };
$('#ayuda-empezar').onclick = () => { $('#ayuda').hidden = true; tourEmpezar(0); };
pintarGuardado();

/* ================= arranque ================= */
if (!GUARD?.config) await guardarAhora(); else marcarGuardados();
DB.pedirPersistencia();
pintarGuardado(); listaCuentas(); pantalla('bienvenida');
const h = location.hash.slice(1);
if (USERS[h]) entrar(USERS[h]); // atajo: #marta, #ana, #luis, #carlos
else if (h === 'tour') tourEmpezar(0); else if (h === 'ayuda') abrirAyuda();
else if (SESION?.user && USERS[SESION.user]) { S.user = USERS[SESION.user]; if (SESION.rubro && RUBROS[SESION.rubro]) { S.rubro = SESION.rubro; irInicio(); } else irRubro(); }
$('#carga')?.remove(); try { sessionStorage.removeItem('ec-recarga'); } catch (e) {}
/* ================= app instalable y sin internet ================= */
let pedidoInstalar = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; $('#btn-instalar').hidden = false; });
addEventListener('appinstalled', () => { $('#btn-instalar').hidden = true; toast('App instalada: la encontrás en el menú Inicio o en el escritorio'); });
$('#btn-instalar').onclick = async () => { if (!pedidoInstalar) return; pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; $('#btn-instalar').hidden = true; };
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const habia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then(r => { r.onupdatefound = () => { const n = r.installing; n && (n.onstatechange = () => { if (n.state === 'activated' && habia) toast('La app se actualizó: los cambios se ven la próxima vez que la abras'); }); }; }).catch(e => console.warn('Sin modo sin conexión:', e.message));
}
