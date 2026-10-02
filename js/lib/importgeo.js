// importgeo.js — leer y escribir ubicaciones de parcelas: QGIS (GeoJSON, Shapefile .zip), Google Earth (KML/KMZ),
// GPS (GPX) y planillas (CSV). Todo queda en WGS 84 (lat/lon); las coordenadas UTM (p. ej. 21 S o 20 S, comunes en
// Paraguay, WGS 84 o SIRGAS 2000) se convierten solas. Sin DOM salvo KML/GPX (DOMParser).

/* ---------------- proyecciones ---------------- */
export function utmALatLon(E, N, zona, sur) { // WGS 84 / SIRGAS 2000 (diferencia < 1 m)
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const x = E - 500000, y = sur ? N - 10000000 : N, M = y / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const fp = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(fp), c = Math.cos(fp), t = Math.tan(fp), C1 = ep2 * c * c, T1 = t * t, R1 = a * (1 - e2) / (1 - e2 * s * s) ** 1.5, N1 = a / Math.sqrt(1 - e2 * s * s), D = x / (N1 * k0);
  const lat = fp - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = ((zona - 1) * 6 - 177) * Math.PI / 180 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c;
  return [lat * 180 / Math.PI, lon * 180 / Math.PI];
}
export function latLonAUtm(lat, lon, zona = Math.floor((lon + 180) / 6) + 1) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), fi = lat * Math.PI / 180, l0 = ((zona - 1) * 6 - 177) * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(fi) ** 2), T = Math.tan(fi) ** 2, C = ep2 * Math.cos(fi) ** 2, A = Math.cos(fi) * (lon * Math.PI / 180 - l0);
  const M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * fi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * fi) + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * fi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * fi));
  const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let Nn = k0 * (M + N * Math.tan(fi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720)); if (lat < 0) Nn += 10000000;
  return [E, Nn, zona, lat < 0];
}
// Reconoce el sistema de coordenadas en un .prj, en el "crs" de un GeoJSON o en un código EPSG
export function crsDe(texto) {
  const t = String(texto || ''); if (!t) return null;
  let m = t.match(/UTM[ _]?zone[ _]?(\d{1,2})\s*([NS])/i); if (m) return {tipo: 'utm', zona: +m[1], sur: m[2].toUpperCase() === 'S', nombre: `UTM ${m[1]} ${m[2].toUpperCase()}`};
  m = t.match(/EPSG\D{0,3}(\d{4,5})/i) || t.match(/^\s*(\d{4,5})\s*$/);
  if (m) { const c = +m[1]; if (c === 4326 || c === 4674 || c === 4258 || c === 4269) return {tipo: 'geo', nombre: c === 4674 ? 'SIRGAS 2000' : 'WGS 84'};
    if (c >= 32601 && c <= 32660) return {tipo: 'utm', zona: c - 32600, sur: false, nombre: `UTM ${c - 32600} N`};
    if (c >= 32701 && c <= 32760) return {tipo: 'utm', zona: c - 32700, sur: true, nombre: `UTM ${c - 32700} S`};
    if (c >= 31978 && c <= 31985) return {tipo: 'utm', zona: c - 31960, sur: true, nombre: `UTM ${c - 31960} S (SIRGAS 2000)`}; }
  if (/GEOGCS/i.test(t) && !/PROJCS/i.test(t)) return {tipo: 'geo', nombre: /SIRGAS/i.test(t) ? 'SIRGAS 2000' : 'WGS 84'};
  if (/CRS84|WGS ?84/i.test(t) && !/UTM/i.test(t)) return {tipo: 'geo', nombre: 'WGS 84'};
  return null;
}
const pareceGrados = pts => pts.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90);

