import { listarTratamientos } from '../db/tratamientosRepo.js';
import { obtenerDiseno, tieneDiseno, actualizarCeldaTratamiento, etiquetaBloque } from '../db/layoutRepo.js';
import { validarEdicionManual } from '../domain/randomizer.js';
import { openModal, showToast, confirmDialog } from '../components/ui.js';
import { agregarImagen, listarImagenes } from '../db/imagenesRepo.js';
import { agregarNota, listarNotas } from '../db/notasRepo.js';
import { crearBotonImagen } from '../components/imagePicker.js';
import { navegar } from '../router.js';

export async function render(main, ensayo) {
  const [tratamientos, { bloques, celdasPorBloque }] = await Promise.all([
    listarTratamientos(ensayo.id),
    obtenerDiseno(ensayo.id)
  ]);

  if (!tieneDiseno(bloques)) {
    main.innerHTML = `
      <div class="empty-state">
        <h3>Todavía no generaste el diseño</h3>
        <p>Andá a la pestaña "Diseño" para fijar el primer bloque y generar el resto.</p>
      </div>
    `;
    return;
  }

  const tratamientosPorId = new Map(tratamientos.map(t => [t.id, t]));
  const esBCA = ensayo.tipoDiseno === 'BCA' || !ensayo.tipoDiseno;
  // Para franjas cruzadas, una celda solo puede tomar el valor de una de las
  // combinaciones A×B generadas (no un nivel suelto de Factor A o B).
  const opcionesCelda = ensayo.tipoDiseno === 'FRANJA'
    ? tratamientos.filter(t => t.factor === 'combo')
    : tratamientos;

  // Reconstruye la matriz de filas de tratamientoId (para validar adyacencia)
  const filas = bloques.map(b => (celdasPorBloque.get(b.id) || []).map(c => c.tratamientoId));

  main.innerHTML = `
    <div class="card">
      <h3>Mapa de campo</h3>
      <p class="field-hint">Tocá una parcela para ver detalle, editarla manualmente o agregar fotos/notas.</p>
      <div class="campo-grid" id="campo-grid"></div>
    </div>
  `;

  const grid = main.querySelector('#campo-grid');

  bloques.forEach((bloque, filaIndice) => {
    const celdas = celdasPorBloque.get(bloque.id) || [];
    const filaDiv = document.createElement('div');
    filaDiv.className = 'campo-fila';

    const label = document.createElement('div');
    label.className = 'campo-fila-label';
    label.textContent = etiquetaBloque(bloque);
    filaDiv.appendChild(label);

    celdas.forEach((celda) => {
      const t = tratamientosPorId.get(celda.tratamientoId);
      const conflicto = esBCA && validarEdicionManual(filas, filaIndice, celda.posicion, celda.tratamientoId)
        .some(msg => msg.includes('adyacente'));

      const celdaDiv = document.createElement('div');
      celdaDiv.className = 'campo-celda' + (conflicto ? ' conflicto' : '') + (celda.editadaManualmente ? ' editada' : '');
      celdaDiv.style.background = t ? hexConAlfa(t.color, 0.18) : '';
      celdaDiv.style.borderColor = t ? t.color : '';
      celdaDiv.innerHTML = `
        <span class="celda-codigo">${t ? t.codigo : '?'}</span>
        <span class="celda-pos">pos. ${celda.posicion + 1}</span>
      `;
      celdaDiv.addEventListener('click', () => abrirDetalleCelda(celda, filaIndice));
      filaDiv.appendChild(celdaDiv);
    });

    grid.appendChild(filaDiv);
  });

  function hexConAlfa(hex, alfa) {
    if (!hex) return '';
    const m = hex.replace('#', '');
    const r = parseInt(m.substring(0, 2), 16);
    const g = parseInt(m.substring(2, 4), 16);
    const b = parseInt(m.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alfa})`;
  }

  function abrirDetalleCelda(celda, filaIndice) {
    openModal((box, close) => {
      pintarModal(box, close, celda, filaIndice);
    });
  }

  async function pintarModal(box, close, celda, filaIndice) {
    const t = tratamientosPorId.get(celda.tratamientoId);
    const [imagenes, notas] = await Promise.all([
      listarImagenes(ensayo.id, { celdaId: celda.id }),
      listarNotas(ensayo.id, { celdaId: celda.id })
    ]);

    box.innerHTML = `
      <h3>${etiquetaBloque(bloques[filaIndice])} — posición ${celda.posicion + 1}</h3>
      <p><strong>Tratamiento actual:</strong> ${t ? `${t.codigo} — ${t.nombre}` : '(desconocido)'}</p>
      <div class="field">
        <label for="sel-tratamiento">Cambiar tratamiento (edición manual)</label>
        <select id="sel-tratamiento">
          ${opcionesCelda.map(tt => `<option value="${tt.id}" ${tt.id === celda.tratamientoId ? 'selected' : ''}>${tt.codigo} — ${tt.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary btn-sm" id="btn-guardar-celda">Guardar cambio</button>
      </div>
      <div class="section-title">
        <p><strong>Fotos de esta parcela:</strong> ${imagenes.length}</p>
        <p><strong>Notas de esta parcela:</strong> ${notas.length}</p>
        <div class="field">
          <label for="nota-rapida">Agregar nota rápida</label>
          <textarea id="nota-rapida" placeholder="Observación..."></textarea>
        </div>
        <div class="btn-row" id="acciones-rapidas"></div>
      </div>
      <div class="btn-row">
        <button class="btn" id="btn-cerrar">Cerrar</button>
      </div>
    `;

    box.querySelector('#btn-guardar-celda').addEventListener('click', async () => {
      const nuevoTratamientoId = box.querySelector('#sel-tratamiento').value;
      if (nuevoTratamientoId === celda.tratamientoId) { close(); return; }
      const conflictos = esBCA ? validarEdicionManual(filas, filaIndice, celda.posicion, nuevoTratamientoId) : [];
      if (conflictos.length > 0) {
        const ok = await confirmDialog({
          titulo: 'Esto rompe la regla de no-adyacencia',
          mensaje: conflictos.join(' '),
          textoConfirmar: 'Guardar igual',
          peligroso: true
        });
        if (!ok) return;
      }
      await actualizarCeldaTratamiento(celda.id, nuevoTratamientoId, true);
      close();
      showToast('Parcela actualizada');
      render(main, ensayo);
    });

    const accionesDiv = box.querySelector('#acciones-rapidas');
    const btnFoto = crearBotonImagen({
      texto: '+ Foto de esta parcela',
      onImagenLista: async ({ blob, thumbnailBlob, nombreArchivo }) => {
        await agregarImagen({
          ensayoId: ensayo.id,
          bloqueId: celda.bloqueId,
          celdaId: celda.id,
          etapa: 'seguimiento',
          blob,
          thumbnailBlob,
          nombreArchivo
        });
        showToast('Foto agregada');
        close();
      }
    });
    accionesDiv.appendChild(btnFoto);

    const btnNota = document.createElement('button');
    btnNota.className = 'btn';
    btnNota.textContent = 'Guardar nota';
    btnNota.addEventListener('click', async () => {
      const texto = box.querySelector('#nota-rapida').value.trim();
      if (!texto) { showToast('Escribí algo primero', 'error'); return; }
      await agregarNota({ ensayoId: ensayo.id, bloqueId: celda.bloqueId, celdaId: celda.id, texto });
      showToast('Nota guardada');
      close();
    });
    accionesDiv.appendChild(btnNota);

    box.querySelector('#btn-cerrar').addEventListener('click', close);
  }
}
