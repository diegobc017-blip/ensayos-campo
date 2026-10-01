/**
 * Renderiza una grilla de filas × columnas con un <select> editable en cada
 * celda. Se usa para revisar y corregir el resultado del reconocimiento de
 * texto antes de guardarlo como diseño: cada celda ya viene pre-cargada con
 * el mejor tratamiento detectado (o vacía si no se pudo interpretar), y el
 * usuario puede cambiar cualquiera antes de confirmar.
 *
 * @param {HTMLElement} cont
 * @param {(string|null)[][]} filas - ids de tratamiento por fila/columna (null = sin asignar)
 * @param {{id:string, codigo:string, nombre?:string}[]} opciones
 * @param {(indiceFila:number) => string} etiquetaFila
 * @param {(indiceFila:number, columna:number, nuevoId:string|null) => void} onCambiar
 */
export function renderGrillaEditable(cont, filas, opciones, etiquetaFila, onCambiar) {
  cont.innerHTML = '';
  cont.className = 'grilla-editable';
  filas.forEach((fila, i) => {
    const filaDiv = document.createElement('div');
    filaDiv.className = 'grilla-editable-fila';

    const label = document.createElement('strong');
    label.className = 'grilla-editable-label';
    label.textContent = etiquetaFila(i);
    filaDiv.appendChild(label);

    fila.forEach((id, c) => {
      const sel = document.createElement('select');
      sel.className = 'grilla-editable-celda' + (!id ? ' sin-asignar' : '');

      const vacia = document.createElement('option');
      vacia.value = '';
      vacia.textContent = '— sin asignar —';
      sel.appendChild(vacia);

      opciones.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.codigo;
        if (o.nombre) opt.title = o.nombre;
        if (o.id === id) opt.selected = true;
        sel.appendChild(opt);
      });
      if (!id) sel.value = '';

      sel.addEventListener('change', () => {
        sel.classList.toggle('sin-asignar', !sel.value);
        onCambiar(i, c, sel.value || null);
      });

      filaDiv.appendChild(sel);
    });

    cont.appendChild(filaDiv);
  });
}

/** Cuenta cuántas celdas de `filas` quedaron sin asignar (id null/vacío). */
export function contarSinAsignar(filas) {
  let n = 0;
  for (const fila of filas) {
    for (const id of fila) if (!id) n++;
  }
  return n;
}