/* ---------------- zip (para Shapefile .zip y KMZ) ---------------- */
async function inflar(u8) { const ds = new DecompressionStream('deflate-raw'), r = new Blob([u8]).stream().pipeThrough(ds); return new Uint8Array(await new Response(r).arrayBuffer()); }
export async function leerZip(buf) {
  const u8 = new Uint8Array(buf), v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), td = new TextDecoder(); let e = u8.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) throw new Error('El archivo .zip está dañado');
  const n = v.getUint16(e + 10, true), out = {}; let p = v.getUint32(e + 16, true);
  for (let i = 0; i < n; i++) { if (v.getUint32(p, true) !== 0x02014b50) break;
    const met = v.getUint16(p + 10, true), cs = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const nombre = td.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    const ini = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), dat = u8.subarray(ini, ini + cs);
    if (!nombre.endsWith('/')) out[nombre] = met === 0 ? dat : met === 8 ? await inflar(dat) : null; }
  return out;
}

/* ---------------- lectores ---------------- */
const pol = (anillo, props = {}) => ({tipo: 'pol', anillo: cerrar(anillo), props});
const pto = (p, props = {}) => ({tipo: 'pt', punto: p, props});
const cerrar = a => { const r = a.map(([x, y]) => [+x, +y]); if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([...r[0]]); return r; };
const areaPlano = r => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };

