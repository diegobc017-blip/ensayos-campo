// hidro.js — análisis de papel hidrosensible (sin DOM: sirve en la página, en un Worker y en Node).
// Flujo: rectificar (perspectiva) → filtro (manchas azules sobre fondo amarillo, fondo normalizado)
//        → máscara con umbral a media altura de cada mancha (incluye manchas tenues chicas)
//        → cobertura → conteo con separación de gotas pegadas (las gotas son redondas)
//        → diámetro de mancha → diámetro de gota (factor de expansión, DepositScan: d = 0,95·s^0,910)
//        → clases chicas / medianas / grandes, densidad, DV0,1 / DMV / DV0,9, volumen depositado.

export const PAPELES = {
  '26x76': {n: '26 × 76 mm (estándar)', w: 26, h: 76},
  '52x76': {n: '52 × 76 mm', w: 52, h: 76},
  otro: {n: 'Otra medida', w: 26, h: 76}
};
export const CLASES = {chica: 150, grande: 350}; // µm de diámetro de gota (editable)
// Clases ASABE S572.3 por DMV (Dv0,5), aproximadas (NDSU AE1246, 2024). En papel hidrosensible son orientativas.
export const ASABE = [[100, 'Extremadamente fina'], [150, 'Muy fina'], [195, 'Fina'], [270, 'Media'], [350, 'Gruesa'], [485, 'Muy gruesa'], [665, 'Extremadamente gruesa'], [Infinity, 'Ultra gruesa']];
export const claseASABE = dmv => dmv == null || !isFinite(dmv) ? '—' : ASABE.find(([l]) => dmv < l)[1];
// Densidad mínima de impactos recomendada (FAO, citada por AgroSpray), orientativa.
export const OBJETIVOS = {
  'ins-sis': {n: 'Insecticida o fungicida sistémico', min: 20, max: 30},
  'ins-con': {n: 'Insecticida o fungicida de contacto', min: 50, max: 70},
  'her-sis': {n: 'Herbicida sistémico', min: 20, max: 30},
  'her-con': {n: 'Herbicida de contacto', min: 30, max: 40}
};
export const gotaDeMancha = s => 0.95 * Math.pow(s, 0.910); // µm → µm
const BIN = 10, NBIN = 300; // histograma de diámetros de gota: 10 µm hasta 3 mm

/* ---------------- perspectiva ---------------- */
// src: {data, width, height}; q: esquinas en src. Devuelve imagen W×H (bilineal).
export function rectificar(src, q, W, H) {
  const map = homografiaUV(q), out = new Uint8ClampedArray(W * H * 4), sw = src.width, sh = src.height, s = src.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [px, py] = map((x + 0.5) / W, (y + 0.5) / H), fx = Math.min(Math.max(px - 0.5, 0), sw - 1.001), fy = Math.min(Math.max(py - 0.5, 0), sh - 1.001);
    const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy, i00 = (iy * sw + ix) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, o = (y * W + x) * 4;
    for (let k = 0; k < 3; k++) out[o + k] = (s[i00 + k] * (1 - ax) + s[i10 + k] * ax) * (1 - ay) + (s[i01 + k] * (1 - ax) + s[i11 + k] * ax) * ay;
    out[o + 3] = 255;
  }
  return {data: out, width: W, height: H};
}
// Homografía del cuadrado unidad al cuadrilátero sup-izq, sup-der, inf-der, inf-izq (Heckbert); u horizontal, v vertical.
function homografiaUV(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q; // (0,0) (1,0) (1,1) (0,1)
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let a, b, c, d, e, f, g = 0, h = 0;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) { a = x1 - x0; b = x3 - x0; c = x0; d = y1 - y0; e = y3 - y0; f = y0; }
  else { const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0; }
  return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]; };
}
export const lado = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
// Ordena 4 puntos como sup-izq, sup-der, inf-der, inf-izq y los gira para que el lado largo quede horizontal.
export function ordenarEsquinas(pts, horizontal = true) {
  const c = pts.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
  const o = [...pts].sort((p, q) => Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(q[1] - c[1], q[0] - c[0])); // horario desde la izquierda arriba
  let i0 = 0, best = Infinity; o.forEach((p, i) => { if (p[0] + p[1] < best) { best = p[0] + p[1]; i0 = i; } });
  let r = [0, 1, 2, 3].map(k => o[(i0 + k) % 4]);
  const ancho = (lado(r[0], r[1]) + lado(r[3], r[2])) / 2, alto = (lado(r[0], r[3]) + lado(r[1], r[2])) / 2;
  if (horizontal && alto > ancho) r = [r[3], r[0], r[1], r[2]]; // girar 90°: el lado largo pasa a ser el de arriba
  return r;
}

/* ---------------- detección del papel en la foto ---------------- */
// Busca el papel (amarillo, con manchas azules) dentro de la imagen y devuelve sus 4 esquinas.
export function detectarPapel(img) {
  const {width: W0, height: H0, data} = img, k = Math.max(1, Math.ceil(Math.max(W0, H0) / 360)), W = Math.floor(W0 / k), H = Math.floor(H0 / k), m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0; for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const o = ((y * k + j) * W0 + x * k + i) * 4; r += data[o]; g += data[o + 1]; b += data[o + 2]; }
    r /= k * k; g /= k * k; b /= k * k; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    const amarillo = r > 110 && g > 95 && b < 0.72 * Math.min(r, g) && sat > 0.28, azul = b > r + 15 && b > g - 5 && sat > 0.25 && mx > 40;
    m[y * W + x] = amarillo || azul ? 1 : 0;
  }
  // cierre (rellena manchas azules oscuras y huecos)
  const cerr = cerrar(m, W, H, 2), lab = new Int32Array(W * H), cola = new Int32Array(W * H); let mejor = 0, mejorN = 0, n = 0;
  for (let i = 0; i < W * H; i++) if (cerr[i] && !lab[i]) { n++; let a = 0, b2 = 0; cola[b2++] = i; lab[i] = n;
    while (a < b2) { const p = cola[a++], x = p % W, y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const qq = yy * W + xx; if (cerr[qq] && !lab[qq]) { lab[qq] = n; cola[b2++] = qq; } } }
    if (b2 > mejorN) { mejorN = b2; mejor = n; } }
  if (mejorN < W * H * 0.04) return null;
  // esquinas: extremos de x+y y x−y, refinados con el casco
  let tl = null, tr = null, br = null, bl = null, s1 = Infinity, s2 = -Infinity, d1 = -Infinity, d2 = Infinity;
  for (let i = 0; i < W * H; i++) if (lab[i] === mejor) { const x = i % W + 0.5, y = (i / W | 0) + 0.5;
    if (x + y < s1) { s1 = x + y; tl = [x, y]; } if (x + y > s2) { s2 = x + y; br = [x, y]; } if (x - y > d1) { d1 = x - y; tr = [x, y]; } if (x - y < d2) { d2 = x - y; bl = [x, y]; } }
  const pts = [tl, tr, br, bl].map(p => [p[0] * k, p[1] * k]);
  // si el papel está casi alineado con los ejes, x+y / x−y fallan menos con la caja de cada lado: comprobar área
  const area = Math.abs(poliArea(pts)), cobert = mejorN * k * k;
  if (area < cobert * 0.75) { // probablemente rotado ~45° o mal: usar caja envolvente
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < W * H; i++) if (lab[i] === mejor) { const x = i % W, y = i / W | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return [[x0 * k, y0 * k], [(x1 + 1) * k, y0 * k], [(x1 + 1) * k, (y1 + 1) * k], [x0 * k, (y1 + 1) * k]];
  }
  return pts;
}
const poliArea = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
function cerrar(m, W, H, r) { return erosionar(dilatar(m, W, H, r), W, H, r); }
function dilatar(m, W, H, r) { const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const xx = x + d; if (xx >= 0 && xx < W && m[y * W + xx]) v = 1; } t[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const yy = y + d; if (yy >= 0 && yy < H && t[yy * W + x]) v = 1; } o[y * W + x] = v; }
  return o; }
