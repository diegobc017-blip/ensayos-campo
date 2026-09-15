import { openModal, confirmDialog } from './ui.js';
import { eliminarImagen } from '../db/imagenesRepo.js';

// Cada contenedor de galería guarda sus propias object URLs para poder
// revocarlas la próxima vez que se vuelva a pintar sobre el mismo container
// (evita que las URLs viejas se acumulen en memoria al cambiar de filtro/tab).
const urlsPorContainer = new WeakMap();

/**
 * Pinta una grilla de miniaturas. `imagenes` es un array de registros del
 * store `imagenes`. Al tocar una miniatura se abre un lightbox con la
 * imagen completa, su nota y un botón para eliminarla.
 */
export function renderGaleria(container, imagenes, onCambio) {
  const urlsPrevias = urlsPorContainer.get(container);
  if (urlsPrevias) urlsPrevias.forEach(u => URL.revokeObjectURL(u));

  container.innerHTML = '';
  const urlsCreadas = [];
  urlsPorContainer.set(container, urlsCreadas);

  if (imagenes.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'field-hint';
    vacio.textContent = 'Todavía no hay fotos cargadas.';
    container.appendChild(vacio);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';
  container.appendChild(grid);

  for (const img of imagenes) {
    const thumbUrl = URL.createObjectURL(img.thumbnailBlob || img.blob);
    urlsCreadas.push(thumbUrl);
    const thumb = document.createElement('img');
    thumb.className = 'gallery-thumb';
    thumb.src = thumbUrl;
    thumb.loading = 'lazy';
    thumb.addEventListener('click', () => abrirLightbox(img, onCambio));
    grid.appendChild(thumb);
  }
}

function abrirLightbox(imagen, onCambio) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';

  const fullUrl = URL.createObjectURL(imagen.blob);
  const img = document.createElement('img');
  img.src = fullUrl;
  overlay.appendChild(img);

  const caption = document.createElement('div');
  caption.className = 'lightbox-caption';
  const fecha = new Date(imagen.fecha).toLocaleString();
  caption.textContent = `${fecha}${imagen.nota ? ' — ' + imagen.nota : ''}`;
  overlay.appendChild(caption);

  const btnRow = document.createElement('div');
  btnRow.className = 'btn-row';
  btnRow.style.marginTop = '14px';

  const cerrar = document.createElement('button');
  cerrar.className = 'btn';
  cerrar.textContent = 'Cerrar';
  btnRow.appendChild(cerrar);

  const eliminar = document.createElement('button');
  eliminar.className = 'btn btn-danger';
  eliminar.textContent = 'Eliminar';
  btnRow.appendChild(eliminar);

  overlay.appendChild(btnRow);

  function cerrarOverlay() {
    URL.revokeObjectURL(fullUrl);
    overlay.remove();
  }

  cerrar.addEventListener('click', cerrarOverlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarOverlay(); });
  eliminar.addEventListener('click', async () => {
    const ok = await confirmDialog({
      titulo: 'Eliminar foto',
      mensaje: '¿Seguro que querés eliminar esta foto? No se puede deshacer.',
      textoConfirmar: 'Eliminar',
      peligroso: true
    });
    if (ok) {
      await eliminarImagen(imagen.id);
      cerrarOverlay();
      onCambio?.();
    }
  });

  document.body.appendChild(overlay);
}