export function leerGeoJSON(texto) {
  const js = typeof texto === 'string' ? JSON.parse(texto) : texto, feats = [];
  const geom = (g, props) => { if (!g) return; const c = g.coordinates;
    if (g.type === 'Polygon') feats.push(pol(c[0], props));
    else if (g.type === 'MultiPolygon') { const r = c.map(p => p[0]).sort((a, b) => Math.abs(areaPlano(b)) - Math.abs(areaPlano(a)))[0]; if (r) feats.push(pol(r, props)); }
    else if (g.type === 'Point') feats.push(pto(c, props));
    else if (g.type === 'MultiPoint') c.forEach(q => feats.push(pto(q, props)));
    else if (g.type === 'LineString') { if (c.length >= 4 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) feats.push(pol(c, props)); else c.forEach(q => feats.push(pto(q, props))); }
    else if (g.type === 'GeometryCollection') g.geometries.forEach(x => geom(x, props)); };
  if (js.type === 'FeatureCollection') js.features.forEach(f => geom(f.geometry, f.properties || {}));
  else if (js.type === 'Feature') geom(js.geometry, js.properties || {}); else geom(js, {});
  return {feats, crs: crsDe(js.crs?.properties?.name || '')};
}
function leerDbf(u8, dec) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = v.getUint32(4, true), hl = v.getUint16(8, true), rl = v.getUint16(10, true), campos = [];
  for (let p = 32; p < hl - 1 && u8[p] !== 0x0D; p += 32) { let k = 0; while (k < 11 && u8[p + k]) k++; campos.push({n: new TextDecoder('latin1').decode(u8.subarray(p, p + k)), t: String.fromCharCode(u8[p + 11]), l: u8[p + 16]}); }
  const filas = []; for (let r = 0; r < n; r++) { const b = hl + r * rl, o = {}; let p = b + 1;
    for (const c of campos) { const s = dec(u8.subarray(p, p + c.l)).trim(); p += c.l; o[c.n] = (c.t === 'N' || c.t === 'F') ? (s === '' ? null : +s) : s; } filas.push(o); }
  return filas;
}
export function leerShp(shp, dbf, prj, cpg) {
  const v = new DataView(shp.buffer, shp.byteOffset, shp.byteLength), feats = [];
  let dec = s => new TextDecoder('latin1').decode(s);
  if (/utf-?8/i.test(cpg || '')) dec = s => new TextDecoder('utf-8').decode(s);
  else if (!cpg && dbf) { try { const t = new TextDecoder('utf-8', {fatal: true}); t.decode(dbf); dec = s => new TextDecoder('utf-8').decode(s); } catch (e) {} }
  const props = dbf ? leerDbf(dbf, dec) : [];
  let p = 100, i = 0;
  while (p + 8 <= shp.byteLength) { const len = v.getInt32(p + 4) * 2, c = p + 8, tipo = len >= 4 ? v.getInt32(c, true) : 0, pr = props[i] || {}; i++;
    if ([5, 15, 25, 3, 13, 23].includes(tipo)) { const np = v.getInt32(c + 36, true), nP = v.getInt32(c + 40, true), partes = [];
      for (let k = 0; k < np; k++) partes.push(v.getInt32(c + 44 + 4 * k, true)); partes.push(nP);
      const base = c + 44 + 4 * np, anillos = [];
      for (let k = 0; k < np; k++) { const r = []; for (let j = partes[k]; j < partes[k + 1]; j++) r.push([v.getFloat64(base + 16 * j, true), v.getFloat64(base + 16 * j + 8, true)]); anillos.push(r); }
      const r = anillos.sort((a, b) => Math.abs(areaPlano(b)) - Math.abs(areaPlano(a)))[0];
      if (r) { if ([5, 15, 25].includes(tipo) || (r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1])) feats.push(pol(r, pr)); else r.forEach(q => feats.push(pto(q, pr))); } }
    else if ([1, 11, 21].includes(tipo)) feats.push(pto([v.getFloat64(c + 4, true), v.getFloat64(c + 12, true)], pr));
    else if ([8, 18, 28].includes(tipo)) { const nP = v.getInt32(c + 36, true); for (let j = 0; j < nP; j++) feats.push(pto([v.getFloat64(c + 40 + 16 * j, true), v.getFloat64(c + 48 + 16 * j, true)], pr)); }
    p = c + len; }
  return {feats, crs: crsDe(prj || '')};
}
function kmlTexto(el, tag) { const x = el.getElementsByTagName(tag)[0]; return x ? x.textContent.trim() : ''; }
const coordsKml = t => t.trim().split(/\s+/).map(s => s.split(',').map(Number)).filter(c => c.length >= 2 && isFinite(c[0]) && isFinite(c[1])).map(c => [c[0], c[1]]);
export function leerKml(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml'), feats = [];
  for (const pm of doc.getElementsByTagName('Placemark')) { const props = {}; const nom = kmlTexto(pm, 'name'); if (nom) props.name = nom;
    for (const d of pm.getElementsByTagName('Data')) props[d.getAttribute('name')] = kmlTexto(d, 'value');
    for (const d of pm.getElementsByTagName('SimpleData')) props[d.getAttribute('name')] = d.textContent.trim();
    const ps = pm.getElementsByTagName('Polygon');
    if (ps.length) { const rs = [...ps].map(p => coordsKml(kmlTexto(p.getElementsByTagName('outerBoundaryIs')[0] || p, 'coordinates'))).sort((a, b) => Math.abs(areaPlano(b)) - Math.abs(areaPlano(a))); if (rs[0]?.length >= 3) feats.push(pol(rs[0], props)); continue; }
    const ls = pm.getElementsByTagName('LineString')[0]; if (ls) { const c = coordsKml(kmlTexto(ls, 'coordinates')); if (c.length >= 3) feats.push(pol(c, props)); continue; }
    const pt = pm.getElementsByTagName('Point')[0]; if (pt) { const c = coordsKml(kmlTexto(pt, 'coordinates'))[0]; if (c) feats.push(pto(c, props)); } }
  return {feats, crs: {tipo: 'geo', nombre: 'WGS 84'}};
}
export function leerGpx(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml'), feats = [], ll = e => [+e.getAttribute('lon'), +e.getAttribute('lat')];
  for (const w of doc.getElementsByTagName('wpt')) feats.push(pto(ll(w), {name: kmlTexto(w, 'name')}));
  for (const t of [...doc.getElementsByTagName('trk'), ...doc.getElementsByTagName('rte')]) { const pts = [...t.getElementsByTagName('trkpt'), ...t.getElementsByTagName('rtept')].map(ll); if (pts.length >= 3) feats.push(pol(pts, {name: kmlTexto(t, 'name')})); }
  return {feats, crs: {tipo: 'geo', nombre: 'WGS 84'}};
}
export function leerCsv(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()), sep = [';', '\t', ','].sort((a, b) => lineas[0].split(b).length - lineas[0].split(a).length)[0];
  const cab = lineas[0].split(sep).map(s => s.trim().replace(/^"|"$/g, '')), low = cab.map(c => c.toLowerCase());
  const iy = low.findIndex(c => /^(lat|latitud|latitude|y|norte|northing|n)$/.test(c)), ix = low.findIndex(c => /^(lon|lng|long|longitud|longitude|x|este|easting|e)$/.test(c));
  if (iy < 0 || ix < 0) throw new Error('La planilla necesita columnas de latitud y longitud (o X e Y)');
  const num = s => { s = String(s ?? '').trim().replace(/^"|"$/g, ''); return +(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s); };
  const filas = lineas.slice(1).map(l => l.split(sep)).map(c => ({p: [num(c[ix]), num(c[iy])], props: Object.fromEntries(cab.map((h, i) => [h, (c[i] ?? '').trim().replace(/^"|"$/g, '')]))})).filter(f => isFinite(f.p[0]) && isFinite(f.p[1]));
  // si hay una columna de parcela con 3 o más puntos cada una, se arma un polígono por parcela
  const ip = low.findIndex(c => /^(parcela|plot|id|franja|nombre|name)$/.test(c));
  if (ip >= 0) { const g = new Map(); filas.forEach(f => { const k = f.props[cab[ip]]; if (!g.has(k)) g.set(k, []); g.get(k).push(f); });
    if ([...g.values()].every(a => a.length >= 3)) return {feats: [...g.entries()].map(([k, a]) => pol(ordenarAngulo(a.map(f => f.p)), {[cab[ip]]: k})), crs: null}; }
  return {feats: filas.map(f => pto(f.p, f.props)), crs: null};
}
const ordenarAngulo = pts => { const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]); return [...pts].sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0])); };

