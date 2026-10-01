export function showToast(mensaje, tipo = 'info') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (tipo === 'error' ? ' toast-error' : '');
  el.textContent = mensaje;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/**
 * Abre un modal simple. `render(container, close)` debe pintar el contenido
 * dentro de `container`; `close()` cierra el modal.
 */
export function openModal(render) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const box = document.createElement('div');
  box.className = 'modal-box';
  overlay.appendChild(box);

  function close() {
    overlay.remove();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  root.appendChild(overlay);
  render(box, close);
  return close;
}

export function confirmDialog({ titulo, mensaje, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', peligroso = false }) {
  return new Promise((resolve) => {
    openModal((box, close) => {
      box.innerHTML = `
        <h3>${titulo}</h3>
        <p>${mensaje}</p>
        <div class="btn-row">
          <button class="btn ${peligroso ? 'btn-danger' : 'btn-primary'}" data-accion="ok">${textoConfirmar}</button>
          <button class="btn" data-accion="cancelar">${textoCancelar}</button>
        </div>
      `;
      box.querySelector('[data-accion="ok"]').addEventListener('click', () => { close(); resolve(true); });
      box.querySelector('[data-accion="cancelar"]').addEventListener('click', () => { close(); resolve(false); });
    });
  });
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}