function erosionar(m, W, H, r) { const inv = m.map(v => 1 - v); return dilatar(inv, W, H, r).map(v => 1 - v); }

/* ---------------- utilidades ---------------- */
function edt(mask, W, H) { // distancia euclídea al fondo más cercano (Felzenszwalb & Huttenlocher)
  const INF = 1e20, n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), D = new Float32Array(W * H);
  const pas = (len) => { let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) { let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity; }
    k = 0; for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; } };
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = mask[y * W + x] ? INF : 0; pas(H); for (let y = 0; y < H; y++) D[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = D[y * W + x]; pas(W); for (let x = 0; x < W; x++) D[y * W + x] = Math.sqrt(Math.min(d[x], 1e12)); }
  return D;
}
function etiquetar(mask, W, H) { // componentes 8-conexas → {lab, comps: [Int32Array de índices]}
  const lab = new Int32Array(W * H), cola = new Int32Array(W * H), comps = []; let n = 0;
  for (let i = 0; i < W * H; i++) if (mask[i] && !lab[i]) { n++; let a = 0, b = 0; cola[b++] = i; lab[i] = n;
    while (a < b) { const p = cola[a++], x = p % W, y = (p - x) / W;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const q = yy * W + xx; if (mask[q] && !lab[q]) { lab[q] = n; cola[b++] = q; } } } }
    comps.push(cola.slice(0, b)); }
  return {lab, comps};
}

/* ---------------- filtros de color ---------------- */
// Cada filtro da un valor alto en la mancha azul y bajo en el papel amarillo.
//  byr: azul − (rojo+verde)/2 · r: rojo invertido · rg: (rojo+verde)/2 invertido · croma: byr dividido por el brillo (no le afectan sombras)
//  lab: eje amarillo–azul de CIE Lab (−b*)
const LIN = Float32Array.from({length: 256}, (_, v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const fLab = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
export function indiceColor(data, N, tipo = 'byr') {
  const t = new Float32Array(N);
  for (let i = 0, o = 0; i < N; i++, o += 4) { const R = data[o], G = data[o + 1], B = data[o + 2];
    switch (tipo) {
      case 'r': t[i] = 255 - R; break;
      case 'rg': t[i] = 255 - (R + G) / 2; break;
      case 'croma': t[i] = 380 * (B - (R + G) / 2) / (R + G + B + 45); break;
      case 'lab': { const r = LIN[R], g = LIN[G], b = LIN[B], Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883; t[i] = -2.4 * 200 * (fLab(Y) - fLab(Z)); break; }
      default: t[i] = B - (R + G) / 2; } }
  return t;
}

/* ---------------- corrección de luz (campo plano) ---------------- */
// Estima el color del papel en bloques chicos (los píxeles más claros de cada bloque), suaviza los bloques con mediana
// y divide la imagen por ese color: saca sombras, viñeteado, luz despareja y tintes de color (balance de blancos local).
export function corregirLuz(data, W, H, pxmm, ref = [238, 214, 62]) {
  const lado = Math.max(12, Math.round(2.5 * pxmm)), nbx = Math.max(1, Math.round(W / lado)), nby = Math.max(1, Math.round(H / lado)), bw = W / nbx, bh = H / nby;
  const P = Array.from({length: nbx * nby}, () => [0, 0, 0]);
  for (let by = 0; by < nby; by++) for (let bx = 0; bx < nbx; bx++) { const px = [];
    for (let y = Math.floor(by * bh); y < Math.floor((by + 1) * bh); y++) for (let x = Math.floor(bx * bw); x < Math.floor((bx + 1) * bw); x++) { const o = (y * W + x) * 4; px.push([data[o] + data[o + 1], o]); }
    px.sort((a, b) => b[0] - a[0]); const k0 = Math.floor(px.length * 0.08), k1 = Math.max(k0 + 1, Math.floor(px.length * 0.4)); let r = 0, g = 0, b = 0;
    for (let k = k0; k < k1; k++) { const o = px[k][1]; r += data[o]; g += data[o + 1]; b += data[o + 2]; } const n = k1 - k0; P[by * nbx + bx] = [r / n, g / n, b / n]; }
  // mediana 3×3 de bloques (un bloque cubierto de manchas no arruina el fondo) y respeto de sombras
  const med = P.map((_, i) => { const bx = i % nbx, by = (i / nbx) | 0, v = [[], [], []];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = bx + dx, y = by + dy; if (x < 0 || y < 0 || x >= nbx || y >= nby) continue; const q = P[y * nbx + x]; v[0].push(q[0]); v[1].push(q[1]); v[2].push(q[2]); }
    const m = v.map(a => a.sort((p, q) => p - q)[a.length >> 1]), own = P[i];
    return (own[0] + own[1]) < 0.85 * (m[0] + m[1]) && (own[0] + own[1]) > 0.5 * (m[0] + m[1]) ? own.map((c, k) => (c + m[k]) / 2) : (own[0] + own[1]) < 0.5 * (m[0] + m[1]) ? m : own; });
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < H; y++) { const fy = Math.min(Math.max((y + 0.5) / bh - 0.5, 0), nby - 1), y0 = Math.floor(fy), y1 = Math.min(y0 + 1, nby - 1), ay = fy - y0;
    for (let x = 0; x < W; x++) { const fx = Math.min(Math.max((x + 0.5) / bw - 0.5, 0), nbx - 1), x0 = Math.floor(fx), x1 = Math.min(x0 + 1, nbx - 1), ax = fx - x0, o = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) { const c = (med[y0 * nbx + x0][k] * (1 - ax) + med[y0 * nbx + x1][k] * ax) * (1 - ay) + (med[y1 * nbx + x0][k] * (1 - ax) + med[y1 * nbx + x1][k] * ax) * ay; out[o + k] = data[o + k] / Math.max(8, c) * ref[k]; }
      out[o + 3] = 255; } }
  return {data: out, papel: med};
}

