// Lista reordenable táctil. En vez de drag-and-drop nativo (poco confiable
// en touch, especialmente con guantes/sol en el campo) se usan botones
// grandes de mover arriba/abajo, más robustos para uso en campo.

/**
 * @param {HTMLElement} container
 * @param {Array} items - objetos con al menos { id }
 * @param {(item:any)=>string} getLabel
 * @param {(item:any)=>string} getColor - opcional, color de fondo del chip
 * @param {(nuevoOrden:any[])=>void} onReorder
 */
export function renderReorderableList(container, items, getLabel, getColor, onReorder) {
  container.innerHTML = '';
  container.className = 'diseno-fila-fija';

  items.forEach((item, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'diseno-item';
    if (getColor) wrap.style.borderLeft = `6px solid ${getColor(item) || '#ccc'}`;

    const label = document.createElement('span');
    label.textContent = `${index + 1}. ${getLabel(item)}`;
    wrap.appendChild(label);

    const moverBtns = document.createElement('div');
    moverBtns.className = 'mover-btns';

    const up = document.createElement('button');
    up.className = 'btn btn-sm';
    up.type = 'button';
    up.textContent = '▲';
    up.disabled = index === 0;
    up.addEventListener('click', () => {
      const nuevo = items.slice();
      [nuevo[index - 1], nuevo[index]] = [nuevo[index], nuevo[index - 1]];
      onReorder(nuevo);
    });

    const down = document.createElement('button');
    down.className = 'btn btn-sm';
    down.type = 'button';
    down.textContent = '▼';
    down.disabled = index === items.length - 1;
    down.addEventListener('click', () => {
      const nuevo = items.slice();
      [nuevo[index + 1], nuevo[index]] = [nuevo[index], nuevo[index + 1]];
      onReorder(nuevo);
    });

    moverBtns.appendChild(up);
    moverBtns.appendChild(down);
    wrap.appendChild(moverBtns);
    container.appendChild(wrap);
  });
}
