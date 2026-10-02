// papel.js — lector de papel hidrosensible: cámara con guías (escáner), ajuste de bordes y resultados.
import {PAPELES, CLASES, OBJETIVOS, claseASABE, detectarPapel, ordenarEsquinas, rectificar, lado, analizar, imagenFiltrada, histCompacto} from './lib/hidro.js';

const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const f = (v, d = 0) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('es-PY', {minimumFractionDigits: d, maximumFractionDigits: d});
export const COL = ['#f59e0b', '#16a34a', '#dc2626']; // chicas, medianas, grandes
export const NOMCL = ['Chicas', 'Medianas', 'Grandes'];

let estilo = false;
function css() {
  if (estilo) return; estilo = true; const s = document.createElement('style');
  s.textContent = `
  .lec{position:fixed;inset:0;z-index:300;background:#0b0f0d;color:#fff;display:grid;font:15px/1.4 var(--f-ui,system-ui)}
  .lec>section{position:absolute;inset:0;display:grid;grid-template-rows:auto 1fr auto;min-height:0}
  .lec header,.lec footer{display:flex;gap:8px;align-items:center;padding:10px 12px;background:rgba(0,0,0,.55);z-index:2;flex-wrap:wrap}
  .lec header b{flex:1;font-size:1rem}
  .lec button,.lec select,.lec input{font:inherit;font-size:.9rem;border-radius:9px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.1);color:#fff;padding:8px 12px}
  .lec select option{color:#000}
  .lec button.pri{background:#1f6b52;border-color:#1f6b52;font-weight:600}
  .lec .cam{position:relative;overflow:hidden;background:#000}
  .lec video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .lec svg.guia{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
  .lec .disparo{width:72px;height:72px;border-radius:50%;border:4px solid #fff;background:#fff3;padding:0}
  .lec .disparo:active{background:#fff8}
  .lec .info{position:absolute;left:10px;right:10px;top:8px;display:flex;justify-content:space-between;gap:8px;z-index:1;font-size:.8rem;pointer-events:none}
  .lec .pill2{background:rgba(0,0,0,.55);border-radius:99px;padding:4px 10px;display:flex;align-items:center;gap:6px}
  .lec .nivel{width:34px;height:34px;border-radius:50%;border:2px solid #fff8;position:relative}
  .lec .nivel i{position:absolute;width:10px;height:10px;border-radius:50%;background:#fbbf24;left:12px;top:12px}
  .lec .nivel.ok i{background:#22c55e}
  .lec .barra{width:56px;height:6px;border-radius:9px;background:#fff3;overflow:hidden}.lec .barra i{display:block;height:100%;background:#22c55e}
  .lec .msg{position:absolute;left:12px;right:12px;bottom:10px;text-align:center;font-size:.85rem;text-shadow:0 1px 3px #000;pointer-events:none}
  .lec .wrap{position:relative;overflow:auto;background:#151a17;touch-action:none}
  .lec .wrap canvas{display:block;margin:auto}
  .lec .asa{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:3px solid #22c55e;background:#22c55e44;touch-action:none;cursor:grab}
  .lec .res{overflow:auto;background:var(--bg,#f3f5f2);color:var(--ink,#18221c);padding:12px;display:grid;gap:12px;align-content:start}
  .lec .res button,.lec .res select,.lec .res input{color:var(--ink,#18221c);background:var(--panel,#fff);border-color:var(--line,#d9e0da)}
  .lec .res button.pri{background:var(--accent,#1f6b52);color:var(--accent-ink,#fff);border-color:var(--accent,#1f6b52)}
  .lec .res .card{background:var(--panel,#fff);border:1px solid var(--line,#d9e0da);border-radius:12px;padding:12px;display:grid;gap:10px}
  .lec .tabs{display:flex;gap:4px;flex-wrap:wrap}.lec .tabs button[aria-pressed=true]{background:var(--accent,#1f6b52);color:var(--accent-ink,#fff)}
  .lec .vista{overflow:auto;border-radius:8px;background:#fff;border:1px solid var(--line,#d9e0da);max-height:68vh}
  .lec .vista canvas{display:block;image-rendering:auto}
  .lec .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
  .lec .tile{border:1px solid var(--line,#d9e0da);border-radius:10px;padding:8px 10px;display:grid;gap:2px}
  .lec .tile span{font-size:.75rem;color:var(--muted,#5d6b62)}.lec .tile b{font-size:1.25rem;font-variant-numeric:tabular-nums}
  .lec .cls{display:grid;gap:6px}.lec .cls div{display:grid;grid-template-columns:90px 1fr 92px;gap:8px;align-items:center;font-size:.88rem}
  .lec .cls .b{height:12px;border-radius:9px;background:var(--soft,#e9eee9);overflow:hidden}.lec .cls .b i{display:block;height:100%}
  .lec .g2{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
  .lec label.f{display:grid;gap:4px;font-size:.82rem;color:var(--muted,#5d6b62)}
  .lec .lnota{font-size:.82rem;color:var(--muted,#5d6b62);margin:0}
  .lec .ok{color:#15803d}.lec .warn{color:#b45309}.lec .mal{color:#b91c1c}
  .lec .hist{display:flex;align-items:flex-end;gap:2px;height:70px}.lec .hist i{flex:1;min-width:2px;border-radius:2px 2px 0 0}
  .lec .esp{display:grid;place-items:center;font-size:1rem;color:#fff}
  `;
  document.head.appendChild(s);
}