/* ---------------- análisis ---------------- */
// img: {data, width, height} ya rectificada; pxmm: píxeles por milímetro.
// op.sens: sensibilidad 1–5 (3 normal; más alto toma manchas más tenues). op.clases: {chica, grande} µm. op.borde: mm que no se miden en el borde.
export function analizar(img, pxmm, op = {}) {
  const {width: W, height: H} = img, N = W * H, um = 1000 / pxmm, sens = op.sens ?? 3, cl = {...CLASES, ...(op.clases || {})};
  // Por defecto (probado en el banco de 22 tarjetas simuladas): corrección de luz de campo plano + canal rojo invertido.
  const plano = op.plano !== false, CL = plano ? corregirLuz(img.data, W, H, pxmm) : null, data = plano ? CL.data : img.data;
  // 1) índice de mancha (filtro de color), suavizado 1-2-1
  const t0 = indiceColor(data, N, op.indice || 'r'), t = new Float32Array(N);
  const tmp = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; tmp[i] = (2 * t0[i] + t0[x > 0 ? i - 1 : i] + t0[x < W - 1 ? i + 1 : i]) / 4; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; t[i] = (2 * tmp[i] + tmp[y > 0 ? i - W : i] + tmp[y < H - 1 ? i + W : i]) / 4; }
  // 2) fondo del papel por bloques (percentil 15), acotado por el fondo general; interpolado
  const pct = (arr, p) => { const h = new Uint32Array(512); let n = 0; for (const v of arr) { h[Math.max(0, Math.min(511, Math.round(v) + 256))]++; n++; } let s = 0, lim = n * p; for (let k = 0; k < 512; k++) { s += h[k]; if (s >= lim) return k - 256; } return 255; };
  const g5 = pct(t, 0.05), nbx = Math.max(1, Math.round(W / Math.max(24, Math.min(W, H) / 1.5))), nby = Math.max(1, Math.round(H / Math.max(24, Math.min(W, H) / 1.5)));
  const bw = W / nbx, bh = H / nby, B = new Float32Array(nbx * nby);
  for (let by = 0; by < nby; by++) for (let bx = 0; bx < nbx; bx++) { const vals = [];
    for (let y = Math.floor(by * bh); y < Math.floor((by + 1) * bh); y += 1) for (let x = Math.floor(bx * bw); x < Math.floor((bx + 1) * bw); x += 1) vals.push(t[y * W + x]);
    B[by * nbx + bx] = Math.min(pct(vals, 0.15), g5 + 30); }
  const bg = new Float32Array(N);
  for (let y = 0; y < H; y++) { const fy = Math.min(Math.max((y + 0.5) / bh - 0.5, 0), nby - 1), y0 = Math.floor(fy), y1 = Math.min(y0 + 1, nby - 1), ay = fy - y0;
    for (let x = 0; x < W; x++) { const fx = Math.min(Math.max((x + 0.5) / bw - 0.5, 0), nbx - 1), x0 = Math.floor(fx), x1 = Math.min(x0 + 1, nbx - 1), ax = fx - x0;
      bg[y * W + x] = (B[y0 * nbx + x0] * (1 - ax) + B[y0 * nbx + x1] * ax) * (1 - ay) + (B[y1 * nbx + x0] * (1 - ax) + B[y1 * nbx + x1] * ax) * ay; } }
  // 3) contraste normalizado d ∈ [0,1]: 0 = papel, 1 = mancha más intensa
  const dif = new Float32Array(N); let ruido = 0; for (let i = 0; i < N; i++) dif[i] = t[i] - bg[i];
  if (op.luz ?? !plano) { // compensa sombras y luz despareja: divide por el brillo local del papel (percentil alto de (R+G)/2 por bloque)
    const lum = new Float32Array(N); for (let i = 0, o = 0; i < N; i++, o += 4) lum[i] = (data[o] + data[o + 1]) / 2;
    const P = new Float32Array(nbx * nby); let glob = 0;
    for (let by = 0; by < nby; by++) for (let bx = 0; bx < nbx; bx++) { const vals = [];
      for (let y = Math.floor(by * bh); y < Math.floor((by + 1) * bh); y++) for (let x = Math.floor(bx * bw); x < Math.floor((bx + 1) * bw); x++) vals.push(lum[y * W + x] - 256);
      P[by * nbx + bx] = Math.max(20, pct(vals, 0.85) + 256); }
    glob = [...P].sort((a, b) => a - b)[Math.floor(P.length * 0.75)];
    for (let y = 0; y < H; y++) { const fy = Math.min(Math.max((y + 0.5) / bh - 0.5, 0), nby - 1), y0 = Math.floor(fy), y1 = Math.min(y0 + 1, nby - 1), ay = fy - y0;
      for (let x = 0; x < W; x++) { const fx = Math.min(Math.max((x + 0.5) / bw - 0.5, 0), nbx - 1), x0 = Math.floor(fx), x1 = Math.min(x0 + 1, nbx - 1), ax = fx - x0;
        const pl = (P[y0 * nbx + x0] * (1 - ax) + P[y0 * nbx + x1] * ax) * (1 - ay) + (P[y1 * nbx + x0] * (1 - ax) + P[y1 * nbx + x1] * ax) * ay; dif[y * W + x] *= glob / pl; } } }
  { const ab = []; for (let i = 0; i < N; i += 7) if (dif[i] < 0) ab.push(-dif[i]); ab.sort((a, b) => a - b); ruido = ab.length ? ab[Math.floor(ab.length * 0.9)] : 4; }
  const ord = Float32Array.from(dif.filter((_, i) => i % 3 === 0)).sort(), Dm = Math.max(ord[Math.floor(ord.length * 0.997)] || 0, 70, ruido * 8);
  const d = new Float32Array(N); for (let i = 0; i < N; i++) d[i] = Math.max(0, dif[i] / Dm);
  // 4) máscara: débil (incluye manchones tenues) + umbral a media altura de cada mancha
  const tw = Math.max([0.26, 0.21, 0.16, 0.12, 0.09][sens - 1], 3.2 * ruido / Dm), tp = tw * 1.25;
  const debil = new Uint8Array(N); for (let i = 0; i < N; i++) debil[i] = d[i] >= tw ? 1 : 0;
  const L1 = etiquetar(debil, W, H), mask = new Uint8Array(N);
  for (const c of L1.comps) { let pk = 0; for (const i of c) if (d[i] > pk) pk = d[i];
    if (pk < tp || (c.length < 2 && pk < 0.32)) continue;
    const u = Math.max(tw, 0.5 * pk); for (const i of c) if (d[i] >= u) mask[i] = 1; }
  // 5) cobertura (sin el borde). Área "integrada": cada píxel suma la fracción de mancha que tiene (0 a 1), así el desenfoque
  //    no achica ni agranda las gotas: el borde borroso y las gotitas más chicas que un píxel cuentan por lo que tiñen.
  const bpx = Math.round((op.borde ?? 0.5) * pxmm); let tot = 0, man = 0;
  const E = edt(mask, W, H), L2 = etiquetar(mask, W, H), gotas = [], integ = op.area !== 'umbral';
  const fr = new Float32Array(N), labA = new Int32Array(L2.lab), Aint = new Float64Array(L2.comps.length + 1);
  if (integ) { const inter = []; for (let i = 0; i < N; i += 1) if (mask[i] && E[i] >= 2.5) inter.push(d[i]);
    let full = inter.length >= 30 ? inter.sort((a, b) => a - b)[inter.length >> 1] : 0; if (!full) { const m = []; for (let i = 0; i < N; i++) if (mask[i]) m.push(d[i]); full = m.length ? m.sort((a, b) => a - b)[Math.floor(m.length * 0.9)] : 0.95; }
    full = Math.max(0.3, Math.min(1.2, full)); const f0 = Math.min(0.12, 1.5 * ruido / Dm);
    // anillo de 2 píxeles alrededor de cada mancha (el borde desenfocado)
    let frente = []; for (let i = 0; i < N; i++) if (labA[i]) frente.push(i);
    for (let paso = 0; paso < 2; paso++) { const nuevo = []; for (const i of frente) { const x = i % W, y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (!labA[q] && d[q] > f0) { labA[q] = labA[i]; nuevo.push(q); } } } frente = nuevo; }
    const noTinta = i => op.verde !== false && plano && (238 - data[4 * i]) > 40 && (214 - data[4 * i + 1]) < 0.3 * (238 - data[4 * i]); // tono verdoso: humedad, no gota
    for (let i = 0; i < N; i++) { const f = noTinta(i) ? 0 : Math.min(1, Math.max(0, (d[i] - f0) / (full - f0))); if (labA[i]) { fr[i] = f; Aint[labA[i]] += f; } else if (op.cobTotal) fr[i] = f; } }
  // zonas con reflejo de luz (papel lavado, las manchas no se ven): no se miden, la cobertura y la densidad salen del resto
  const excl = new Uint8Array(N); let nEx = 0;
  if (op.reflejo !== false) { const raw = img.data, R = Math.max(2, Math.round(0.15 * pxmm)), sem = [], bs = [];
    for (let o = 0; o < raw.length; o += 4 * 37) bs.push(raw[o + 2]); bs.sort((a, b) => a - b);
    const bRef = Math.max(125, (bs[bs.length >> 1] || 62) + 60); // el papel es amarillo (poco azul): el reflejo lo blanquea
    for (let i = 0, o = 0; i < N; i++, o += 4) if (raw[o] > 226 && raw[o + 1] > 214 && raw[o + 2] > bRef) sem.push(i);
    if (sem.length > N * 0.0005) for (const i of sem) { const x = i % W, y = (i - x) / W;
      for (let dy = -R; dy <= R; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -R; dx <= R; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) excl[yy * W + xx] = 1; } } }
    for (let i = 0; i < N; i++) nEx += excl[i];
    if (nEx > N * 0.35) { excl.fill(0); nEx = 0; } } // demasiado: no es un reflejo sino el balance de color de la foto
  for (let y = bpx; y < H - bpx; y++) for (let x = bpx; x < W - bpx; x++) { const i = y * W + x; if (excl[i]) continue; tot++; man += integ ? fr[i] : mask[i]; }
  // 6) gotas: componentes + separación de gotas pegadas por máximos de la distancia al borde
  const enBorde = (x, y) => x < bpx || y < bpx || x >= W - bpx || y >= H - bpx || excl[Math.round(y) * W + Math.round(x)] === 1;
  for (let ci = 0; ci < L2.comps.length; ci++) { const c = L2.comps[ci], A = c.length, cid = ci + 1;
    let seeds = []; const circ = new Map();
    if (A < 8) { let m = c[0]; for (const i of c) if (E[i] > E[m]) m = i; seeds = [m]; }
    else { const cand = [];
      for (const i of c) { const x = i % W, y = (i - x) / W, e = E[i]; let max = true;
        for (let dy = -1; dy <= 1 && max; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; if (E[yy * W + xx] > e) { max = false; break; } }
        if (max) cand.push(i); }
      cand.sort((a, b) => E[b] - E[a]);
      for (const q of cand) { const rq = E[q], qx = q % W, qy = (q - qx) / W;
        if (!seeds.length) { seeds.push(q); continue; }
        if (rq < 1.2) continue;
        let cerca = null, dmin = Infinity, sup = false;
        for (const p of seeds) { const px = p % W, py = (p - px) / W, dd = Math.hypot(px - qx, py - qy); if (dd < 0.62 * E[p] || dd < 1.5) { sup = true; break; } if (dd < dmin) { dmin = dd; cerca = p; } }
        if (sup) continue;
        const px = cerca % W, py = (cerca - px) / W, pasos = Math.ceil(dmin * 2); let cuello = rq;
        for (let s = 1; s < pasos; s++) { const xx = Math.round(qx + (px - qx) * s / pasos), yy = Math.round(qy + (py - qy) * s / pasos), e = lab2(L2.lab, W, xx, yy) === cid ? E[yy * W + xx] : 0; if (e < cuello) cuello = e; }
        if (rq - cuello >= Math.max(0.6, 0.12 * rq)) seeds.push(q); }
      // Cobertura con círculos: si queda una parte de la mancha que ningún círculo de gota explica (racimos de 3 o más
      // gotas), se agrega una gota en el punto más ancho de esa parte. Las gotas son redondas.
      if (op.cubrir !== false && seeds.length >= 1) for (let it = 0; it < 6; it++) {
        const sc = seeds.map(p => [p % W, (p / W) | 0, E[p] + 0.3]); let mejor = -1, me = 0;
        for (const i of c) { const x = i % W, y = (i - x) / W; if (sc.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r)) continue;
          // distancia al círculo más cercano: el punto suelto más alejado y más "ancho"
          const e = E[i]; if (e > me) { me = e; mejor = i; } }
        if (mejor < 0 || me < Math.max(1.2, 0.45 * Math.min(...sc.map(q => q[2])))) break;
        const mx = mejor % W, my = (mejor - mx) / W; if (sc.some(([cx, cy, r]) => Math.hypot(mx - cx, my - cy) < r + 0.4 * me)) break;
        seeds.push(mejor); }
      // Arcos del borde que ningún círculo explica: se ajusta un círculo a cada arco (gotas muy superpuestas, cuyo centro
      // queda dentro de otra gota y la distancia al borde no lo muestra).
      if (op.arcos !== false && A >= 30) { const extra = arcosSueltos(c, seeds.map(p => [p % W, (p / W) | 0, E[p] + 0.5]), L2.lab, cid, W, H);
        for (const [x, y, r] of extra) { const q = Math.round(y) * W + Math.round(x); if (L2.lab[q] === cid) { seeds.push(q); circ.set(q, r); } } } }
    const area = A, dComp = Math.sqrt(4 * area / Math.PI);
    // Gotas pegadas que la distancia al borde no separó (manchas chicas, poca resolución): las gotas son redondas,
    // así que una mancha alargada cuyo largo supera ~1,45 veces su ancho son 2 o más gotas en fila.
    if (seeds.length === 1 && A >= 10) { let mx = 0, my = 0; for (const i of c) { mx += i % W; my += (i / W) | 0; } mx /= A; my /= A;
      let sxx = 0, syy = 0, sxy = 0; for (const i of c) { const x = i % W - mx, y = ((i / W) | 0) - my; sxx += x * x; syy += y * y; sxy += x * y; }
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th); let pmin = Infinity, pmax = -Infinity;
      for (const i of c) { const pr = (i % W - mx) * ux + (((i / W) | 0) - my) * uy; if (pr < pmin) pmin = pr; if (pr > pmax) pmax = pr; }
      const tr = (sxx + syy) / A, de = Math.sqrt(((sxx - syy) / A) ** 2 + 4 * (sxy / A) ** 2), l1 = (tr + de) / 2 - 1 / 12, l2 = Math.max(0.05, (tr - de) / 2 - 1 / 12);
      const Lg = pmax - pmin + 1, R = Math.max(1, 2 * Math.sqrt(l2)), elong = Math.sqrt(Math.max(l1, 0.05) / l2);
      if (elong >= 1.5 && Lg >= 2.9 * R) { const k = Math.max(2, Math.round((Lg - 2 * R) / (1.7 * R)) + 1), paso = (Lg - 2 * R) / (k - 1), t0 = pmin - 0.5 + R;
        for (let j = 0; j < k; j++) { const tt = t0 + j * paso, x = mx + ux * tt, y = my + uy * tt; gotas.push({x, y, s: Math.min(dComp, 2 * R + 0.5) * um, borde: enBorde(x, y), n: k}); }
        continue; } }
    if (seeds.length === 1) { let sx = 0, sy = 0; for (const i of c) { sx += i % W; sy += (i / W) | 0; }
      const x = sx / A, y = sy / A, s = (integ && Aint[cid] > 0 ? Math.sqrt(4 * Aint[cid] / Math.PI) : dComp) * um; gotas.push({x, y, s, borde: enBorde(x, y), n: 1}); }
    else { const As = new Float64Array(seeds.length), sc = seeds.map(p => [p % W, (p / W) | 0, circ.has(p) ? circ.get(p) - 0.5 : E[p]]);
      for (const i of c) { const x = i % W, y = (i - x) / W; let k = 0, best = Infinity; sc.forEach(([cx, cy, r], j) => { const pw = (x - cx) ** 2 + (y - cy) ** 2 - r * r; if (pw < best) { best = pw; k = j; } }); As[k]++; }
      sc.forEach(([x, y, r], j) => { const s = Math.min(dComp, Math.max(2 * r - 1, Math.sqrt(4 * As[j] / Math.PI))) * um; gotas.push({x, y, s, borde: enBorde(x, y), n: seeds.length}); }); } }
  // 6b) gotitas tenues (desenfocadas o más chicas que 2 píxeles): filtro gaussiano adaptado y máximos locales que superan
  //     varias veces el ruido; su tamaño sale de la tinta integrada alrededor.
  if (op.tenues && integ) { // opcional: en el banco de pruebas no sumó gotas reales (lo que falta son gotas superpuestas)
    const g = new Float32Array(N), tmp2 = new Float32Array(N), k = [0.0545, 0.2442, 0.4026, 0.2442, 0.0545]; // σ ≈ 1 px
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let j = -2; j <= 2; j++) v += k[j + 2] * d[y * W + Math.min(W - 1, Math.max(0, x + j))]; tmp2[y * W + x] = v; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let j = -2; j <= 2; j++) v += k[j + 2] * tmp2[Math.min(H - 1, Math.max(0, y + j)) * W + x]; g[y * W + x] = v; }
    // ruido del filtrado (lado bajo de la distribución de las diferencias crudas)
    const neg = []; for (let i = 0; i < N; i += 5) if (!labA[i]) { const v = (t[i] - bg[i]) / Dm; if (v < 0) neg.push(-v); } neg.sort((a, b) => a - b);
    const sg = (neg[Math.floor(neg.length * 0.683)] || 0.01) * 0.45, umbral = Math.max([0.09, 0.075, 0.06, 0.05, 0.04][sens - 1], 7 * sg);
    const f0 = Math.min(0.12, 1.5 * ruido / Dm), full = 0.95;
    // anillo a 4–5 px: fondo local (las manchas suaves de humedad o sombra no son gotas) y color (una gota baja el verde
    // casi tanto como el rojo; la humedad y las sombras de color, no)
    const anillo = []; for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const m = Math.max(Math.abs(dx), Math.abs(dy)); if (m >= 4) anillo.push(dy * W + dx); }
    for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) { const i = y * W + x, v0 = g[i]; if (v0 < umbral || labA[i]) continue;
      let sr = 0, sR = 0, sG = 0, nr = 0; for (const o of anillo) { const q = i + o; if (labA[q]) continue; sr += g[q]; sR += data[4 * q]; sG += data[4 * q + 1]; nr++; }
      if (nr < anillo.length * 0.6) continue; const v = v0 - sr / nr; if (v < umbral) continue;
      let cR = 0, cG = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = 4 * (i + dy * W + dx); cR += data[q] / 9; cG += data[q + 1] / 9; }
      const dR = sR / nr - cR, dG = sG / nr - cG; if (dR <= 4 || dG < 0.5 * dR) continue;
      let max = true; for (let dy = -2; dy <= 2 && max; dy++) for (let dx = -2; dx <= 2; dx++) { if ((dx || dy) && g[i + dy * W + dx] > v) { max = false; break; } } if (!max) continue;
      let cerca = false; for (let dy = -3; dy <= 3 && !cerca; dy++) for (let dx = -3; dx <= 3; dx++) { const q = (y + dy) * W + x + dx; if (q >= 0 && q < N && labA[q]) { cerca = true; break; } } if (cerca) continue;
      let a = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const q = i + dy * W + dx; a += Math.min(1, Math.max(0, (d[q] - f0) / (full - f0))); }
      if (a < 0.6) continue; gotas.push({x, y, s: Math.sqrt(4 * a / Math.PI) * um, borde: enBorde(x, y), n: 1, tenue: true}); man += x >= bpx && y >= bpx && x < W - bpx && y < H - bpx ? a : 0; } }
  // 7) diámetro de gota y clases (0 chica, 1 mediana, 2 grande)
  for (const g of gotas) { g.d = gotaDeMancha(g.s); g.c = g.d < cl.chica ? 0 : g.d < cl.grande ? 1 : 2; }
  const medidas = gotas.filter(g => !g.borde);
  const areaCm2 = tot / (pxmm * pxmm) / 100, hist = new Array(NBIN).fill(0);
  medidas.forEach(g => hist[Math.min(NBIN - 1, Math.floor(g.d / BIN))]++);
  const st = resumen({manchas: man, total: tot, areaCm2, n: medidas.length, hist, diam: medidas.map(g => g.d), clases: [0, 1, 2].map(k => medidas.filter(g => g.c === k).length), separadas: medidas.filter(g => g.n > 1).length, cl, umPx: um});
  // 8) diagnóstico de la foto (para avisar al usuario lo que puede fallar)
  const diag = {pxmm, umPx: um, ruido: ruido / Dm, excluido: nEx / N};
  { let parc = 0, per = 0; // ancho del borde de las manchas grandes (desenfoque), en píxeles
    const grande = new Uint8Array(L2.comps.length + 1); L2.comps.forEach((c, k) => { if (c.length >= 40) grande[k + 1] = 1; });
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, l = labA[i]; if (!l || !grande[l]) continue;
      const f = Math.min(1, Math.max(0, d[i] / Math.max(0.3, Dm ? 1 : 1))); if (integ && fr[i] > 0.1 && fr[i] < 0.9) parc++;
      if (mask[i] && (!mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W])) per++; }
    diag.borde = per >= 40 ? parc / per : null; }
  if (CL) { const L = CL.papel.map(c => c[0] + c[1]).sort((a, b) => a - b), q = p => L[Math.min(L.length - 1, Math.floor(L.length * p))];
    diag.luzPareja = q(0.05) / Math.max(1, q(0.95)); diag.brillo = q(0.5) / 2; }
  { let refl = 0, verde = 0; const raw = img.data;
    for (let i = 0, o = 0; i < N; i++, o += 4) { if (raw[o] > 228 && raw[o + 1] > 218 && raw[o + 2] > 165) refl++;
      if (CL) { const dR = 238 - data[o], dG = 214 - data[o + 1]; if (dR > 30 && dG < 0.35 * dR) verde++; } }
    diag.reflejo = refl / N; diag.verde = CL ? verde / N : null; }
  return {mask, d, gotas, st, W, H, pxmm, diag};
}
const lab2 = (lab, W, x, y) => lab[y * W + x];
// Ajuste de círculo por mínimos cuadrados (Kåsa) → [cx, cy, r, residuo]
function ajusteCirculo(P) { const n = P.length; let sx = 0, sy = 0; for (const [x, y] of P) { sx += x; sy += y; } const mx = sx / n, my = sy / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of P) { const u = x - mx, v = y - my; suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
  const det = suu * svv - suv * suv; if (Math.abs(det) < 1e-9) return null;
  const b1 = (suuu + suvv) / 2, b2 = (svvv + svuu) / 2, uc = (b1 * svv - b2 * suv) / det, vc = (suu * b2 - suv * b1) / det, r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  const cx = uc + mx, cy = vc + my; let e = 0; for (const [x, y] of P) e += (Math.hypot(x - cx, y - cy) - r) ** 2; return [cx, cy, r, Math.sqrt(e / n)]; }