// Lee cualquier archivo soportado → {feats (en lon/lat), crs, formato, avisos}. op.zona/op.sur si son UTM sin .prj
export async function leerArchivoGeo(nombre, buf, op = {}) {
  const ext = (nombre.split('.').pop() || '').toLowerCase(), txt = () => new TextDecoder('utf-8').decode(buf); let r, formato;
  if (ext === 'zip' || ext === 'kmz') { const z = await leerZip(buf), k = Object.keys(z), busca = e => k.find(n => n.toLowerCase().endsWith(e));
    if (busca('.kml')) { r = leerKml(new TextDecoder().decode(z[busca('.kml')])); formato = 'Google Earth (KMZ)'; }
    else if (busca('.shp')) { const b = busca('.shp').slice(0, -4), f = e => z[k.find(n => n.toLowerCase() === (b + e).toLowerCase())];
      r = leerShp(f('.shp'), f('.dbf'), f('.prj') && new TextDecoder().decode(f('.prj')), f('.cpg') && new TextDecoder().decode(f('.cpg'))); formato = 'Shapefile'; }
    else if (busca('.geojson') || busca('.json')) { r = leerGeoJSON(new TextDecoder().decode(z[busca('.geojson') || busca('.json')])); formato = 'GeoJSON'; }
    else throw new Error('El .zip no tiene un Shapefile (.shp), KML ni GeoJSON'); }
  else if (ext === 'geojson' || ext === 'json') { r = leerGeoJSON(txt()); formato = 'GeoJSON (QGIS)'; }
  else if (ext === 'kml') { r = leerKml(txt()); formato = 'Google Earth (KML)'; }
  else if (ext === 'gpx') { r = leerGpx(txt()); formato = 'GPS (GPX)'; }
  else if (ext === 'csv' || ext === 'txt') { r = leerCsv(txt()); formato = 'Planilla (CSV)'; }
  else if (ext === 'shp') throw new Error('Del Shapefile hacen falta varios archivos (.shp, .dbf, .prj): comprimilos juntos en un .zip y elegí el .zip');
  else throw new Error('Formato no reconocido: usá GeoJSON, Shapefile en .zip, KML/KMZ, GPX o CSV');
  const todos = r.feats.flatMap(f => f.tipo === 'pol' ? f.anillo : [f.punto]), avisos = [];
  let crs = r.crs;
  if (!crs || crs.tipo !== 'utm') { if (todos.length && !pareceGrados(todos)) crs = {tipo: 'utm', zona: op.zona || 21, sur: op.sur ?? true, nombre: `UTM ${op.zona || 21} ${op.sur === false ? 'N' : 'S'}`, supuesto: true}; else crs = crs || {tipo: 'geo', nombre: 'WGS 84'}; }
  if (crs.tipo === 'utm') { const cv = ([x, y]) => { const [la, lo] = utmALatLon(x, y, crs.zona, crs.sur); return [lo, la]; };
    r.feats.forEach(f => { if (f.tipo === 'pol') f.anillo = f.anillo.map(cv); else f.punto = cv(f.punto); });
    if (crs.supuesto) avisos.push(`Las coordenadas están en metros y el archivo no dice la zona: se tomaron como ${crs.nombre}. Si quedan mal ubicadas, elegí otra zona.`); }
  return {feats: r.feats, crs, formato, avisos};
}

