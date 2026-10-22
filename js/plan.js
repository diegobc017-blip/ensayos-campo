// plan.js — calendario de evaluaciones de un ensayo: estadios estimados desde la siembra (o plantación / trasplante),
// mediciones que pide cada estadio (normas SENAVE por especie o recomendadas para el tipo de ensayo), evaluaciones a los días
// de cada aplicación y avisos de lo que hay que medir. Funciones puras: reciben el ensayo y los datos de fenología.
const DIA = 864e5;
export const addDias = (f, d) => new Date(Date.parse(f + 'T12:00:00') + d * DIA).toISOString().slice(0, 10);
export const difDias = (a, b) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(b + 'T12:00:00')) / DIA);
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const corto = s => norm(s).split(' (')[0];
const APLIC = ['Aplicación de tratamientos'];

// Datos de fenología del cultivo del ensayo (nombre exacto o parecido)
export function fenDe(FEN, rubro, cultivo) {
  const R = FEN?.[rubro]; if (!R || !cultivo) return null; if (R[cultivo]) return R[cultivo];
  const n = norm(cultivo), ks = Object.keys(R);
  const k = ks.find(k => norm(k) === n) || ks.find(k => corto(k) === corto(cultivo)) || ks.find(k => n.includes(corto(k)) || norm(k).includes(corto(cultivo)));
  if (k) return R[k];
  // ensayos con varias especies o una no listada: el calendario de la especie de referencia del rubro
  const REF = {pasturas: 'Urochloa brizantha (Marandu, Xaraés, Piatã)'}; return REF[rubro] && R[REF[rubro]] ? {...R[REF[rubro]], _ref: REF[rubro].split(' (')[0]} : null;
}
// Fecha desde la que se cuentan los días: ficha del ensayo o registro de labores
export function fechaRef(T, F) {
  const f = T.ficha || {}, ref = F?.referencia || 'siembra';
  const sem = (T.aplicaciones || []).filter(a => a.tipo === 'Siembra o plantación' && a.fecha && a.estado === 'realizada').map(a => a.fecha).sort()[0];
  if (ref === 'plantacion') { if (f.plantacion) return {fecha: f.plantacion, que: 'plantación', campo: 'plantacion'}; }
  else if (ref === 'trasplante') { if (f.trasplante) return {fecha: f.trasplante, que: 'trasplante', campo: 'trasplante'}; }
  else if (ref === 'corte_uniformizacion') { if (T.uniformizacion) return {fecha: T.uniformizacion, que: 'corte de uniformización'}; }
  if (f.siembra) return {fecha: f.siembra, que: 'siembra', campo: 'siembra'};
  if (f.plantacion) return {fecha: f.plantacion, que: 'plantación', campo: 'plantacion'};
  if (f.trasplante) return {fecha: f.trasplante, que: 'trasplante', campo: 'trasplante'};
  if (sem) return {fecha: sem, que: ref === 'plantacion' ? 'plantación' : 'siembra', fuente: 'labores'};
  return null;
}
export const cicloDe = (T, F) => { const c = F?.ciclos || ['medio']; return c.includes(T.plan?.ciclo) ? T.plan.ciclo : c.includes('medio') ? 'medio' : c[0]; };
// Estadios con su fecha: la estimada desde la referencia, corrida por el último estadio observado en el campo
export function estadios(T, F) {
  if (!F?.estadios?.length) return [];
  const r = fechaRef(T, F), ciclo = cicloDe(T, F), obs = T.plan?.obs || {}; let delta = 0;
  return F.estadios.map(e => {
    const d = e.dias ? (e.dias[ciclo] ?? e.dias.medio ?? Object.values(e.dias)[0]) : null;
    const est = r && d != null ? addDias(r.fecha, d + delta) : null;
    if (obs[e.cod]) { if (est) delta += difDias(obs[e.cod], est); return {...e, dia: d, fecha: obs[e.cod], obs: true}; }
    return {...e, dia: d, fecha: est, obs: false};
  });
}
export const tipoOk = (lista, tipo) => !lista || !lista.length || lista.some(t => norm(t) === norm(tipo) || corto(t) === corto(tipo));
const etiq = s => norm(s).replace(/[^a-z0-9.+]/g, '');
// A qué medición del ensayo va una evaluación: la del momento (si la medición se repite), la medición sola o ninguna
export function destino(T, base, etiqueta) {
  const mv = T.momVar?.[base];
  if (mv) { const k = mv.findIndex(l => etiq(l) === etiq(etiqueta)); return k >= 0 && T.variables.some(v => v.id === `${base}_m${k + 1}`) ? {id: `${base}_m${k + 1}`} : {falta: 'momento'}; }
  if (T.variables.some(v => v.id === base && !v.corte && !v.pos)) return {id: base};
  if ((T.porCorte || []).includes(base)) return {corte: true};
  return {falta: 'medicion'};
}
const tieneValor = (p, id) => p.valores?.[id] != null && p.valores[id] !== '';
// Ítems del calendario. opts: {hoy, parcelas (las que importan), defs (id → definición de medición del catálogo)}
export function itemsPlan(T, F, opts = {}) {
  const hoy = opts.hoy, ps = opts.parcelas || T.parcelas, out = [];
  if (!F) return out;
  const E = estadios(T, F), porCod = new Map(E.map(e => [norm(e.cod), e])), porNom = new Map(E.map(e => [norm(e.nombre), e]));
  const est = s => porCod.get(norm(s)) || porNom.get(norm(s)) || E.find(e => norm(s).startsWith(norm(e.cod) + ' ') || norm(e.nombre).startsWith(norm(s)));
  const push = (o) => out.push(o);
  (F.evaluaciones || []).filter(ev => tipoOk(ev.tipos, T.tipo)).forEach((ev, i) => {
    const e = est(ev.estadio); if (!e) return;
    const vars = ev.var ? [ev.var] : ev.var_nueva ? [ev.var_nueva.id] : [];
    const base = {fuente: ev.fuente, norma: ev.norma, nota: ev.nota, por: ev.por || 'recomendada', que: ev.que, vars, estadio: e.cod, estNom: e.nombre, obs: e.obs, nueva: ev.var_nueva};
    if (ev.repetir_cada_dias && e.fecha) {
      const fin = ev.hasta_estadio ? est(ev.hasta_estadio)?.fecha : null, lim = fin || addDias(e.fecha, ev.repetir_cada_dias * 12);
      for (let k = 0, f = e.fecha; f <= lim && k < 30; k++, f = addDias(f, ev.repetir_cada_dias))
        push({...base, key: `e${i}r${k}`, fecha: f, etiqueta: `${e.cod}${k ? ' + ' + k * ev.repetir_cada_dias + ' d' : ''}`, repetido: k + 1});
    } else push({...base, key: `e${i}`, fecha: e.fecha, etiqueta: e.cod});
  });
  // evaluaciones a los días de cada aplicación de los tratamientos
  const pa = Object.entries(F.por_aplicacion || {}).find(([t]) => tipoOk([t], T.tipo))?.[1];
  if (pa) {
    const aps = (T.aplicaciones || []).filter(a => APLIC.includes(a.tipo) && a.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
    aps.forEach((a, i) => (pa.dias || []).forEach(d => push({key: `a${a.id ?? i}d${d}`, fecha: addDias(a.fecha, d), etiqueta: `${d} DAA${aps.length > 1 && i ? ' · aplic. ' + (i + 1) : ''}`,
      que: d === 0 ? 'Evaluación previa (precuento), el mismo día y antes de aplicar' : `Evaluación a los ${d} días de la aplicación ${i + 1}`, vars: pa.vars || [], por: 'recomendada', nota: pa.nota, daa: d, aplic: i + 1, tentativa: a.estado !== 'realizada'})));
    if (!aps.length) push({key: 'a-sin', fecha: null, etiqueta: 'DAA', que: `Registrá cada aplicación de los tratamientos en “Aplicaciones y manejo”: se evalúa a los ${(pa.dias || []).join(', ')} días de cada una`, vars: pa.vars || [], por: 'recomendada', daa: true});
  }
  // estado de cada ítem
  out.forEach(it => {
    it.dest = it.vars.map(b => ({base: b, ...destino(T, b, it.etiqueta)}));
    // mediciones por corte: cuenta como hecha si hay un corte cargado cerca de esa fecha
    it.dest.filter(d => d.corte && it.fecha).forEach(d => { const c = (T.cortes || []).find(c => Math.abs(difDias(c.fecha, it.fecha)) <= 25 && T.variables.some(v => v.id === `${d.base}_c${c.n}`));
      if (c) { d.id = `${d.base}_c${c.n}`; d.corte = false; } });
    const ids = it.dest.filter(d => d.id).map(d => d.id);
    const hecho = ids.length && ids.every(id => ps.length && ps.every(p => tieneValor(p, id) && (!it.repetido || !p.ts?.[id] || p.ts[id].slice(0, 10) >= addDias(it.fecha, -3))));
    const parcial = ids.some(id => ps.some(p => tieneValor(p, id)));
    const enEnsayo = it.dest.some(d => d.id || d.corte);
    it.estado = hecho ? 'hecha' : !enEnsayo ? 'fuera' : !it.fecha ? 'sin_fecha' : !hoy ? 'futura'
      : difDias(it.fecha, hoy) < -5 ? 'atrasada' : difDias(it.fecha, hoy) <= 3 ? 'ahora' : difDias(it.fecha, hoy) <= 14 ? 'proxima' : 'futura';
    it.parcial = !hecho && parcial;
  });
  return out.sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999') || (a.daa === true) - (b.daa === true));
}
// Momentos en que se repite cada medición del ensayo según el plan (para crear "Severidad · R3", "· R5", …)
export function momentosSugeridos(T, F, varsIds) {
  const m = {}; if (!F) return m;
  const est = new Map((F.estadios || []).map((e, i) => [norm(e.cod), i]));
  (F.evaluaciones || []).filter(ev => tipoOk(ev.tipos, T.tipo) && !ev.repetir_cada_dias && varsIds.includes(ev.var)).forEach(ev => (m[ev.var] = m[ev.var] || []).push([est.get(norm(ev.estadio)) ?? 99, ev.estadio]));
  const pa = Object.entries(F.por_aplicacion || {}).find(([t]) => tipoOk([t], T.tipo))?.[1];
  if (pa) (pa.vars || []).filter(v => varsIds.includes(v)).forEach(v => { if (!m[v]) m[v] = (pa.dias || []).map(d => [1000 + d, `${d} DAA`]); });
  const out = {}; Object.entries(m).forEach(([v, l]) => { const u = [...new Map(l.sort((a, b) => a[0] - b[0]).map(x => [etiq(x[1]), x[1]])).values()]; if (u.length >= 2) out[v] = u; });
  return out;
}
// Épocas de siembra del cultivo y si la fecha cae dentro
export function epocaDe(F, fecha) {
  const ep = F?.epocas || []; if (!fecha || !ep.length) return {ep, dentro: null};
  const md = fecha.slice(5), en = e => e.desde && e.hasta && (e.desde <= e.hasta ? md >= e.desde && md <= e.hasta : md >= e.desde || md <= e.hasta);
  const ok = ep.filter(en); return {ep, dentro: ok.length > 0, cual: ok};
}