function arcosSueltos(c, circs, lab, cid, W, H) {
  const borde = []; for (const i of c) { const x = i % W, y = (i - x) / W; let b = false;
    for (let dy = -1; dy <= 1 && !b; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || lab[yy * W + xx] !== cid) { b = true; break; } }
    if (b) borde.push([x + 0.5, y + 0.5]); }
  const rmax = Math.max(...circs.map(q => q[2])), sueltos = borde.filter(([x, y]) => !circs.some(([cx, cy, r]) => Math.abs(Math.hypot(x - cx - 0.5, y - cy - 0.5) - r) <= 1.1 || Math.hypot(x - cx - 0.5, y - cy - 0.5) < r));
  if (sueltos.length < 6) return [];
  // agrupar puntos sueltos vecinos (arcos)
  const usado = new Uint8Array(sueltos.length), out = [];
  for (let k = 0; k < sueltos.length; k++) { if (usado[k]) continue; const g = [k]; usado[k] = 1;
    for (let a = 0; a < g.length; a++) for (let j = 0; j < sueltos.length; j++) if (!usado[j] && Math.hypot(sueltos[j][0] - sueltos[g[a]][0], sueltos[j][1] - sueltos[g[a]][1]) <= 1.5) { usado[j] = 1; g.push(j); }
    if (g.length < 6) continue; const f = ajusteCirculo(g.map(j => sueltos[j])); if (!f) continue; const [cx, cy, r, res] = f;
    if (r < 1.4 || r > 1.6 * rmax || res > 0.8 || g.length < 0.22 * 2 * Math.PI * r) continue;
    if (circs.some(([x, y, rr]) => Math.hypot(cx - x - 0.5, cy - y - 0.5) < 0.35 * Math.max(r, rr))) continue;
    out.push([cx - 0.5, cy - 0.5, r]); circs.push([cx - 0.5, cy - 0.5, r]); }
  return out;
}

