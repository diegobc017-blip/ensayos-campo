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

/* ---------------- análisis ---------------- */
// img: {data, width, height} ya rectificada; pxmm: píxeles por milímetro.
// op.sens: sensibilidad 1–5 (3 normal; más alto toma manchas más tenues). op.clases: {chica, grande} µm. op.borde: mm que no se miden en el borde.
export function analizar(img, pxmm, op = {}) {
  const {width: W, height: H, data} = img, N = W * H, um = 1000 / pxmm, sens = op.sens ?? 3, cl = {...CLASES, ...(op.clases || {})};
  // 1) índice de "azul sobre amarillo": B − (R+G)/2, suavizado 1-2-1
  const t0 = new Float32Array(N), t = new Float32Array(N);
  for (let i = 0, o = 0; i < N; i++, o += 4) t0[i] = data[o + 2] - (data[o] + data[o + 1]) / 2;
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
  // 5) cobertura (sin el borde)
  const bpx = Math.round((op.borde ?? 0.5) * pxmm); let tot = 0, man = 0;
  for (let y = bpx; y < H - bpx; y++) for (let x = bpx; x < W - bpx; x++) { tot++; if (mask[y * W + x]) man++; }
  // 6) gotas: componentes + separación de gotas pegadas por máximos de la distancia al borde
  const E = edt(mask, W, H), L2 = etiquetar(mask, W, H), gotas = [];
  const enBorde = (x, y) => x < bpx || y < bpx || x >= W - bpx || y >= H - bpx;
  for (let ci = 0; ci < L2.comps.length; ci++) { const c = L2.comps[ci], A = c.length, cid = ci + 1;
    let seeds = [];
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
        if (rq - cuello >= Math.max(0.6, 0.12 * rq)) seeds.push(q); } }
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
      const x = sx / A, y = sy / A, s = dComp * um; gotas.push({x, y, s, borde: enBorde(x, y), n: 1}); }
    else { const As = new Float64Array(seeds.length), sc = seeds.map(p => [p % W, (p / W) | 0, E[p]]);
      for (const i of c) { const x = i % W, y = (i - x) / W; let k = 0, best = Infinity; sc.forEach(([cx, cy, r], j) => { const pw = (x - cx) ** 2 + (y - cy) ** 2 - r * r; if (pw < best) { best = pw; k = j; } }); As[k]++; }
      sc.forEach(([x, y, r], j) => { const s = Math.min(dComp, Math.max(2 * r - 1, Math.sqrt(4 * As[j] / Math.PI))) * um; gotas.push({x, y, s, borde: enBorde(x, y), n: seeds.length}); }); } }
  // 7) diámetro de gota y clases (0 chica, 1 mediana, 2 grande)
  for (const g of gotas) { g.d = gotaDeMancha(g.s); g.c = g.d < cl.chica ? 0 : g.d < cl.grande ? 1 : 2; }
  const medidas = gotas.filter(g => !g.borde);
  const areaCm2 = tot / (pxmm * pxmm) / 100, hist = new Array(NBIN).fill(0);
  medidas.forEach(g => hist[Math.min(NBIN - 1, Math.floor(g.d / BIN))]++);
  const st = resumen({manchas: man, total: tot, areaCm2, n: medidas.length, hist, diam: medidas.map(g => g.d), clases: [0, 1, 2].map(k => medidas.filter(g => g.c === k).length), separadas: medidas.filter(g => g.n > 1).length, cl, umPx: um});
  return {mask, d, gotas, st, W, H, pxmm};
}
const lab2 = (lab, W, x, y) => lab[y * W + x];

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
