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
      corePath: new URL('tesseract-core-simd-lstm.wasm.js', BASE).href,
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
/**
 * Traduce un evento de progreso de Tesseract.js a un texto para mostrar al
 * usuario. La primera vez que se usa el OCR en el dispositivo hay una etapa
 * de preparación del motor (unos segundos) antes de poder leer la foto.
 */
export function mensajeProgreso(m) {
  if (m.status === 'recognizing text') return `Leyendo la foto... ${Math.round(m.progress * 100)}%`;
  if (m.status === 'loading language traineddata') return 'Preparando el motor de lectura (primera vez, no hace falta internet)...';
  if (m.status && m.status.includes('init')) return 'Preparando el motor de lectura (primera vez)...';
  return 'Preparando...';
}

export async function reconocerTexto(imagen, { onProgreso } = {}) {
  progresoActual = onProgreso || null;
  try {
    const worker = await obtenerWorker();
    const { data } = await worker.recognize(imagen);
    const lineas = (data.text || '').split('\n').map(l => l.trim()).filter(Boolean);
    return { texto: data.text || '', lineas };
  } finally {
    progresoActual = null;
  }
}