/* ---------------- calidad de la lectura ---------------- */
// Traduce el diagnóstico de la foto en avisos para el usuario y en una precisión esperada. Los márgenes salen del banco de
// pruebas con tarjetas simuladas de verdad conocida (resolución, desenfoque, sombra, luz cálida, reflejo, papel húmedo,
// cobertura alta y pocas gotas). geom: {persp, aspecto} de las esquinas marcadas (opcional).
const interp = (x, P) => { if (x <= P[0][0]) return P[0][1]; for (let i = 1; i < P.length; i++) if (x <= P[i][0]) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return P[P.length - 1][1]; };
export function calidadLectura(dg, st, geom = {}) {
  const av = [], add = (n, t, c, k) => av.push({n, t, c, k}), pc = v => Math.round(v);
  if (!dg) return {nivel: 0, etiqueta: 'Sin diagnóstico', avisos: [], prec: null};
  const bpx = dg.borde ?? 3.5, wmm = bpx / dg.pxmm, cob = st?.cob || 0, n = st?.n || 0;
  // sesgo esperado de la densidad (gotas que se pierden): desenfoque/resolución + superposición de manchas
  let dens = interp(wmm, [[0.08, -2], [0.2, -6], [0.27, -14], [0.33, -20], [0.5, -30]]) - Math.max(0, cob - 5) * 0.95;
  let cobLo = -3, cobHi = 3, dmvLo = -4, dmvHi = 5;
  if (dg.pxmm < 16) add(dg.pxmm < 10 ? 2 : 1, `Resolución baja (${pc(dg.pxmm)} píxeles por mm, ${pc(dg.umPx)} µm por píxel): las gotas menores a ~${pc(st?.minDet || 0)} µm no se ven y las manchas pegadas se separan peor.`, 'Acercá el celular al papel (o usá el zoom 2× desde un poco más lejos para no hacerle sombra) o escaneá la tarjeta a 600–1200 dpi.', 'res');
  if (bpx > 4.7) add(bpx > 6 ? 2 : 1, 'La foto está algo desenfocada: los bordes de las manchas se ven difusos, las gotas chicas se pierden y las pegadas se confunden.', 'Esperá a que la barra de enfoque esté en verde, apoyá los codos y sacá la foto sin mover el celular. Tocá la pantalla sobre el papel para enfocar.', 'foco');
  if (dg.reflejo > 0.004) { const z = Math.min(30, dg.reflejo * 170); cobLo -= z; dens -= z * 0.6; add(dg.reflejo > 0.05 ? 2 : 1, `Hay brillo o reflejo de luz sobre el papel: se dejó sin medir el ${pc(Math.max(dg.reflejo, dg.excluido || 0) * 100)} % de la tarjeta y cerca del brillo las manchas se ven más claras.`, 'Cambiá el ángulo del celular o de la luz, no uses la linterna ni el sol directo; la mejor luz es la sombra pareja o un día nublado.', 'reflejo'); }
  if (dg.verde != null && dg.verde > 0.02) { const z = Math.min(30, dg.verde * 22); cobHi += z; dmvHi += Math.min(15, dg.verde * 36); add(dg.verde > 0.3 ? 2 : 1, 'El papel tiene zonas verdosas o un manchado general (humedad, rocío, sudor de los dedos o papel viejo): parte de ese tono se puede tomar como mancha y la cobertura sale más alta.', 'Usá tarjetas nuevas, guardadas en lugar seco; tomalas por el borde con guantes y retiralas apenas se seque la aplicación (no con rocío).', 'humedad'); }
  if (dg.luzPareja != null && dg.luzPareja < 0.55) add(dg.luzPareja < 0.3 ? 1 : 0, 'Había sombra o luz despareja sobre el papel. La app la corrigió, pero en la parte oscura se ven peor las gotas chicas.', 'Buscá una luz pareja y que el celular no haga sombra (podés alejarlo un poco y usar el zoom).', 'sombra');
  if (dg.brillo != null && dg.brillo < 110) add(1, 'La foto está oscura: aparece ruido y las manchas tenues se confunden con el papel.', 'Sacá la foto con más luz (sombra clara o día nublado) o escaneá la tarjeta.', 'oscura');
  if (dg.ruido > 0.04 && !(dg.verde > 0.02)) add(1, 'La imagen tiene mucho ruido o grano: las manchas tenues pueden no contarse.', 'Más luz y la cámara quieta; evitá el zoom digital muy alto.', 'ruido');
  if (cob > 15) add(cob > 30 ? 2 : 1, `Cobertura alta (${pc(cob)} %): muchas manchas se superponen y no se puede saber cuántas gotas hay debajo. La cobertura es confiable; la densidad${cob > 30 ? ' y el DMV son' : ' es'} solo aproximada${cob > 30 ? 's' : ''}.`, 'Con volúmenes altos usá la cobertura como dato principal. Si necesitás el tamaño de gota, poné tarjetas extra donde llega menos caldo (tercio inferior o cara de abajo de la hoja).', 'cob');
  if (cob > 50) add(2, 'El papel está casi todo manchado (saturado): no se puede medir el tamaño de gota.', 'Con este volumen solo informá la cobertura.', 'sat');
  if (geom.persp > 0.12) add(1, 'La foto se sacó inclinada: una punta del papel quedó más lejos que la otra y ahí la resolución es menor.', 'Poné el celular paralelo al papel (el nivel debe quedar en verde).', 'incl');
  if (geom.aspecto > 0.12) add(1, 'Las esquinas marcadas no coinciden con la medida del papel elegido: revisá la medida o ajustá las esquinas.', 'Elegí la medida correcta del papel arriba de la cámara y ajustá las 4 esquinas al borde.', 'esq');
  if (n > 0 && n < 30) add(n < 12 ? 1 : 0, `Se contaron pocas gotas (${n}): la densidad tiene un margen de ±${pc(196 / Math.sqrt(n))} % solo por azar y el DMV es poco estable.`, 'Leé más tarjetas del mismo metro lineal: se suman.', 'pocas');
  if (n === 0) add(0, 'No se detectaron gotas en esta tarjeta.', 'Si se ven manchas, subí la sensibilidad o revisá que el papel esté bien encuadrado.', 'cero');
  const nivel = av.reduce((m, a) => Math.max(m, a.n), 0);
  const dLo = Math.max(-60, dens - 5), dHi = Math.min(5, dens + 4);
  return {nivel, etiqueta: ['Buena', 'Regular', 'Mala'][nivel], avisos: av,
    prec: {cob: [cobLo, cobHi], dens: [dLo, dHi], dmv: [dmvLo, dmvHi]},
    precTxt: `cobertura ${rango(cobLo, cobHi)} · densidad ${rango(dLo, dHi)} · DMV ${rango(dmvLo, dmvHi)}`};
}
const rango = (a, b) => { const r = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)); return Math.round(a) === -Math.round(b) ? `±${Math.abs(Math.round(b))} %` : `${r(a)} a ${r(b)} %`; };