/* ---------- análisis en un Worker (con respaldo en la página) ---------- */
let W0 = null, sec = 0;
function analizarAsync(img, pxmm, op) {
  return new Promise(res => {
    const local = () => { const r = analizar(img, pxmm, op), fl = imagenFiltrada(r); res({st: r.st, gotas: r.gotas, filt: fl.data, W: r.W, H: r.H}); };
    try { W0 = W0 || new Worker(new URL('./lib/hidroWorker.js', import.meta.url), {type: 'module'}); } catch (e) { W0 = null; }
    if (!W0) return local();
    const id = ++sec, copia = {data: new Uint8ClampedArray(img.data), width: img.width, height: img.height};
    const fin = e => { if (e.data.id !== id) return; W0.removeEventListener('message', fin); clearTimeout(to);
      if (e.data.error) { console.warn(e.data.error); return local(); }
      const g = e.data.gotas, gotas = []; for (let i = 0; i < g.length; i += 6) gotas.push({x: g[i], y: g[i + 1], s: g[i + 2], d: g[i + 3], c: g[i + 4], borde: !!(g[i + 5] & 1), n: g[i + 5] & 2 ? 2 : 1});
      res({st: e.data.st, gotas, filt: e.data.filt, W: e.data.W, H: e.data.H}); };
    const to = setTimeout(() => { W0.removeEventListener('message', fin); W0.terminate(); W0 = null; local(); }, 25000);
    W0.addEventListener('message', fin); W0.addEventListener('error', () => { clearTimeout(to); W0 = null; local(); }, {once: true});
    W0.postMessage({id, img: copia, pxmm, op}, [copia.data.buffer]);
  });
}

const aImageData = (src, w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(src, 0, 0, w, hh); return x.getImageData(0, 0, w, hh); };
const aBlob = (img, tipo = 'image/jpeg', q = 0.92) => new Promise(r => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0); c.toBlob(r, tipo, q); });

