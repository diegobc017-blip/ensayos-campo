// geo.js — geometría simple en el campo (plano local) y mapa satelital por teselas.
// Coordenadas en grados [lat, lon]; anillos de polígonos en GeoJSON: [[lon, lat], ...].
const M = 111320;
export const mLon = lat => M * Math.cos(lat * Math.PI / 180);
// Desplazamiento local (m al este, m al norte) → [lat, lon]
export const mover = ([lat, lon], este, norte) => [lat + norte / M, lon + este / mLon(lat)];
// [lat, lon] → (m al este, m al norte) desde el origen
export const local = ([lat0, lon0], [lat, lon]) => [(lon - lon0) * mLon(lat0), (lat - lat0) * M];
export const distancia = (a, b) => { const [x, y] = local(a, b); return Math.hypot(x, y); };
export const rumbo = (a, b) => { const [x, y] = local(a, b); return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360; };
// Punto de un rectángulo local: origen = esquina de inicio (a la izquierda), rumbo = dirección del largo (avance),
// x = metros hacia la derecha, y = metros a lo largo.
export function enRect(origen, rumboGr, x, y) { const r = rumboGr * Math.PI / 180;
  return mover(origen, y * Math.sin(r) + x * Math.cos(r), y * Math.cos(r) - x * Math.sin(r)); }
// Cuadrilátero marcado con GPS: P1 inicio-izquierda, P2 fin-izquierda, P3 fin-derecha, P4 inicio-derecha.
// u: 0 izquierda → 1 derecha; v: 0 inicio → 1 fin (interpolación bilineal en el plano local)
export function enCuad(q, u, v) {
  const o = q[0], L = q.map(p => local(o, p)), lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const p = lerp(lerp(L[0], L[3], u), lerp(L[1], L[2], u), v); return mover(o, p[0], p[1]);
}
export function areaM2(anillo) { // anillo [[lon,lat]...]
  const o = [anillo[0][1], anillo[0][0]], P = anillo.map(([lo, la]) => local(o, [la, lo]));
  let s = 0; for (let i = 0; i < P.length - 1; i++) s += P[i][0] * P[i + 1][1] - P[i + 1][0] * P[i][1]; return Math.abs(s) / 2;
}
// Web Mercator en píxeles de 256 por tesela
export const merc = (lat, lon, z) => { const n = 256 * 2 ** z, s = Math.sin(lat * Math.PI / 180); return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]; };
// píxel Mercator → [lat, lon]
export const desdeMerc = (x, y, z) => { const n = 256 * 2 ** z; return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI, x / n * 360 - 180]; };
export const TESELA = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
export const ATRIB = 'Imagen satelital: Esri, Maxar, Earthstar Geographics';
// SVG con fondo satelital (si hay internet) y polígonos. pol: [{anillo, color, texto, id, sel}], pts: [{lat, lon, texto}]
export function svgMapa(pol, pts = [], {ancho = 720, alto = 420, zoomMax = 19, satelite = true, margen = 0.18, limites = []} = {}) {
  const todos = [...pol.flatMap(p => p.anillo.map(([lo, la]) => [la, lo])), ...pts.map(p => [p.lat, p.lon]), ...limites]; if (!todos.length) return '';
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity; todos.forEach(([la, lo]) => { la0 = Math.min(la0, la); la1 = Math.max(la1, la); lo0 = Math.min(lo0, lo); lo1 = Math.max(lo1, lo); });
  let z = zoomMax; for (; z > 3; z--) { const a = merc(la1, lo0, z), b = merc(la0, lo1, z); if ((b[0] - a[0]) * (1 + 2 * margen) <= ancho && (b[1] - a[1]) * (1 + 2 * margen) <= alto) break; }
  const c = merc((la0 + la1) / 2, (lo0 + lo1) / 2, z), ox = c[0] - ancho / 2, oy = c[1] - alto / 2, P = (la, lo) => { const m = merc(la, lo, z); return [m[0] - ox, m[1] - oy]; };
  let s = `<svg viewBox="0 0 ${ancho} ${alto}" data-z="${z}" data-ox="${ox}" data-oy="${oy}" width="100%" xmlns="http://www.w3.org/2000/svg" style="display:block;background:#3d4a3f;border-radius:10px;touch-action:manipulation">`;
  if (satelite) { const tx0 = Math.floor(ox / 256), tx1 = Math.floor((ox + ancho) / 256), ty0 = Math.floor(oy / 256), ty1 = Math.floor((oy + alto) / 256);
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) s += `<image href="${TESELA(z, tx, ty)}" x="${tx * 256 - ox}" y="${ty * 256 - oy}" width="256" height="256" onerror="this.remove()"/>`; }
  // escala
  const mpp = 156543.03392 * Math.cos((la0 + la1) / 2 * Math.PI / 180) / 2 ** z, opciones = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000], esc = opciones.find(m => m / mpp > 70) || 1000, w = esc / mpp;
  for (const p of pol) { const d = p.anillo.map(([lo, la], i) => (i ? 'L' : 'M') + P(la, lo).map(v => v.toFixed(1)).join(' ')).join(' ') + 'Z';
    s += `<path d="${d}" fill="${p.color}" fill-opacity="${p.sel ? 0.55 : 0.32}" stroke="${p.sel ? '#fff' : p.color}" stroke-width="${p.sel ? 3 : 2}" ${p.id != null ? `data-pn="${p.id}" style="cursor:pointer"` : ''}/>`;
    if (p.texto) { const cxy = p.anillo.slice(0, -1).reduce((a, [lo, la]) => { const q = P(la, lo); return [a[0] + q[0] / (p.anillo.length - 1), a[1] + q[1] / (p.anillo.length - 1)]; }, [0, 0]);
      s += `<text x="${cxy[0]}" y="${cxy[1]}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke" pointer-events="none">${p.texto}</text>`; } }
  pts.forEach(p => { const [x, y] = P(p.lat, p.lon); s += `<circle cx="${x}" cy="${y}" r="6" fill="#facc15" stroke="#000" stroke-width="1.5"/>${p.texto ? `<text x="${x + 9}" y="${y - 8}" font-size="12" font-weight="700" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${p.texto}</text>` : ''}`; });
  s += `<g transform="translate(14 ${alto - 18})"><rect x="-6" y="-16" width="${w + 12}" height="26" rx="5" fill="rgba(0,0,0,.55)"/><line x1="0" y1="0" x2="${w}" y2="0" stroke="#fff" stroke-width="3"/><text x="${w / 2}" y="-5" fill="#fff" font-size="11" text-anchor="middle">${esc >= 1000 ? esc / 1000 + ' km' : esc + ' m'}</text></g>`;
  s += `<g transform="translate(${ancho - 26} 30)"><circle r="16" fill="rgba(0,0,0,.55)"/><path d="M0 -11 L6 6 L0 2 L-6 6Z" fill="#fff"/><text y="-19" fill="#fff" font-size="11" text-anchor="middle" font-weight="700">N</text></g>`;
  if (satelite) s += `<text x="${ancho - 6}" y="${alto - 6}" fill="#fff" font-size="9" text-anchor="end" opacity=".85">${ATRIB}</text>`;
  return s + '</svg>';
}
