import { procesarImagen } from '../utils/imageResize.js';
import { showToast } from './ui.js';

/**
 * Crea un botón que abre el selector de archivo/cámara, procesa la imagen
 * (redimensiona + comprime) y llama a onImagenLista({ blob, thumbnailBlob, nombreArchivo }).
 */
export function crearBotonImagen({ texto = '+ Agregar foto', onImagenLista }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.textContent = texto;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.hidden = true;

  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Procesando...';
      const { blob, thumbnailBlob } = await procesarImagen(file);
      await onImagenLista({ blob, thumbnailBlob, nombreArchivo: file.name });
      btn.textContent = original;
    } catch (e) {
      console.error(e);
      showToast('No se pudo procesar la imagen', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  btn.addEventListener('click', () => input.click());

  const wrap = document.createElement('span');
  wrap.appendChild(btn);
  wrap.appendChild(input);
  return wrap;
}