/* =================================================================== */
export function abrirLector(cfg = {}) {
  css();
  const E = {papel: cfg.papel || '26x76', medida: {w: 26, h: 76}, sens: cfg.sens ?? 3, clases: {...CLASES, ...(cfg.clases || {})}, objetivo: cfg.objetivo || 'ins-con', stream: null, foto: null, esq: null, rect: null, pxmm: null, r: null, vista: 'filt', zoom: 1, guardadas: 0};
  const raiz = document.createElement('div'); raiz.className = 'lec'; document.body.appendChild(raiz); document.documentElement.style.overflow = 'hidden';
  const cerrar = () => { pararCam(); window.removeEventListener('deviceorientation', nivel); raiz.remove(); document.documentElement.style.overflow = ''; cfg.alCerrar?.(E.guardadas); };
  const medida = () => E.papel === 'otro' ? E.medida : PAPELES[E.papel];
  // iOS pide permiso para el nivel dentro del toque que abrió el lector
  try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {}); } catch (e) {}

  /* ---------------- 1. cámara ---------------- */
  let enfoqueT = null, mejorEnf = 1;
  function pantallaCam() {
    raiz.innerHTML = `<section>
      <header><button data-a="x" aria-label="Cerrar">✕</button><b>${h(cfg.titulo || 'Leer papel hidrosensible')}</b>
        <select data-a="papel" aria-label="Medida del papel">${Object.entries(PAPELES).map(([k, p]) => `<option value="${k}" ${k === E.papel ? 'selected' : ''}>${p.n}</option>`).join('')}</select>
        ${E.papel === 'otro' ? `<input type="number" data-a="mw" value="${E.medida.w}" style="width:70px" aria-label="Ancho mm"> × <input type="number" data-a="mh" value="${E.medida.h}" style="width:70px" aria-label="Largo mm"> mm` : ''}
        <button data-a="luz" hidden>🔦 Linterna</button></header>
      <div class="cam"><video playsinline muted autoplay></video><svg class="guia"></svg>
        <div class="info"><span class="pill2"><span class="nivel"><i></i></span><span data-t="niv">Nivel</span></span><span class="pill2">Enfoque <span class="barra"><i style="width:0"></i></span></span></div>
        <div class="msg" data-t="msg">Apoyá el papel sobre una superficie lisa y de color oscuro o gris. Alineá los bordes del papel con las líneas.</div></div>
      <footer style="justify-content:space-between"><label style="position:relative"><span style="pointer-events:none">🖼️ Foto o escaneo</span><input type="file" accept="image/*" data-a="archivo" style="position:absolute;inset:0;opacity:0"></label>
        <button class="disparo" data-a="foto" aria-label="Capturar"></button>
        ${cfg.ejemplo ? '<button data-a="ejemplo">Probar ejemplo</button>' : '<span style="width:90px"></span>'}</footer></section>`;
    dibujarGuia(); iniciarCam();
    raiz.onchange = async e => { const a = e.target.dataset.a; if (a === 'papel') { E.papel = e.target.value; pararCam(); pantallaCam(); return; }
      if (a === 'mw' || a === 'mh') { const w = +raiz.querySelector('[data-a=mw]').value || 26, l = +raiz.querySelector('[data-a=mh]').value || 76; E.medida = {w: Math.min(w, l), h: Math.max(w, l)}; dibujarGuia(); }
      if (a === 'archivo' && e.target.files[0]) { const bmp = await createImageBitmap(e.target.files[0]); pararCam(); prepararFoto(bmp, null); } };
    raiz.onclick = async e => { const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'x') cerrar(); if (a === 'foto') capturar(); if (a === 'luz') linterna();
      if (a === 'ejemplo') { const b = await (await fetch(cfg.ejemplo)).blob(); pararCam(); prepararFoto(await createImageBitmap(b), null); } };
    addEventListener('resize', dibujarGuia);
  }
  // Recuadro guía en coordenadas de pantalla
  function guiaRect() {
    const cam = raiz.querySelector('.cam'), W = cam.clientWidth, H = cam.clientHeight, m = medida(), vertical = H >= W;
    const ar = vertical ? m.w / m.h : m.h / m.w; let gh = H * 0.8, gw = gh * ar; if (gw > W * 0.86) { gw = W * 0.86; gh = gw / ar; }
    return {x: (W - gw) / 2, y: (H - gh) / 2, w: gw, h: gh, W, H, vertical};
  }
  function dibujarGuia() {
    const svg = raiz.querySelector('svg.guia'); if (!svg) return; const g = guiaRect(), m = medida(), largo = g.vertical ? g.h : g.w, mm = largo / m.h, L = Math.min(g.w, g.h) * 0.22;
    let t = `<defs><mask id="hueco"><rect width="100%" height="100%" fill="#fff"/><rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="3" fill="#000"/></mask></defs>
      <rect width="100%" height="100%" fill="rgba(0,0,0,.5)" mask="url(#hueco)"/>
      <rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="3" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.5"/>`;
    [[g.x, g.y, 1, 1], [g.x + g.w, g.y, -1, 1], [g.x + g.w, g.y + g.h, -1, -1], [g.x, g.y + g.h, 1, -1]].forEach(([x, y, sx, sy]) => { t += `<path d="M${x + sx * L} ${y} H${x} V${y + sy * L}" fill="none" stroke="#22c55e" stroke-width="5" stroke-linecap="round"/>`; });
    t += `<line x1="${g.x + g.w / 2}" y1="${g.y - 14}" x2="${g.x + g.w / 2}" y2="${g.y + g.h + 14}" stroke="#fff" stroke-opacity=".55" stroke-dasharray="6 6"/><line x1="${g.x - 14}" y1="${g.y + g.h / 2}" x2="${g.x + g.w + 14}" y2="${g.y + g.h / 2}" stroke="#fff" stroke-opacity=".55" stroke-dasharray="6 6"/>`;
    for (let k = 10; k < m.h; k += 10) { const p = k * mm; t += g.vertical ? `<line x1="${g.x - 10}" y1="${g.y + p}" x2="${g.x}" y2="${g.y + p}" stroke="#fff" stroke-width="2"/><line x1="${g.x + g.w}" y1="${g.y + p}" x2="${g.x + g.w + 10}" y2="${g.y + p}" stroke="#fff" stroke-width="2"/>`
      : `<line x1="${g.x + p}" y1="${g.y - 10}" x2="${g.x + p}" y2="${g.y}" stroke="#fff" stroke-width="2"/><line x1="${g.x + p}" y1="${g.y + g.h}" x2="${g.x + p}" y2="${g.y + g.h + 10}" stroke="#fff" stroke-width="2"/>`; }
    t += `<text x="${g.x + g.w / 2}" y="${Math.max(16, g.y - 22)}" fill="#fff" font-size="13" text-anchor="middle">${h(m.w)} × ${h(m.h)} mm · marcas cada 10 mm</text>`;
    svg.innerHTML = t;
  }
  async function iniciarCam() {
    const v = raiz.querySelector('video'), msg = raiz.querySelector('[data-t=msg]');
    if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = 'Este navegador no permite usar la cámara: elegí una foto o un escaneo del papel.'; return; }
    try { E.stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 3840}, height: {ideal: 2160}}}); }
    catch (e) { try { E.stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}}); } catch (e2) { msg.textContent = e2.name === 'NotAllowedError' ? 'Sin permiso para la cámara. Podés dar el permiso en el navegador o elegir una foto del papel.' : 'No se encontró una cámara: elegí una foto o un escaneo del papel.'; return; } }
    if (!raiz.isConnected || !v.isConnected) return pararCam();
    v.srcObject = E.stream; await v.play().catch(() => {});
    const tr = E.stream.getVideoTracks()[0], cap = tr.getCapabilities?.() || {};
    if (cap.torch) raiz.querySelector('[data-a=luz]').hidden = false;
    try { if (cap.focusMode?.includes('continuous')) await tr.applyConstraints({advanced: [{focusMode: 'continuous'}]}); } catch (e) {}
    window.addEventListener('deviceorientation', nivel);
    const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d', {willReadFrequently: true});
    clearInterval(enfoqueT); enfoqueT = setInterval(() => { if (!v.videoWidth || !raiz.isConnected) return; const s = Math.min(v.videoWidth, v.videoHeight) * 0.3;
      x.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 160, 160); const d = x.getImageData(0, 0, 160, 160).data; let sm = 0, s2 = 0, n = 0;
      for (let yy = 1; yy < 159; yy += 2) for (let xx = 1; xx < 159; xx += 2) { const i = (yy * 160 + xx) * 4, gr = k => d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11, l = 4 * gr(i) - gr(i - 4) - gr(i + 4) - gr(i - 640) - gr(i + 640); sm += l; s2 += l * l; n++; }
      const vr = s2 / n - (sm / n) ** 2; mejorEnf = Math.max(mejorEnf * 0.995, vr); const p = Math.min(1, vr / mejorEnf), b = raiz.querySelector('.barra i'); if (b) { b.style.width = Math.round(p * 100) + '%'; b.style.background = p > 0.7 ? '#22c55e' : p > 0.4 ? '#fbbf24' : '#ef4444'; } }, 450);
  }
  function nivel(e) { const n = raiz.querySelector('.nivel'); if (!n || e.beta == null) return; const b = Math.max(-20, Math.min(20, e.beta)), g = Math.max(-20, Math.min(20, e.gamma));
    n.querySelector('i').style.transform = `translate(${g / 20 * 12}px,${b / 20 * 12}px)`; const ok = Math.abs(b) < 4 && Math.abs(g) < 4; n.classList.toggle('ok', ok);
    raiz.querySelector('[data-t=niv]').textContent = ok ? 'Derecho' : 'Inclinado'; }
  async function linterna() { const tr = E.stream?.getVideoTracks()[0]; if (!tr) return; E.luz = !E.luz; try { await tr.applyConstraints({advanced: [{torch: E.luz}]}); } catch (e) {} }
  function pararCam() { clearInterval(enfoqueT); removeEventListener('resize', dibujarGuia); E.stream?.getTracks().forEach(t => t.stop()); E.stream = null; }
  async function capturar() {
    const v = raiz.querySelector('video'); if (!v?.videoWidth) return;
    const g = guiaRect(), vw = v.videoWidth, vh = v.videoHeight, s = Math.max(g.W / vw, g.H / vh), ox = (g.W - vw * s) / 2, oy = (g.H - vh * s) / 2;
    const n = {x: (g.x - ox) / s / vw, y: (g.y - oy) / s / vh, w: g.w / s / vw, h: g.h / s / vh}; // recuadro normalizado en el cuadro de video
    let bmp = null, nn = n;
    try { if ('ImageCapture' in window) { const b = await new ImageCapture(E.stream.getVideoTracks()[0]).takePhoto(); bmp = await createImageBitmap(b);
      // si la foto tiene otra proporción que el video, se asume el mismo centro y el mismo campo en el lado recortado
      const ap = bmp.width / bmp.height, av = vw / vh;
      if (Math.abs(ap - av) > 0.02) { if (ap < av) nn = {...n, y: 0.5 + (n.y - 0.5) * ap / av, h: n.h * ap / av}; else nn = {...n, x: 0.5 + (n.x - 0.5) * av / ap, w: n.w * av / ap}; } } } catch (e) { bmp = null; nn = n; }
    if (!bmp) { const c = document.createElement('canvas'); c.width = vw; c.height = vh; c.getContext('2d').drawImage(v, 0, 0); bmp = c; }
    pararCam(); prepararFoto(bmp, nn);
  }

  /* ---------------- 2. bordes ---------------- */
  function prepararFoto(src, n) {
    raiz.innerHTML = '<section><header><b>Buscando el papel…</b></header><div class="esp">Un momento</div><footer></footer></section>';
    setTimeout(() => {
      const sw = src.width, sh = src.height; let cx = 0, cy = 0, cw = sw, ch = sh;
      if (n) { const mx = n.w * 0.18, my = n.h * 0.1; cx = Math.max(0, (n.x - mx) * sw); cy = Math.max(0, (n.y - my) * sh); cw = Math.min(sw - cx, (n.w + 2 * mx) * sw); ch = Math.min(sh - cy, (n.h + 2 * my) * sh); }
      const max = 3200, k = Math.min(1, max / Math.max(cw, ch)), c = document.createElement('canvas'); c.width = Math.round(cw * k); c.height = Math.round(ch * k);
      c.getContext('2d', {willReadFrequently: true}).drawImage(src, cx, cy, cw, ch, 0, 0, c.width, c.height);
      E.foto = c; const id = c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, c.width, c.height);
      let q = null; try { q = detectarPapel(id); } catch (e) { console.warn(e); }
      if (!q) q = n ? [[(n.x * sw - cx) * k, (n.y * sh - cy) * k], [((n.x + n.w) * sw - cx) * k, (n.y * sh - cy) * k], [((n.x + n.w) * sw - cx) * k, ((n.y + n.h) * sh - cy) * k], [(n.x * sw - cx) * k, ((n.y + n.h) * sh - cy) * k]]
        : [[c.width * 0.05, c.height * 0.05], [c.width * 0.95, c.height * 0.05], [c.width * 0.95, c.height * 0.95], [c.width * 0.05, c.height * 0.95]];
      E.esq = q; E.autoOk = !!q; pantallaBordes();
    }, 30);
  }
  function pantallaBordes() {
    raiz.innerHTML = `<section><header><b>Ajustá las esquinas al borde del papel</b></header><div class="wrap"><canvas></canvas></div>
      <footer style="justify-content:space-between"><button data-a="otra">↺ Otra foto</button><span style="font-size:.82rem" data-t="res"></span><button class="pri" data-a="ok">Analizar →</button></footer></section>`;
    const wrap = raiz.querySelector('.wrap'), cv = wrap.querySelector('canvas'), F = E.foto;
    const ajustar = () => { const k = Math.min((wrap.clientWidth - 24) / F.width, (wrap.clientHeight - 24) / F.height); cv.width = F.width; cv.height = F.height; cv.style.width = F.width * k + 'px'; cv.style.height = F.height * k + 'px'; cv.style.marginTop = Math.max(0, (wrap.clientHeight - F.height * k) / 2) + 'px'; E.kv = k; dib(); };
    const dib = () => { const x = cv.getContext('2d'); x.drawImage(F, 0, 0); x.strokeStyle = '#22c55e'; x.lineWidth = 3 / E.kv; x.beginPath(); E.esq.forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.closePath(); x.stroke();
      raiz.querySelectorAll('.asa').forEach(a => a.remove()); const r = cv.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      E.esq.forEach((p, i) => { const a = document.createElement('div'); a.className = 'asa'; a.dataset.i = i; a.style.left = (r.left - w.left + wrap.scrollLeft + p[0] * E.kv) + 'px'; a.style.top = (r.top - w.top + wrap.scrollTop + p[1] * E.kv) + 'px'; wrap.appendChild(a); });
      const e2 = ordenarEsquinas(E.esq), m = medida(), largo = (lado(e2[0], e2[1]) + lado(e2[3], e2[2])) / 2, ppm = largo / m.h; E.pxmm = Math.max(8, Math.min(40, Math.round(ppm)));
      raiz.querySelector('[data-t=res]').innerHTML = `${f(ppm, 0)} px/mm · gotas desde ~${f(0.95 * Math.pow(2 * 1000 / Math.min(ppm, 40), 0.91), 0)} µm${ppm < 14 ? ' · <b style="color:#fbbf24">acercá más la cámara</b>' : ''}`; };
    let arr = null;
    wrap.onpointerdown = e => { const a = e.target.closest('.asa'); if (!a) return; arr = +a.dataset.i; a.setPointerCapture(e.pointerId); e.preventDefault(); };
    wrap.onpointermove = e => { if (arr == null) return; const r = cv.getBoundingClientRect(); E.esq[arr] = [Math.max(0, Math.min(F.width, (e.clientX - r.left) / E.kv)), Math.max(0, Math.min(F.height, (e.clientY - r.top) / E.kv))]; dib(); };
    wrap.onpointerup = () => { arr = null; };
    raiz.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'otra') pantallaCam(); if (a === 'ok') rectificarYAnalizar(); };
    raiz.onchange = null; requestAnimationFrame(ajustar);
  }
  async function rectificarYAnalizar() {
    const m = medida(), e2 = ordenarEsquinas(E.esq), ctx = E.foto.getContext('2d', {willReadFrequently: true}), src = ctx.getImageData(0, 0, E.foto.width, E.foto.height);
    E.rect = rectificar(src, e2, Math.round(m.h * E.pxmm), Math.round(m.w * E.pxmm)); E.medidaUsada = {w: m.w, h: m.h}; E.blob = null;
    await analizarYMostrar();
  }

  /* ---------------- 3. resultados ---------------- */
  async function analizarYMostrar() {
    raiz.innerHTML = '<section><header><b>Analizando el papel…</b></header><div class="esp">Contando gotas</div><footer></footer></section>';
    E.r = await analizarAsync(E.rect, E.pxmm, {sens: E.sens, clases: E.clases}); pantallaRes();
  }
  function pantallaRes() {
    const s = E.r.st, ob = OBJETIVOS[E.objetivo], ev = s.dens >= ob.min ? ['ok', `Densidad adecuada para ${ob.n.toLowerCase()} (${ob.min}–${ob.max} gotas/cm²)`] : s.dens >= ob.min * 0.7 ? ['warn', `Densidad algo baja para ${ob.n.toLowerCase()} (recomendado ${ob.min}–${ob.max} gotas/cm²)`] : ['mal', `Densidad baja para ${ob.n.toLowerCase()} (recomendado ${ob.min}–${ob.max} gotas/cm²)`];
    const maxH = Math.max(1, ...s.hist.slice(0, 100)), G = cfg.guardar;
    raiz.innerHTML = `<section><header><button data-a="x" aria-label="Cerrar">✕</button><b>Resultado del papel</b>${cfg.ver ? '' : '<button data-a="otra">↺ Otra foto</button>'}</header>
      <div class="res">
        <div class="card"><div class="tabs">${[['orig', 'Original'], ['filt', 'Filtrado'], ['gotas', 'Gotas contadas']].map(([k, t]) => `<button data-v="${k}" aria-pressed="${E.vista === k}">${t}</button>`).join('')}
          <span style="flex:1"></span><button data-z="-" aria-label="Alejar" style="padding:6px 12px">−</button><button data-z="+" aria-label="Acercar" style="padding:6px 12px">+</button></div>
          <div class="vista"><canvas></canvas></div>
          <p class="lnota">${E.vista === 'gotas' ? `Círculos: <b style="color:${COL[0]}">chicas</b> (&lt; ${E.clases.chica} µm), <b style="color:${COL[1]}">medianas</b>, <b style="color:${COL[2]}">grandes</b> (≥ ${E.clases.grande} µm). Las manchas formadas por gotas pegadas se cuentan como varias gotas (${s.separadas} en este papel). No se cuentan las que tocan el borde (0,5 mm).` : E.vista === 'filt' ? 'Filtro: el papel queda blanco y las manchas en azul según su intensidad; las gotas chicas y tenues quedan celestes pero se cuentan.' : 'Imagen original enderezada.'}</p></div>
        <div class="card"><div class="tiles">
          <div class="tile"><span>Cobertura</span><b>${f(s.cob, 1)} %</b><span>superficie manchada</span></div>
          <div class="tile"><span>Densidad</span><b>${f(s.dens, 0)}</b><span>gotas/cm²</span></div>
          <div class="tile"><span>Gotas contadas</span><b>${f(s.n)}</b><span>en ${f(s.areaCm2, 1)} cm²</span></div>
          <div class="tile"><span>DMV (Dv0,5)</span><b>${f(s.dmv)} µm</b><span>${h(s.clase)}</span></div>
          <div class="tile"><span>Dv0,1 · Dv0,9</span><b style="font-size:1rem">${f(s.dv01)} · ${f(s.dv09)} µm</b><span>amplitud ${f(s.span, 2)}</span></div>
          <div class="tile"><span>Volumen en el papel</span><b>${f(s.litrosHa, 1)}</b><span>L/ha (estimado)</span></div></div>
          <div class="cls">${[0, 1, 2].map(k => `<div><b style="color:${COL[k]}">${NOMCL[k]}</b><span class="b"><i style="width:${s.pct[k]}%;background:${COL[k]}"></i></span><span>${f(s.clases[k])} · ${f(s.pct[k], 0)} %</span></div>`).join('')}</div>
          <div><span class="lnota">Gotas por tamaño (cada barra = 10 µm, hasta 1 mm)</span><div class="hist">${s.hist.slice(0, 100).map((c, k) => `<i title="${k * 10}–${k * 10 + 10} µm: ${c}" style="height:${c / maxH * 100}%;background:${COL[(k + 0.5) * 10 < E.clases.chica ? 0 : (k + 0.5) * 10 < E.clases.grande ? 1 : 2]}"></i>`).join('')}</div></div>
          <p class="${ev[0]}" style="margin:0;font-weight:600">${ev[1]}.</p>
          ${s.cob > 25 ? '<p class="warn" style="margin:0">Cobertura alta: muchas manchas se superponen y el conteo de gotas es aproximado. La cobertura sigue siendo confiable.</p>' : ''}
          ${s.umPx > 70 ? '<p class="warn" style="margin:0">Resolución baja: las gotas chicas pueden no verse. Acercá la cámara o usá un escáner (600 a 1200 dpi).</p>' : ''}
          <p class="lnota">Diámetro de gota estimado desde la mancha con el factor de expansión del papel (d = 0,95·s<sup>0,91</sup>, DepositScan). Gota mínima detectable ≈ ${f(s.minDet)} µm. Clase de gota según ASABE S572.3 (orientativa).</p></div>
        <div class="card"><b>Ajustes</b><div class="g2">
          <label class="f">Producto aplicado (para evaluar la densidad)<select data-c="obj">${Object.entries(OBJETIVOS).map(([k, o]) => `<option value="${k}" ${k === E.objetivo ? 'selected' : ''}>${o.n} (${o.min}–${o.max})</option>`).join('')}</select></label>
          <label class="f">Sensibilidad para manchas tenues: ${E.sens}<input type="range" min="1" max="5" step="1" value="${E.sens}" data-c="sens"></label>
          <label class="f">Chicas por debajo de (µm)<input type="number" value="${E.clases.chica}" step="10" data-c="chica"></label>
          <label class="f">Grandes desde (µm)<input type="number" value="${E.clases.grande}" step="10" data-c="grande"></label></div></div>
        ${G ? `<div class="card" id="lec-guardar"><b>Guardar esta tarjeta</b><div class="g2">
          <label class="f">Aplicación<select data-g="aplicacion">${G.campos.aplicaciones.map(o => `<option value="${h(o.v)}" ${o.v == G.campos.aplSel ? 'selected' : ''}>${h(o.t)}</option>`).join('')}</select></label>
          <label class="f">Parcela<select data-g="parcela"><option value="">Sin parcela (general)</option>${G.campos.parcelas.map(o => `<option value="${h(o.v)}" ${o.v == G.campos.parSel ? 'selected' : ''}>${h(o.t)}</option>`).join('')}</select></label>
          <label class="f">Posición<select data-g="posicion">${G.campos.posiciones.map(o => `<option ${o === G.campos.posSel ? 'selected' : ''}>${h(o)}</option>`).join('')}</select></label>
          <label class="f">Metro lineal (muestra)<input type="text" data-g="metro" value="${h(G.campos.metro || 'Metro 1')}"></label>
          <label class="f" style="grid-column:1/-1">Observaciones<input type="text" data-g="obs" placeholder="Opcional"></label></div>
          <p class="lnota">Las tarjetas con el mismo metro lineal se suman: la cobertura del metro es el total manchado sobre el total de papel de ese metro.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="pri" data-a="g-otra">Guardar y leer otra del mismo metro</button><button data-a="g-sig">Guardar y pasar al metro siguiente</button><button data-a="g-fin">Guardar y terminar</button></div>
          <p class="lnota" data-t="gmsg">${E.guardadas ? `${E.guardadas} tarjeta${E.guardadas > 1 ? 's' : ''} guardada${E.guardadas > 1 ? 's' : ''} en esta sesión.` : ''}</p></div>` : ''}
      </div><footer style="justify-content:flex-end"><button data-a="x">${G ? 'Salir sin guardar' : 'Cerrar'}</button></footer></section>`;
    dibujarVista();
    raiz.onclick = async e => { const v = e.target.closest('[data-v]'); if (v) { E.vista = v.dataset.v; pantallaRes(); return; }
      const z = e.target.closest('[data-z]'); if (z) { E.zoom = Math.max(1, Math.min(8, E.zoom * (z.dataset.z === '+' ? 1.6 : 1 / 1.6))); dibujarVista(); return; }
      const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'x') cerrar(); if (a === 'otra') pantallaCam();
      if (a?.startsWith('g-')) await guardar(a); };
    raiz.onchange = async e => { const c = e.target.dataset.c; if (!c) return;
      if (c === 'obj') { E.objetivo = e.target.value; pantallaRes(); return; }
      if (c === 'sens') E.sens = +e.target.value; if (c === 'chica') E.clases.chica = +e.target.value || CLASES.chica; if (c === 'grande') E.clases.grande = +e.target.value || CLASES.grande;
      const pos = raiz.querySelector('.res').scrollTop; await analizarYMostrar(); raiz.querySelector('.res').scrollTop = pos; };
  }
  function dibujarVista() {
    const cv = raiz.querySelector('.vista canvas'), cont = raiz.querySelector('.vista'), R = E.r, W = R.W, H = R.H, x = cv.getContext('2d');
    const rot = cont.clientWidth < 620 && W > H; // en el celular el papel se muestra parado, para verlo más grande
    const off = document.createElement('canvas'); off.width = W; off.height = H; off.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(E.vista === 'orig' ? E.rect.data : R.filt), W, H), 0, 0);
    cv.width = rot ? H : W; cv.height = rot ? W : H; const k = (cont.clientWidth - 2) / cv.width * E.zoom; cv.style.width = cv.width * k + 'px'; cv.style.height = cv.height * k + 'px';
    if (rot) x.setTransform(0, 1, -1, 0, H, 0); else x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(off, 0, 0);
    if (E.vista === 'gotas') { x.lineWidth = Math.max(1, 1.4 / k); const um = 1000 / E.pxmm;
      for (const g of R.gotas) { if (g.borde) continue; x.strokeStyle = COL[g.c]; x.beginPath(); x.arc(g.x + 0.5, g.y + 0.5, Math.max(1.5, g.s / um / 2 + 1), 0, 7); x.stroke(); }
      const bp = 0.5 * E.pxmm; x.setLineDash([6, 4]); x.strokeStyle = '#64748b'; x.strokeRect(bp, bp, W - 2 * bp, H - 2 * bp); x.setLineDash([]); }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
  async function guardar(modo) {
    const G = cfg.guardar, val = k => raiz.querySelector(`[data-g="${k}"]`)?.value ?? '', b = raiz.querySelector(`[data-a="${modo}"]`); b.disabled = true;
    try {
      E.blob = E.blob || await aBlob(E.rect);
      const st = {...E.r.st, hist: histCompacto(E.r.st.hist)};
      const datos = {aplicacion: val('aplicacion'), parcela: val('parcela'), posicion: val('posicion'), metro: val('metro').trim() || 'Metro 1', obs: val('obs').trim(), objetivo: E.objetivo,
        st, pxmm: E.pxmm, papel: E.medidaUsada, sens: E.sens, clases: {...E.clases}, blob: E.blob};
      const r = await G.onGuardar(datos); E.guardadas++;
      G.campos.aplSel = datos.aplicacion; G.campos.parSel = datos.parcela; G.campos.posSel = datos.posicion;
      if (modo === 'g-fin') return cerrar();
      if (modo === 'g-sig') { const m = datos.metro.match(/^(.*?)(\d+)\s*$/); G.campos.metro = m ? m[1] + (+m[2] + 1) : datos.metro + ' 2'; } else G.campos.metro = datos.metro;
      cfg.aviso?.(r || 'Tarjeta guardada'); pantallaCam();
    } catch (e) { console.error(e); b.disabled = false; raiz.querySelector('[data-t=gmsg]').textContent = 'No se pudo guardar: ' + e.message; }
  }

  /* ---------------- arranque ---------------- */
  if (cfg.ver) { (async () => { raiz.innerHTML = '<section><header><b>Abriendo…</b></header><div class="esp"></div><footer></footer></section>';
    const bmp = await createImageBitmap(cfg.ver.blob), id = aImageData(bmp, bmp.width, bmp.height); E.rect = {data: id.data, width: id.width, height: id.height}; E.pxmm = cfg.ver.pxmm; E.medidaUsada = cfg.ver.papel;
    E.sens = cfg.ver.sens ?? 3; E.clases = {...E.clases, ...(cfg.ver.clases || {})}; E.objetivo = cfg.ver.objetivo || E.objetivo; E.vista = 'gotas'; await analizarYMostrar(); })(); }
  else pantallaCam();
  return {cerrar};
}
