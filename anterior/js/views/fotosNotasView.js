import { obtenerDiseno, tieneDiseno, etiquetaBloque } from '../db/layoutRepo.js';
import { listarTratamientos } from '../db/tratamientosRepo.js';
import { listarImagenes, agregarImagen } from '../db/imagenesRepo.js';
import { listarNotas, agregarNota, eliminarNota } from '../db/notasRepo.js';
import { renderGaleria } from '../components/gallery.js';
import { crearBotonImagen } from '../components/imagePicker.js';
import { openModal, showToast, confirmDialog } from '../components/ui.js';
import { habilitarDictado } from '../components/voiceInput.js';

export async function render(main, ensayo) {
  const [tratamientos, { bloques, celdasPorBloque }] = await Promise.all([
    listarTratamientos(ensayo.id),
    obtenerDiseno(ensayo.id)
  ]);
  const tratamientosPorId = new Map(tratamientos.map(t => [t.id, t]));

  const opcionesBloque = bloques.map((b) => ({ id: b.id, etiqueta: etiquetaBloque(b) }));
  const opcionesParcela = [];
  bloques.forEach((b) => {
    (celdasPorBloque.get(b.id) || []).forEach(c => {
      const t = tratamientosPorId.get(c.tratamientoId);
      opcionesParcela.push({ id: c.id, bloqueId: b.id, etiqueta: `${etiquetaBloque(b)} · pos. ${c.posicion + 1} · ${t ? t.codigo : '?'}` });
    });
  });

  let filtro = { nivel: 'ensayo', bloqueId: null, celdaId: null };

  main.innerHTML = `
    <div class="card">
      <h3>Fotos y notas</h3>
      <div class="field">
        <label for="filtro-nivel">Ver</label>
        <select id="filtro-nivel">
          <option value="ensayo">Todo el ensayo</option>
          ${tieneDiseno(bloques) ? '<option value="bloque">Por bloque</option><option value="parcela">Por parcela</option>' : ''}
        </select>
      </div>
      <div class="field" id="filtro-detalle-wrap" hidden>
        <label for="filtro-detalle">Elegir</label>
        <select id="filtro-detalle"></select>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-agregar-foto">+ Agregar foto</button>
        <button class="btn" id="btn-agregar-nota">+ Agregar nota</button>
      </div>
    </div>

    <div class="card">
      <h4>Fotos</h4>
      <div id="galeria"></div>
    </div>

    <div class="card">
      <h4>Notas</h4>
      <div id="lista-notas"></div>
    </div>
  `;

  const nivelSelect = main.querySelector('#filtro-nivel');
  const detalleWrap = main.querySelector('#filtro-detalle-wrap');
  const detalleSelect = main.querySelector('#filtro-detalle');

  function actualizarDetalleOpciones() {
    if (filtro.nivel === 'bloque') {
      detalleWrap.hidden = false;
      detalleSelect.innerHTML = opcionesBloque.map(o => `<option value="${o.id}">${o.etiqueta}</option>`).join('');
    } else if (filtro.nivel === 'parcela') {
      detalleWrap.hidden = false;
      detalleSelect.innerHTML = opcionesParcela.map(o => `<option value="${o.id}">${o.etiqueta}</option>`).join('');
    } else {
      detalleWrap.hidden = true;
    }
  }
  actualizarDetalleOpciones();

  function filtroActualParaConsulta() {
    if (filtro.nivel === 'bloque') return { bloqueId: detalleSelect.value };
    if (filtro.nivel === 'parcela') return { celdaId: detalleSelect.value };
    return {};
  }

  async function refrescar() {
    const consulta = filtroActualParaConsulta();
    const [imagenes, notas] = await Promise.all([
      listarImagenes(ensayo.id, consulta),
      listarNotas(ensayo.id, consulta)
    ]);
    renderGaleria(main.querySelector('#galeria'), imagenes, refrescar);

    const notasCont = main.querySelector('#lista-notas');
    if (notas.length === 0) {
      notasCont.innerHTML = '<p class="field-hint">Sin notas para este filtro.</p>';
    } else {
      notasCont.innerHTML = '';
      const ul = document.createElement('ul');
      ul.className = 'list-plain';
      notas.forEach(n => {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.innerHTML = `
          <div class="list-item-main">
            <div class="list-item-title">${n.texto}</div>
            <div class="list-item-sub">${new Date(n.fecha).toLocaleString()}</div>
          </div>
          <button class="btn btn-sm btn-danger" data-id="${n.id}">Eliminar</button>
        `;
        li.querySelector('button').addEventListener('click', async () => {
          const ok = await confirmDialog({ titulo: 'Eliminar nota', mensaje: '¿Eliminar esta nota?', textoConfirmar: 'Eliminar', peligroso: true });
          if (ok) { await eliminarNota(n.id); refrescar(); }
        });
        ul.appendChild(li);
      });
      notasCont.appendChild(ul);
    }
  }

  nivelSelect.addEventListener('change', () => {
    filtro.nivel = nivelSelect.value;
    actualizarDetalleOpciones();
    refrescar();
  });
  detalleSelect.addEventListener('change', refrescar);

  function abrirSelectorAsociacion(titulo, onElegido) {
    openModal((box, close) => {
      box.innerHTML = `
        <h3>${titulo}</h3>
        <div class="field">
          <label for="asoc-nivel">Asociar a</label>
          <select id="asoc-nivel">
            <option value="ensayo">Todo el ensayo</option>
            ${tieneDiseno(bloques) ? '<option value="bloque">Un bloque</option><option value="parcela">Una parcela</option>' : ''}
          </select>
        </div>
        <div class="field" id="asoc-detalle-wrap" hidden>
          <label for="asoc-detalle">Elegir</label>
          <select id="asoc-detalle"></select>
        </div>
        <div class="btn-row" id="asoc-acciones"></div>
      `;
      const asocNivel = box.querySelector('#asoc-nivel');
      const asocWrap = box.querySelector('#asoc-detalle-wrap');
      const asocDetalle = box.querySelector('#asoc-detalle');

      function actualizar() {
        if (asocNivel.value === 'bloque') {
          asocWrap.hidden = false;
          asocDetalle.innerHTML = opcionesBloque.map(o => `<option value="${o.id}">${o.etiqueta}</option>`).join('');
        } else if (asocNivel.value === 'parcela') {
          asocWrap.hidden = false;
          asocDetalle.innerHTML = opcionesParcela.map(o => `<option value="${o.id}">${o.etiqueta}</option>`).join('');
        } else {
          asocWrap.hidden = true;
        }
      }
      actualizar();
      asocNivel.addEventListener('change', actualizar);

      onElegido(box, close, () => {
        const nivel = asocNivel.value;
        if (nivel === 'bloque') return { bloqueId: asocDetalle.value };
        if (nivel === 'parcela') {
          const opt = opcionesParcela.find(o => o.id === asocDetalle.value);
          return { celdaId: asocDetalle.value, bloqueId: opt?.bloqueId };
        }
        return {};
      });
    });
  }

  main.querySelector('#btn-agregar-foto').addEventListener('click', () => {
    abrirSelectorAsociacion('Agregar foto', (box, close, getAsociacion) => {
      const acciones = box.querySelector('#asoc-acciones');
      const btn = crearBotonImagen({
        onImagenLista: async ({ blob, thumbnailBlob, nombreArchivo }) => {
          const asoc = getAsociacion();
          await agregarImagen({ ensayoId: ensayo.id, ...asoc, etapa: ensayo.estado === 'planificacion' ? 'planificacion' : 'seguimiento', blob, thumbnailBlob, nombreArchivo });
          showToast('Foto agregada');
          close();
          refrescar();
        }
      });
      acciones.appendChild(btn);
    });
  });

  main.querySelector('#btn-agregar-nota').addEventListener('click', () => {
    abrirSelectorAsociacion('Agregar nota', (box, close, getAsociacion) => {
      const acciones = box.querySelector('#asoc-acciones');
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.style.width = '100%';
      wrap.innerHTML = `<textarea id="texto-nota" placeholder="Escribí la nota... o dictala con el micrófono"></textarea>`;
      box.insertBefore(wrap, acciones);
      habilitarDictado(wrap.querySelector('#texto-nota'));

      const btnGuardar = document.createElement('button');
      btnGuardar.className = 'btn btn-primary';
      btnGuardar.textContent = 'Guardar nota';
      btnGuardar.addEventListener('click', async () => {
        const texto = box.querySelector('#texto-nota').value.trim();
        if (!texto) { showToast('Escribí algo primero', 'error'); return; }
        const asoc = getAsociacion();
        await agregarNota({ ensayoId: ensayo.id, ...asoc, texto });
        showToast('Nota guardada');
        close();
        refrescar();
      });
      acciones.appendChild(btnGuardar);
    });
  });

  refrescar();
}
