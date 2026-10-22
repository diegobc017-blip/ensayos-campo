// sw.js — guarda la app en el equipo para que abra sin internet. Versión generada: 4e3cc86e35
const CACHE = 'ensayos-campo-v2-4e3cc86e35';
const ARCHIVOS = ["./", "./index.html", "./manifest.json", "./datos/catalogo.json", "./datos/cultivares.json", "./datos/ensayo_demo.json", "./datos/ensayos_ejemplo.json", "./datos/fenologia.json", "./datos/metodos.json", "./datos/rubros.json", "./fuentes/LICENSE-OFL.txt", "./fuentes/archivo-latin-400-normal.woff2", "./fuentes/archivo-latin-500-normal.woff2", "./fuentes/archivo-latin-600-normal.woff2", "./fuentes/archivo-latin-700-normal.woff2", "./fuentes/archivo-narrow-latin-500-normal.woff2", "./fuentes/archivo-narrow-latin-600-normal.woff2", "./fuentes/archivo-narrow-latin-700-normal.woff2", "./fuentes/fuentes.css", "./fuentes/jetbrains-mono-latin-400-normal.woff2", "./fuentes/jetbrains-mono-latin-500-normal.woff2", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./img/aerea_ejemplo_dbca.jpg", "./img/aerea_ejemplo_lal.jpg", "./img/falso_color.jpg", "./img/indices.png", "./img/papel_ejemplo.jpg", "./img/rgb.jpg", "./img/termico.png", "./js/app.js", "./js/db.js", "./js/estadistica.js", "./js/exportar.js", "./js/papel.js", "./js/plan.js", "./js/data/ingredientesActivos.js", "./js/lib/geo.js", "./js/lib/hidro.js", "./js/lib/hidroWorker.js", "./js/lib/idGen.js", "./js/lib/importgeo.js", "./js/lib/ocr.js", "./js/lib/tablaImport.js", "./js/lib/textMatch.js", "./js/lib/xlsxImport.js", "./js/vendor/qrcode/qrcode.mjs", "./js/vendor/xlsx/xlsx.esm.min.mjs"];
// El motor de lectura de fotos (js/vendor/tesseract, ~6 MB) y las imágenes de las tarjetas de ejemplo (img/papeles) no se precargan: quedan guardados la primera vez que se usan.
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
// Avisos de lo que toca medir: la app deja programados los próximos y el navegador despierta al service worker de vez en cuando
// (sincronización periódica, en Chrome con la app instalada). También abre la app al tocar un aviso.
const URL_AVISOS = new URL('avisos-programados.json', self.registration.scope).href;
async function avisosProgramados() {
  const c = await caches.open('ensayos-avisos'), r = await c.match(URL_AVISOS); if (!r) return;
  const d = await r.json().catch(() => null); if (!d) return; const hoy = new Date().toISOString().slice(0, 10), hechos = d.hechos || [];
  const nuevos = (d.items || []).filter(i => i.fecha <= hoy && !hechos.includes(i.key)).slice(0, 5);
  for (const i of nuevos) await self.registration.showNotification(i.titulo, {body: i.cuerpo, tag: i.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: {url: self.registration.scope}});
  if (nuevos.length) await c.put(URL_AVISOS, new Response(JSON.stringify({items: d.items, hechos: [...hechos, ...nuevos.map(i => i.key)].slice(-300)}), {headers: {'Content-Type': 'application/json'}}));
}
self.addEventListener('periodicsync', e => { if (e.tag === 'avisos-ensayos') e.waitUntil(avisosProgramados()); });
self.addEventListener('notificationclick', e => { e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(l => { const w = l.find(c => c.url.startsWith(self.registration.scope) && 'focus' in c); return w ? w.focus() : self.clients.openWindow(e.notification.data?.url || self.registration.scope); })); });
