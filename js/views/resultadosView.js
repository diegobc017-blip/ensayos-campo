import { obtenerDiseno, tieneDiseno, etiquetaBloque } from '../db/layoutRepo.js';
import { listarTratamientos } from '../db/tratamientosRepo.js';
import {
  listarVariables, agregarVariable, eliminarVariable,
  listarResultados, agregarResultado, eliminarResultado
} from '../db/resultadosRepo.js';
import { openModal, showToast, confirmDialog } from '../components/ui.js';

export async function render(main, ensayo) {
  const [tratamientos, { bloques, celdasPorBloque }, variables] = await Promise.all([
    listarTratamientos(ensayo.id),
    obtenerDiseno(ensayo.id),
    listarVariables(ensayo.id)
  ]);

  if (!tieneDiseno(bloques)) {
    main.innerHTML = `
      <div class="empty-state">
        <h3>Todavía no hay un diseño cargado</h3>
        <p>Cargá el diseño del ensayo en la pestaña "Diseño" antes de registrar resultados.</p>
      </div>
    `;
    return;
  }

  const tratamientosPorId = new Map(tratamientos.map(t => [t.id, t]));
  const celdas = [];
  bloques.forEach((b) => {
    (celdasPorBloque.get(b.id) || []).forEach((c) => {
      const t = tratamientosPorId.get(c.tratamientoId);
      celdas.push({
        id: c.id,
        bloqueId: b.id,
        tratamientoId: c.tratamientoId,
        etiqueta: `${etiquetaBloque(b)} · pos. ${c.posicion + 1} · ${t ? t.codigo : '?'}`
      });
    });
  });
  const celdasPorId = new Map(celdas.map(c => [c.id, c]));

  main.innerHTML = `
    <div class="card">
      <h3>Variables medidas</h3>
      <div id="lista-variables"></div>
      <div class="btn-row">
        <button class="btn" id="btn-agregar-variable">+ Agregar variable</button>
      </div>
    </div>

    <div class="card" id="card-cargar">
      <h3>Cargar medición</h3>
      <div class="field">
        <label for="sel-variable">Variable</label>
        <select id="sel-variable"></select>
      </div>
      <div class="field">
        <label for="sel-parcela">Parcela</label>
        <select id="sel-parcela">
          ${celdas.map(c => `<option value="${c.id}">${c.etiqueta}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="input-valor">Valor</label>
        <input type="number" step="any" id="input-valor" placeholder="Valor medido">
      </div>
      <div class="field">
        <label for="input-cuadrilla">Cuadrilla</label>
        <input type="text" id="input-cuadrilla" placeholder="Nombre de la cuadrilla (opcional)">
      </div>
      <div class="field">
        <label for="input-observacion">Observación</label>
        <input type="text" id="input-observacion" placeholder="Opcional">
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-guardar-resultado">Guardar medición</button>
      </div>
    </div>

    <div class="card">
      <h3>Mediciones cargadas</h3>
      <div id="lista-resultados"></div>
    </div>
  `;

  const selVariable = main.querySelector('#sel-variable');
  const cardCargar = main.querySelector('#card-cargar');

  function actualizarVisibilidadCarga() {
    cardCargar.hidden = variables.length === 0 || celdas.length === 0;
  }

  function actualizarSelectVariable() {
    selVariable.innerHTML = variables
      .map(v => `<option value="${v.id}">${v.nombre}${v.unidad ? ' (' + v.unidad + ')' : ''}</option>`)
      .join('');
  }

  function refrescarVariables() {
    const cont = main.querySelector('#lista-variables');
    if (variables.length === 0) {
      cont.innerHTML = '<p class="field-hint">Todavía no cargaste ninguna variable (ej: altura de planta, rendimiento).</p>';
      return;
    }
    cont.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'list-plain';
    variables.forEach((v) => {
      const li = document.createElement('li');
      li.className = 'list-item';
      li.innerHTML = `
        <div class="list-item-main">
          <div class="list-item-title">${v.nombre}${v.unidad ? ' (' + v.unidad + ')' : ''}</div>
        </div>
        <button class="btn btn-sm btn-danger" data-id="${v.id}">Eliminar</button>
      `;
      li.querySelector('button').addEventListener('click', async () => {
        const ok = await confirmDialog({
          titulo: 'Eliminar variable',
          mensaje: `¿Eliminar la variable "${v.nombre}"? Las mediciones ya cargadas para esta variable no se borran.`,
          textoConfirmar: 'Eliminar',
          peligroso: true
        });
        if (!ok) return;
        await eliminarVariable(v.id);
        const idx = variables.findIndex(x => x.id === v.id);
        if (idx >= 0) variables.splice(idx, 1);
        refrescarVariables();
        actualizarSelectVariable();
        actualizarVisibilidadCarga();
      });
      ul.appendChild(li);
    });
    cont.appendChild(ul);
  }

  async function refrescarResultados() {
    const resultados = await listarResultados(ensayo.id);
    const cont = main.querySelector('#lista-resultados');
    if (resultados.length === 0) {
      cont.innerHTML = '<p class="field-hint">Todavía no hay mediciones cargadas.</p>';
      return;
    }
    const variablesPorId = new Map(variables.map(v => [v.id, v]));
    cont.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'list-plain';
    resultados.forEach((r) => {
      const v = variablesPorId.get(r.variableId);
      const c = celdasPorId.get(r.celdaId);
      const li = document.createElement('li');
      li.className = 'list-item';
      li.innerHTML = `
        <div class="list-item-main">
          <div class="list-item-title">${v ? v.nombre : '(variable eliminada)'}: ${r.valor}${v && v.unidad ? ' ' + v.unidad : ''}</div>
          <div class="list-item-sub">${c ? c.etiqueta : '(parcela desconocida)'} · ${r.cuadrilla || 'sin cuadrilla'} · ${r.fecha ? new Date(r.fecha).toLocaleString() : ''}${r.observacion ? ' · ' + r.observacion : ''}</div>
        </div>
        <button class="btn btn-sm btn-danger" data-id="${r.id}">Eliminar</button>
      `;
      li.querySelector('button').addEventListener('click', async () => {
        const ok = await confirmDialog({
          titulo: 'Eliminar medición',
          mensaje: '¿Eliminar esta medición?',
          textoConfirmar: 'Eliminar',
          peligroso: true
        });
        if (ok) {
          await eliminarResultado(r.id);
          refrescarResultados();
        }
      });
      ul.appendChild(li);
    });
    cont.appendChild(ul);
  }

  main.querySelector('#btn-agregar-variable').addEventListener('click', () => {
    openModal((box, close) => {
      box.innerHTML = `
        <h3>Agregar variable</h3>
        <div class="field">
          <label for="var-nombre">Nombre</label>
          <input type="text" id="var-nombre" placeholder="Ej: Altura de planta">
        </div>
        <div class="field">
          <label for="var-unidad">Unidad</label>
          <input type="text" id="var-unidad" placeholder="Ej: cm (opcional)">
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-guardar-variable">Guardar</button>
        </div>
      `;
      box.querySelector('#btn-guardar-variable').addEventListener('click', async () => {
        const nombre = box.querySelector('#var-nombre').value.trim();
        if (!nombre) { showToast('Ponele un nombre a la variable', 'error'); return; }
        const unidad = box.querySelector('#var-unidad').value.trim();
        const variable = await agregarVariable(ensayo.id, { nombre, unidad });
        variables.push(variable);
        refrescarVariables();
        actualizarSelectVariable();
        actualizarVisibilidadCarga();
        close();
        showToast('Variable agregada');
      });
    });
  });

  main.querySelector('#btn-guardar-resultado').addEventListener('click', async () => {
    const variableId = selVariable.value;
    const selParcela = main.querySelector('#sel-parcela');
    const celdaId = selParcela.value;
    const inputValor = main.querySelector('#input-valor');
    const valorStr = inputValor.value;

    if (!variableId) { showToast('Agregá una variable primero', 'error'); return; }
    if (!celdaId) { showToast('No hay parcelas disponibles: cargá el diseño primero', 'error'); return; }
    if (valorStr === '') { showToast('Ingresá un valor', 'error'); return; }

    const celda = celdasPorId.get(celdaId);
    await agregarResultado({
      ensayoId: ensayo.id,
      bloqueId: celda ? celda.bloqueId : null,
      celdaId,
      tratamientoId: celda ? celda.tratamientoId : null,
      variableId,
      valor: valorStr,
      cuadrilla: main.querySelector('#input-cuadrilla').value.trim(),
      observacion: main.querySelector('#input-observacion').value.trim() || null
    });

    inputValor.value = '';
    main.querySelector('#input-observacion').value = '';
    showToast('Medición guardada');
    refrescarResultados();
  });

  actualizarSelectVariable();
  actualizarVisibilidadCarga();
  refrescarVariables();
  refrescarResultados();
}
