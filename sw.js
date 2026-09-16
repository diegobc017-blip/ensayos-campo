const CACHE_NAME = 'ensayos-campo-v6';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/components.css',
  './css/grid.css',
  './css/print.css',
  './js/app.js',
  './js/router.js',
  './js/db/db.js',
  './js/db/ensayosRepo.js',
  './js/db/tratamientosRepo.js',
  './js/db/layoutRepo.js',
  './js/db/imagenesRepo.js',
  './js/db/notasRepo.js',
  './js/db/resultadosRepo.js',
  './js/db/productosComercialesRepo.js',
  './js/domain/randomizer.js',
  './js/domain/reportes.js',
  './js/domain/dosificacion.js',
  './js/data/ingredientesActivos.js',
  './js/views/ensayosListView.js',
  './js/views/ensayoFormView.js',
  './js/views/tratamientosView.js',
  './js/views/dosificacionView.js',
  './js/views/disenoView.js',
  './js/views/mapaCampoView.js',
  './js/views/resultadosView.js',
  './js/views/informeView.js',
  './js/views/fotosNotasView.js',
  './js/views/backupView.js',
  './js/views/importarTablaModal.js',
  './js/components/ui.js',
  './js/components/dragSortable.js',
  './js/components/imagePicker.js',
  './js/components/gallery.js',
  './js/components/tabs.js',
  './js/components/voiceInput.js',
  './js/components/gridEditor.js',
  './js/utils/imageResize.js',
  './js/utils/idGen.js',
  './js/utils/exportImport.js',
  './js/utils/csvExport.js',
  './js/utils/ocr.js',
  './js/utils/textMatch.js',
  './js/utils/tablaImport.js',
  './js/utils/xlsxImport.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
  // Nota: los archivos del motor de OCR (js/vendor/tesseract/*, ~5 MB) y de
  // lectura de Excel (js/vendor/xlsx/*, ~400 KB) NO se precachean acá a
  // propósito, para no forzar esa descarga a quien nunca usa "cargar por
  // foto" o "importar Excel". Quedan cacheados solos (vía el handler
  // `fetch` de abajo) la primera vez que se usa cada función; de ahí en
  // más funcionan 100% offline igual que el resto de la app.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((respuestaRed) => {
          if (respuestaRed && respuestaRed.status === 200 && respuestaRed.type === 'basic') {
            const copia = respuestaRed.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return respuestaRed;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
