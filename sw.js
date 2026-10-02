// sw.js — guarda la app en el equipo para que abra sin internet. Versión generada: 8f97dc3693
const CACHE = 'ensayos-campo-v2-8f97dc3693';
const ARCHIVOS = ["./", "./index.html", "./manifest.json", "./datos/catalogo.json", "./datos/ensayo_demo.json", "./datos/ensayos_ejemplo.json", "./datos/metodos.json", "./fuentes/LICENSE-OFL.txt", "./fuentes/archivo-latin-400-normal.woff2", "./fuentes/archivo-latin-500-normal.woff2", "./fuentes/archivo-latin-600-normal.woff2", "./fuentes/archivo-latin-700-normal.woff2", "./fuentes/archivo-narrow-latin-500-normal.woff2", "./fuentes/archivo-narrow-latin-600-normal.woff2", "./fuentes/archivo-narrow-latin-700-normal.woff2", "./fuentes/fuentes.css", "./fuentes/jetbrains-mono-latin-400-normal.woff2", "./fuentes/jetbrains-mono-latin-500-normal.woff2", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./img/aerea_ejemplo_dbca.jpg", "./img/aerea_ejemplo_lal.jpg", "./img/falso_color.jpg", "./img/indices.png", "./img/papel_ejemplo.jpg", "./img/rgb.jpg", "./img/termico.png", "./js/app.js", "./js/db.js", "./js/estadistica.js", "./js/exportar.js", "./js/papel.js", "./js/data/ingredientesActivos.js", "./js/lib/geo.js", "./js/lib/hidro.js", "./js/lib/hidroWorker.js", "./js/lib/idGen.js", "./js/lib/importgeo.js", "./js/lib/ocr.js", "./js/lib/tablaImport.js", "./js/lib/textMatch.js", "./js/lib/xlsxImport.js", "./js/vendor/qrcode/qrcode.mjs", "./js/vendor/xlsx/xlsx.esm.min.mjs"];
// El motor de lectura de fotos (js/vendor/tesseract, ~6 MB) no se precarga: queda guardado la primera vez que se usa.
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting())); });
// Al activarse borra las copias viejas (también las de la app anterior) y, si venía de la app anterior, recarga las pestañas abiertas.
self.addEventListener('activate', e => { e.waitUntil((async () => {
  const viejas = (await caches.keys()).filter(k => k.startsWith('ensayos-campo') && k !== CACHE);
  const habiaAnterior = viejas.some(k => !k.startsWith('ensayos-campo-v2-'));
  await Promise.all(viejas.map(k => caches.delete(k))); await self.clients.claim();
  if (habiaAnterior) (await self.clients.matchAll({type: 'window'})).forEach(c => { if (!c.url.includes('/anterior/')) c.navigate(c.url).catch(() => {}); });
})()); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const guardada = await c.match(e.request, {ignoreSearch: true});
    const red = fetch(e.request.mode === 'navigate' ? e.request : new Request(e.request, {cache: 'no-cache'})).then(r => { if (r && r.status === 200 && r.type === 'basic') c.put(e.request, r.clone()); return r; }).catch(() => guardada);
    return guardada || red;
  }));
});