// Estadísticas a partir de los totales (sirve para una tarjeta o para sumar tarjetas de un metro lineal).
export function resumen(o) {
  const n = o.n, cob = o.total ? o.manchas / o.total * 100 : 0, dens = o.areaCm2 ? n / o.areaCm2 : 0;
  let dv = o.diam ? dvLista(o.diam) : dvHist(o.hist);
  const vol = o.diam ? o.diam.reduce((s, x) => s + x ** 3, 0) : o.hist.reduce((s, c, k) => s + c * ((k + 0.5) * BIN) ** 3, 0); // µm³·(π/6)
  const litrosHa = o.areaCm2 ? vol * Math.PI / 6 * 1e-9 / o.areaCm2 * 100 : 0; // µm³ → µL (1e-9), µL/cm² × 100 = L/ha
  const cls = o.clases || [0, 1, 2].map(k => o.hist.reduce((s, c, b) => { const x = (b + 0.5) * BIN; return s + (((x < o.cl.chica ? 0 : x < o.cl.grande ? 1 : 2) === k) ? c : 0); }, 0));
  return {cob, dens, n, areaCm2: o.areaCm2, manchas: o.manchas, total: o.total, dv01: dv[0], dmv: dv[1], dv09: dv[2], dmn: dv[3], span: dv[1] ? (dv[2] - dv[0]) / dv[1] : null,
    clases: cls, pct: cls.map(c => n ? c / n * 100 : 0), litrosHa, hist: o.hist, separadas: o.separadas || 0, cl: o.cl, umPx: o.umPx, minDet: o.umPx ? gotaDeMancha(2 * o.umPx) : null, clase: claseASABE(dv[1])};
}
function dvLista(ds) { if (!ds.length) return [null, null, null, null]; const s = [...ds].sort((a, b) => a - b), V = s.map(x => x ** 3), tot = V.reduce((a, b) => a + b, 0);
  const at = p => { let c = 0; for (let i = 0; i < s.length; i++) { const c2 = c + V[i]; if (c2 / tot >= p) { if (i === 0) return s[0]; const f = (p * tot - c) / V[i]; return s[i - 1] + (s[i] - s[i - 1]) * f; } c = c2; } return s[s.length - 1]; };
  return [at(0.1), at(0.5), at(0.9), s[Math.floor((s.length - 1) / 2)]]; }
