// sw.js — guarda la app en el equipo para que abra sin internet. Versión generada: ba4a75cfa2
const CACHE = 'ensayos-campo-v2-ba4a75cfa2';
const ARCHIVOS = ["./", "./index.html", "./manifest.json", "./datos/catalogo.json", "./datos/ensayo_demo.json", "./datos/ensayos_ejemplo.json", "./datos/metodos.json", "./fuentes/LICENSE-OFL.txt", "./fuentes/archivo-latin-400-normal.woff2", "./fuentes/archivo-latin-500-normal.woff2", "./fuentes/archivo-latin-600-normal.woff2", "./fuentes/archivo-latin-700-normal.woff2", "./fuentes/archivo-narrow-latin-500-normal.woff2", "./fuentes/archivo-narrow-latin-600-normal.woff2", "./fuentes/archivo-narrow-latin-700-normal.woff2", "./fuentes/fuentes.css", "./fuentes/jetbrains-mono-latin-400-normal.woff2", "./fuentes/jetbrains-mono-latin-500-normal.woff2", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./img/falso_color.jpg", "./img/indices.png", "./img/rgb.jpg", "./img/termico.png", "./js/app.js", "./js/db.js", "./js/estadistica.js", "./js/exportar.js", "./js/data/ingredientesActivos.js", "./js/lib/idGen.js", "./js/lib/ocr.js", "./js/lib/tablaImport.js", "./js/lib/textMatch.js", "./js/lib/xlsxImport.js", "./js/vendor/qrcode/qrcode.mjs", "./js/vendor/xlsx/xlsx.esm.min.mjs"];
// El motor de lectura de fotos (js/vendor/tesseract, ~6 MB) no se precarga: queda guardado la primera vez que se usa.
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ensayos-campo-v2-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const guardada = await c.match(e.request, {ignoreSearch: true});
    const red = fetch(e.request).then(r => { if (r && r.status === 200 && r.type === 'basic') c.put(e.request, r.clone()); return r; }).catch(() => guardada);
    return guardada || red;
  }));
});
