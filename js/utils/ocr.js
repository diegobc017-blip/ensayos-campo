// Reconocimiento de texto en imágenes (OCR), 100% en el dispositivo: usa
// Tesseract.js con los archivos del motor (worker, wasm y datos de idioma
// español) empaquetados localmente en js/vendor/tesseract/, así que no
// depende de internet ni de ningún servicio externo — funciona igual que
// el resto de la app, incluso instalada desde una IP local sin HTTPS.

import Tesseract from '../vendor/tesseract/tesseract.esm.min.js';

const { createWorker } = Tesseract;

const BASE = new URL('../vendor/tesseract/', import.meta.url);

let workerPromise = null;
let progresoActual = null;

function obtenerWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('spa', 1, {
      workerPath: new URL('worker.min.js', BASE).href,
      corePath: new URL('tesseract-core-lstm.js', BASE).href,
      langPath: new URL('lang/', BASE).href,
      logger: (m) => { if (progresoActual) progresoActual(m); }
    });
  }
  return workerPromise;
}

/**
 * Reconoce el texto de una imagen (File/Blob). Devuelve el texto completo y
 * un array con las líneas no vacías detectadas (una línea por renglón de
 * texto en la foto).
 *
 * @param {Blob} imagen
 * @param {{onProgreso?: (m: {status:string, progress:number}) => void}} [opciones]
 */
export async function reconocerTexto(imagen, { onProgreso } = {}) {
  const worker = await obtenerWorker();
  progresoActual = onProgreso || null;
  try {
    const { data } = await worker.recognize(imagen);
    const lineas = (data.text || '').split('\n').map(l => l.trim()).filter(Boolean);
    return { texto: data.text || '', lineas };
  } finally {
    progresoActual = null;
  }
}