function dvHist(h) { const n = h.reduce((a, b) => a + b, 0); if (!n) return [null, null, null, null]; const V = h.map((c, k) => c * ((k + 0.5) * BIN) ** 3), tot = V.reduce((a, b) => a + b, 0);
  const at = p => { let c = 0; for (let k = 0; k < h.length; k++) { const c2 = c + V[k]; if (V[k] && c2 / tot >= p) return (k + (p * tot - c) / V[k]) * BIN; c = c2; } return h.length * BIN; };
  let c = 0, med = null; for (let k = 0; k < h.length; k++) { c += h[k]; if (c >= n / 2) { med = (k + 0.5) * BIN; break; } }
  return [at(0.1), at(0.5), at(0.9), med]; }
// Suma varias tarjetas (por ejemplo las de un metro lineal): cobertura = superficie manchada total / superficie total.
export function combinarTarjetas(lista) {
  if (!lista.length) return null; const h = new Array(NBIN).fill(0); let man = 0, tot = 0, area = 0, n = 0, sep = 0;
  lista.forEach(s => { man += s.manchas; tot += s.total; area += s.areaCm2; n += s.n; sep += s.separadas || 0; (s.hist || []).forEach((c, k) => { h[k] += c; }); });
  return resumen({manchas: man, total: tot, areaCm2: area, n, hist: h, separadas: sep, cl: lista[0].cl || CLASES});
}
// Histograma compacto para guardar: [[bin, cantidad], ...]
export const histCompacto = h => h.map((c, k) => [k, c]).filter(x => x[1]);
export const histDe = hc => { const h = new Array(NBIN).fill(0); (hc || []).forEach(([k, c]) => { h[k] = c; }); return h; };

/* ---------------- imagen filtrada ---------------- */
// Fondo blanco, manchas en azul oscuro según intensidad: las tenues quedan celestes (se ven igual).
export function imagenFiltrada(r) {
  const {W, H, d, mask} = r, out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0, o = 0; i < W * H; i++, o += 4) { const v = Math.min(1, d[i] * 1.25), m = mask[i];
    const k = m ? Math.max(0.35, v) : v * 0.6; // lo detectado nunca queda más claro que 35 %
    out[o] = 255 - k * (255 - 12); out[o + 1] = 255 - k * (255 - 36); out[o + 2] = 255 - k * (255 - 110); out[o + 3] = 255; }
  return {data: out, width: W, height: H};
}
export const homografia = homografiaUV; // (u,v) ∈ [0,1]² → punto de la imagen