/* ---------------- geometría ---------------- */
const M = 111320;
const aLocal = (o, [lo, la]) => [(lo - o[0]) * M * Math.cos(o[1] * Math.PI / 180), (la - o[1]) * M];
const deLocal = (o, [x, y]) => [o[0] + x / (M * Math.cos(o[1] * Math.PI / 180)), o[1] + y / M];
export function casco(pts) { const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1)); }
// 4 esquinas [lon,lat] del área: si el polígono tiene 4 vértices se usan; si no, el rectángulo mínimo que lo contiene
export function cuatroEsquinas(lonlat) {
  const o = lonlat[0], P = lonlat.map(p => aLocal(o, p)), h = casco(P);
  if (h.length === 4) return h.map(p => deLocal(o, p));
  let mejor = null;
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue; const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity; for (const q of h) { const s = q[0] * ux + q[1] * uy, t = -q[0] * uy + q[1] * ux; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const A = (s1 - s0) * (t1 - t0); if (!mejor || A < mejor.A) mejor = {A, c: [[s0, t0], [s1, t0], [s1, t1], [s0, t1]].map(([s, t]) => [s * ux - t * uy, s * uy + t * ux])}; }
  return mejor.c.map(p => deLocal(o, p));
}
export const centroide = r => { const n = r.length - (r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? 1 : 0); let x = 0, y = 0; for (let i = 0; i < n; i++) { x += r[i][0]; y += r[i][1]; } return [x / n, y / n]; };
export function puntoEnPoligono([x, y], r) { let d = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d; } return d; }

