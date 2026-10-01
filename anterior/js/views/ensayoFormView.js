import { obtenerEnsayo, crearEnsayo, actualizarEnsayo, eliminarEnsayo, ETIQUETAS_DISENO } from '../db/ensayosRepo.js';
import { tieneDiseno, obtenerDiseno } from '../db/layoutRepo.js';
import { navegar } from '../router.js';
import { showToast, confirmDialog } from '../components/ui.js';
import { habilitarDictado } from '../components/voiceInput.js';
import { ETIQUETAS_PUNTO_CARDINAL } from '../domain/orientacion.js';

export async function render(main, setHeader, ensayoId) {
  const esEdicion = !!ensayoId;
  const ensayo = esEdicion ? await obtenerEnsayo(ensayoId) : null;

  if (esEdicion && !ensayo) {
    showToast('El ensayo no existe', 'error');
    navegar('#/');
    return;
  }

  setHeader(esEdicion ? 'Editar ensayo' : 'Nuevo ensayo', true, () => navegar(esEdicion ? `#/ensayo/${ensayoId}/tratamientos` : '#/'));

  let bloqueadoDiseno = false;
  if (esEdicion) {
    const { bloques } = await obtenerDiseno(ensayoId);
    bloqueadoDiseno = tieneDiseno(bloques);
  }

  main.innerHTML = `
    <form id="form-ensayo" class="card">
      <div class="field">
        <label for="f-nombre">Nombre del ensayo</label>
        <input id="f-nombre" required value="${ensayo?.nombre || ''}">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-cultivo">Cultivo</label>
          <input id="f-cultivo" value="${ensayo?.cultivo || ''}">
        </div>
        <div class="field">
          <label for="f-ubicacion">Ubicación</label>
          <input id="f-ubicacion" value="${ensayo?.ubicacion || ''}">
        </div>
      </div>
      <div class="field">
        <label for="f-fecha">Fecha de siembra</label>
        <input id="f-fecha" type="date" value="${ensayo?.fechaSiembra || ''}">
      </div>
      <div class="field">
        <label for="f-tipodiseno">Tipo de diseño experimental</label>
        <select id="f-tipodiseno" ${bloqueadoDiseno ? 'disabled' : ''}>
          ${Object.entries(ETIQUETAS_DISENO).map(([valor, etiqueta]) => `
            <option value="${valor}" ${(ensayo?.tipoDiseno || 'BCA') === valor ? 'selected' : ''}>${etiqueta}</option>
          `).join('')}
        </select>
      </div>
      <div class="field-row" id="campos-bca-dca">
        <div class="field">
          <label for="f-numtrat">Cantidad de tratamientos</label>
          <input id="f-numtrat" type="number" min="1" value="${ensayo?.numTratamientos || ''}" ${bloqueadoDiseno ? 'disabled' : ''}>
        </div>
        <div class="field">
          <label for="f-numbloques">Cantidad de repeticiones (bloques)</label>
          <input id="f-numbloques" type="number" min="1" value="${ensayo?.numBloques || ''}" ${bloqueadoDiseno ? 'disabled' : ''}>
        </div>
      </div>
      <div class="field-row" id="campos-franja" hidden>
        <div class="field">
          <label for="f-numfactora">Niveles del Factor A (franjas horizontales)</label>
          <input id="f-numfactora" type="number" min="1" value="${ensayo?.numFactorA || ''}" ${bloqueadoDiseno ? 'disabled' : ''}>
        </div>
        <div class="field">
          <label for="f-numfactorb">Niveles del Factor B (franjas verticales)</label>
          <input id="f-numfactorb" type="number" min="1" value="${ensayo?.numFactorB || ''}" ${bloqueadoDiseno ? 'disabled' : ''}>
        </div>
        <div class="field">
          <label for="f-numbloques-franja">Cantidad de bloques (repeticiones)</label>
          <input id="f-numbloques-franja" type="number" min="1" value="${ensayo?.numBloques || ''}" ${bloqueadoDiseno ? 'disabled' : ''}>
        </div>
      </div>
      <p class="field-hint" id="tipodiseno-hint"></p>
      ${bloqueadoDiseno ? '<p class="field-hint">Ya generaste el diseño de este ensayo, así que no se puede cambiar el tipo de diseño ni la cantidad de tratamientos/bloques sin borrar el diseño primero (desde la pestaña Diseño).</p>' : ''}
      <div class="field-row">
        <div class="field">
          <label for="f-ancho">Ancho de parcela</label>
          <input id="f-ancho" type="number" step="0.01" min="0" value="${ensayo?.dimensionParcela?.ancho ?? ''}">
        </div>
        <div class="field">
          <label for="f-largo">Largo de parcela</label>
          <input id="f-largo" type="number" step="0.01" min="0" value="${ensayo?.dimensionParcela?.largo ?? ''}">
        </div>
        <div class="field" style="max-width:110px">
          <label for="f-unidad">Unidad</label>
          <select id="f-unidad">
            <option value="m" ${ensayo?.dimensionParcela?.unidad === 'm' || !ensayo ? 'selected' : ''}>m</option>
            <option value="cm" ${ensayo?.dimensionParcela?.unidad === 'cm' ? 'selected' : ''}>cm</option>
          </select>
        </div>
      </div>
      <p class="field-hint" id="area-hint"></p>
      <div class="field">
        <label>Orientación de los bloques (opcional)</label>
        <p class="field-hint">¿Qué punto cardinal queda hacia arriba cuando mirás el Mapa de campo? Es solo una referencia para ubicarte en el lote y para el informe — no cambia el diseño ni el orden de los bloques.</p>
        <div class="chip-select" id="chip-orientacion">
          ${Object.entries(ETIQUETAS_PUNTO_CARDINAL).map(([valor, etiqueta]) => `
            <button type="button" class="chip${(ensayo?.orientacionArriba || '') === valor ? ' active' : ''}" data-valor="${valor}">${etiqueta}</button>
          `).join('')}
          <button type="button" class="chip${!ensayo?.orientacionArriba ? ' active' : ''}" data-valor="">Sin definir</button>
        </div>
      </div>
      <div class="field">
        <label for="f-notas">Notas</label>
        <textarea id="f-notas">${ensayo?.notas || ''}</textarea>
      </div>
      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Guardar</button>
        ${esEdicion ? '<button type="button" class="btn btn-danger" id="btn-eliminar">Eliminar ensayo</button>' : ''}
      </div>
    </form>
  `;

  const anchoInput = main.querySelector('#f-ancho');
  const largoInput = main.querySelector('#f-largo');
  const numTratInput = main.querySelector('#f-numtrat');
  const numBloquesInput = main.querySelector('#f-numbloques');
  const numFactorAInput = main.querySelector('#f-numfactora');
  const numFactorBInput = main.querySelector('#f-numfactorb');
  const numBloquesFranjaInput = main.querySelector('#f-numbloques-franja');
  const areaHint = main.querySelector('#area-hint');
  const tipoDisenoSelect = main.querySelector('#f-tipodiseno');
  const camposBcaDca = main.querySelector('#campos-bca-dca');
  const camposFranja = main.querySelector('#campos-franja');
  const tipoDisenoHint = main.querySelector('#tipodiseno-hint');

  habilitarDictado(main.querySelector('#f-nombre'));
  habilitarDictado(main.querySelector('#f-cultivo'));
  habilitarDictado(main.querySelector('#f-ubicacion'));
  habilitarDictado(main.querySelector('#f-notas'));

  let orientacionArriba = ensayo?.orientacionArriba || '';
  const chipOrientacion = main.querySelector('#chip-orientacion');
  chipOrientacion.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      orientacionArriba = chip.dataset.valor;
      chipOrientacion.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
    });
  });

  const HINTS_DISENO = {
    BCA: 'Cada bloque contiene una vez cada tratamiento; el orden se sortea evitando repeticiones adyacentes entre bloques.',
    DCA: 'Sin bloques: cada tratamiento se repite la cantidad de veces indicada y se distribuye completamente al azar en el campo.',
    FRANJA: 'Dos factores en franjas que se cruzan: cada parcela es la combinación de una franja del Factor A y una del Factor B.'
  };

  function esFranja() { return tipoDisenoSelect.value === 'FRANJA'; }

  function actualizarVisibilidadCampos() {
    camposBcaDca.hidden = esFranja();
    camposFranja.hidden = !esFranja();
    numTratInput.required = !esFranja();
    numBloquesInput.required = !esFranja();
    numFactorAInput.required = esFranja();
    numFactorBInput.required = esFranja();
    numBloquesFranjaInput.required = esFranja();
    tipoDisenoHint.textContent = HINTS_DISENO[tipoDisenoSelect.value] || '';
    actualizarAreaHint();
  }

  function actualizarAreaHint() {
    const ancho = Number(anchoInput.value) || 0;
    const largo = Number(largoInput.value) || 0;
    const numTrat = esFranja()
      ? (Number(numFactorAInput.value) || 0) * (Number(numFactorBInput.value) || 0)
      : (Number(numTratInput.value) || 0);
    const numBloques = esFranja() ? (Number(numBloquesFranjaInput.value) || 0) : (Number(numBloquesInput.value) || 0);
    if (ancho > 0 && largo > 0) {
      const areaParc = ancho * largo;
      const total = areaParc * numTrat * numBloques;
      areaHint.textContent = `Área por parcela: ${areaParc.toFixed(2)} — Área total del ensayo: ${total.toFixed(2)} (${numTrat * numBloques} parcelas)`;
    } else {
      areaHint.textContent = '';
    }
  }
  [anchoInput, largoInput, numTratInput, numBloquesInput, numFactorAInput, numFactorBInput, numBloquesFranjaInput]
    .forEach(i => i.addEventListener('input', actualizarAreaHint));
  tipoDisenoSelect.addEventListener('change', actualizarVisibilidadCampos);
  actualizarVisibilidadCampos();

  main.querySelector('#form-ensayo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipoDiseno = tipoDisenoSelect.value;
    const datos = {
      nombre: main.querySelector('#f-nombre').value.trim(),
      cultivo: main.querySelector('#f-cultivo').value.trim(),
      ubicacion: main.querySelector('#f-ubicacion').value.trim(),
      fechaSiembra: main.querySelector('#f-fecha').value || null,
      notas: main.querySelector('#f-notas').value.trim(),
      tipoDiseno,
      numTratamientos: esFranja() ? (Number(numFactorAInput.value) || 0) * (Number(numFactorBInput.value) || 0) : numTratInput.value,
      numBloques: esFranja() ? numBloquesFranjaInput.value : numBloquesInput.value,
      numFactorA: esFranja() ? numFactorAInput.value : 0,
      numFactorB: esFranja() ? numFactorBInput.value : 0,
      orientacionArriba: orientacionArriba || null,
      dimensionParcela: {
        ancho: anchoInput.value || null,
        largo: largoInput.value || null,
        unidad: main.querySelector('#f-unidad').value
      }
    };
    if (esFranja() && ((Number(numFactorAInput.value) || 0) < 1 || (Number(numFactorBInput.value) || 0) < 1 || (Number(numBloquesFranjaInput.value) || 0) < 1)) {
      showToast('Completá los niveles de ambos factores y la cantidad de bloques', 'error');
      return;
    }
    if (!esFranja() && ((Number(numTratInput.value) || 0) < 1 || (Number(numBloquesInput.value) || 0) < 1)) {
      showToast('Completá la cantidad de tratamientos y bloques', 'error');
      return;
    }

    if (esEdicion) {
      await actualizarEnsayo(ensayoId, datos);
      showToast('Ensayo actualizado');
      navegar(`#/ensayo/${ensayoId}/tratamientos`);
    } else {
      const nuevo = await crearEnsayo(datos);
      showToast('Ensayo creado');
      navegar(`#/ensayo/${nuevo.id}/tratamientos`);
    }
  });

  const btnEliminar = main.querySelector('#btn-eliminar');
  if (btnEliminar) {
    btnEliminar.addEventListener('click', async () => {
      const ok = await confirmDialog({
        titulo: 'Eliminar ensayo',
        mensaje: `¿Seguro que querés eliminar "${ensayo.nombre}"? Se borrarán también sus tratamientos, diseño, fotos, notas y resultados. No se puede deshacer.`,
        textoConfirmar: 'Eliminar todo',
        peligroso: true
      });
      if (ok) {
        await eliminarEnsayo(ensayoId);
        showToast('Ensayo eliminado');
        navegar('#/');
      }
    });
  }
}