/* ---------------- escritores ---------------- */
// Shapefile de polígonos en WGS 84: feats [{anillo: [[lon,lat]...], props}] → {shp, shx, dbf, prj, cpg}
export function crearShapefile(feats) {
  const enc = new TextEncoder(), recs = feats.map(f => { let r = cerrar(f.anillo); if (areaPlano(r) > 0) r = [...r].reverse(); return r; }); // exterior en sentido horario
  const bb = r => [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))];
  const B = recs.map(bb), T = [Math.min(...B.map(b => b[0])), Math.min(...B.map(b => b[1])), Math.max(...B.map(b => b[2])), Math.max(...B.map(b => b[3]))];
  const lens = recs.map(r => 4 + 32 + 4 + 4 + 4 + 16 * r.length), largo = 100 + lens.reduce((s, l) => s + 8 + l, 0);
  const shp = new DataView(new ArrayBuffer(largo)), shx = new DataView(new ArrayBuffer(100 + 8 * recs.length));
  const cab = (v, L) => { v.setInt32(0, 9994); v.setInt32(24, L / 2); v.setInt32(28, 1000, true); v.setInt32(32, 5, true); T.forEach((x, i) => v.setFloat64(36 + 8 * i, x, true)); };
  cab(shp, largo); cab(shx, 100 + 8 * recs.length);
  let p = 100; recs.forEach((r, i) => { shx.setInt32(100 + 8 * i, p / 2); shx.setInt32(104 + 8 * i, lens[i] / 2); shp.setInt32(p, i + 1); shp.setInt32(p + 4, lens[i] / 2);
    const c = p + 8; shp.setInt32(c, 5, true); B[i].forEach((x, k) => shp.setFloat64(c + 4 + 8 * k, x, true)); shp.setInt32(c + 36, 1, true); shp.setInt32(c + 40, r.length, true); shp.setInt32(c + 44, 0, true);
    r.forEach(([x, y], j) => { shp.setFloat64(c + 48 + 16 * j, x, true); shp.setFloat64(c + 56 + 16 * j, y, true); }); p = c + lens[i]; });
  // DBF: campos de texto o numéricos según los valores
  const nombres = [...new Set(feats.flatMap(f => Object.keys(f.props || {})))].slice(0, 120), campos = nombres.map(n => { const vals = feats.map(f => f.props?.[n]).filter(v => v != null && v !== '');
    const numer = vals.length && vals.every(v => typeof v === 'number' && isFinite(v)), dec = numer ? Math.min(6, Math.max(0, ...vals.map(v => (String(v).split('.')[1] || '').length))) : 0;
    const nom = n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 10) || 'CAMPO';
    return {n, nom, t: numer ? 'N' : 'C', l: numer ? 19 : Math.min(254, Math.max(1, ...vals.map(v => enc.encode(String(v)).length))), dec}; });
  const usados = new Set(); campos.forEach(c => { let b = c.nom, k = 1; while (usados.has(b.toUpperCase())) b = c.nom.slice(0, 8) + '_' + k++; usados.add(b.toUpperCase()); c.nom = b; });
  const hl = 32 + 32 * campos.length + 1, rl = 1 + campos.reduce((s, c) => s + c.l, 0), dbf = new Uint8Array(hl + rl * feats.length + 1), dv = new DataView(dbf.buffer), d = new Date();
  dbf[0] = 3; dbf[1] = d.getFullYear() - 1900; dbf[2] = d.getMonth() + 1; dbf[3] = d.getDate(); dv.setUint32(4, feats.length, true); dv.setUint16(8, hl, true); dv.setUint16(10, rl, true);
  campos.forEach((c, i) => { const o = 32 + 32 * i; dbf.set(enc.encode(c.nom).subarray(0, 10), o); dbf[o + 11] = c.t.charCodeAt(0); dbf[o + 16] = c.l; dbf[o + 17] = c.dec; });
  dbf[hl - 1] = 0x0D; dbf.fill(0x20, hl, hl + rl * feats.length);
  feats.forEach((f, i) => { let o = hl + i * rl + 1; for (const c of campos) { const v = f.props?.[c.n]; let s = v == null ? '' : c.t === 'N' ? (+v).toFixed(c.dec) : String(v);
      let b = enc.encode(s); if (b.length > c.l) b = b.subarray(0, c.l); if (c.t === 'N') dbf.set(b, o + c.l - b.length); else dbf.set(b, o); o += c.l; } });
  dbf[dbf.length - 1] = 0x1A;
  const prj = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  return {shp: new Uint8Array(shp.buffer), shx: new Uint8Array(shx.buffer), dbf, prj, cpg: 'UTF-8'};
}
// GPX con un punto por parcela (centro) y el contorno de cada una, para buscarlas con una app de GPS
export function crearGpx(nombre, items) { // items: [{nombre, desc, anillo}]
  const x = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const wpt = items.map(i => { const [lo, la] = centroide(i.anillo); return `<wpt lat="${la.toFixed(7)}" lon="${lo.toFixed(7)}"><name>${x(i.nombre)}</name><desc>${x(i.desc || '')}</desc></wpt>`; }).join('\n');
  const trk = items.map(i => `<trk><name>${x(i.nombre)}</name><trkseg>${cerrar(i.anillo).map(([lo, la]) => `<trkpt lat="${la.toFixed(7)}" lon="${lo.toFixed(7)}"/>`).join('')}</trkseg></trk>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Ensayos de Campo" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${x(nombre)}</name></metadata>\n${wpt}\n${trk}\n</gpx>`;
}
