import { listarTratamientosBase, regenerarCombinaciones } from '../db/tratamientosRepo.js';
import { obtenerDiseno, tieneDiseno, guardarDiseno, reconstruirFilasDeIds, hayDatosAsociados } from '../db/layoutRepo.js';
import { generarDiseno, generarDisenoDCA, generarDisenoFranja } from '../domain/randomizer.js';
import { renderReorderableList } from '../components/dragSortable.js';
import { renderGrillaEditable, contarSinAsignar } from '../components/gridEditor.js';
import { reconocerTexto } from '../utils/ocr.js';
import { emparejarCodigo } from '../utils/textMatch.js';
import { showToast, confirmDialog, openModal } from '../components/ui.js';
import { navegar } from '../router.js';

export async function render(main, ensayo) {
  if (ensayo.tipoDiseno === 'DCA') return renderDCA(main, ensayo);
  if (ensayo.tipoDiseno === 'FRANJA') return renderFranja(main, ensayo);
  return renderBCA(main, ensayo);
}

async function confirmarYGuardar(ensayo, filas, metaFilas, disenoExistente) {
  if (disenoExistente) {
    const tieneDatos = await hayDatosAsociados(ensayo.id);
    const ok = await confirmDialog({
      titulo: 'Reemplazar diseño existente',
      mensaje: tieneDatos
        ? 'Ya hay fotos, notas o resultados cargados sobre el diseño actual. Al confirmar, esas parcelas se recrean y podrían quedar desvinculadas de esos datos. ¿Continuar?'
        : 'Esto reemplaza el diseño actual del ensayo. ¿Continuar?',
      textoConfirmar: 'Reemplazar',
      peligroso: tieneDatos
    });
    if (!ok) return false;
  }
  await guardarDiseno(ensayo.id, filas, metaFilas);
  showToast('Diseño guardado');
  navegar(`#/ensayo/${ensayo.id}/mapa`);
  return true;
}

// ---------------------------------------------------------------------
// Cargar un diseño ya sorteado/anotado en papel a partir de una foto. El
// reconocimiento de texto corre en el propio dispositivo (sin internet):
// se espera una línea de texto por fila (bloque), con los códigos de
// tratamiento en orden separados por espacios. El resultado se muestra en
// una grilla totalmente editable (un <select> por celda) para corregir
// cualquier error de lectura antes de confirmar y guardar.
// ---------------------------------------------------------------------
function abrirImportarDisenoPorFoto({ ensayo, disenoExistente, numFilas, numColumnas, opciones, etiquetaFila, construirFilasFinal }) {
  openModal((box, close) => {
    box.innerHTML = `
      <h3>Cargar diseño desde una foto</h3>
      <p class="field-hint">Sacá una foto de la grilla ya armada en papel: una línea de texto por fila, con los códigos de tratamiento en orden, separados por espacios. Se necesitan <strong>${numFilas}</strong> filas de <strong>${numColumnas}</strong> códigos cada una. El reconocimiento corre en el celular sin internet y puede equivocarse — vas a poder corregir cada celda antes de guardar.</p>
      <input type="file" id="foto-ocr-diseno" accept="image/*" capture="environment" hidden>
      <div class="btn-row"><button class="btn btn-primary" id="btn-elegir-foto-diseno" type="button">📷 Elegir / sacar foto</button></div>
      <div id="estado-ocr-diseno"></div>
      <div id="grilla-ocr-diseno"></div>
      <div class="btn-row" id="acciones-ocr-diseno" hidden>
        <button class="btn btn-primary" id="btn-guardar-ocr-diseno" type="button">Confirmar y guardar diseño</button>
      </div>
    `;

    const input = box.querySelector('#foto-ocr-diseno');
    const estado = box.querySelector('#estado-ocr-diseno');
    const grillaCont = box.querySelector('#grilla-ocr-diseno');
    const acciones = box.querySelector('#acciones-ocr-diseno');
    let filasIds = null;

    box.querySelector('#btn-elegir-foto-diseno').addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      estado.innerHTML = '<p class="field-hint">Leyendo la foto... 0%</p>';
      grillaCont.innerHTML = '';
      acciones.hidden = true;
      try {
        const { lineas } = await reconocerTexto(file, {
          onProgreso: (m) => {
            if (m.status === 'recognizing text') {
              estado.innerHTML = `<p class="field-hint">Leyendo la foto... ${Math.round(m.progress * 100)}%</p>`;
            }
          }
        });
        filasIds = [];
        for (let i = 0; i < numFilas; i++) {
          const tokens = (lineas[i] || '').split(/\s+/).filter(Boolean);
          const fila = [];
          for (let c = 0; c < numColumnas; c++) {
            const match = tokens[c] ? emparejarCodigo(tokens[c], opciones) : null;
            fila.push(match ? match.id : null);
          }
          filasIds.push(fila);
        }
        const sinAsignar = contarSinAsignar(filasIds);
        estado.innerHTML = sinAsignar > 0
          ? `<p class="warning-box">Se leyeron ${lineas.length} línea(s) de texto. Quedaron ${sinAsignar} celda(s) que no se pudieron identificar (marcadas en rojo) — completalas a mano en la grilla de abajo.</p>`
          : `<p class="field-hint">Se leyeron ${lineas.length} línea(s). Revisá que cada celda esté correcta antes de guardar.</p>`;
        pintarGrilla();
        acciones.hidden = false;
      } catch (e) {
        console.error(e);
        estado.innerHTML = '<p class="warning-box">No se pudo leer la foto. Probá con mejor luz, más cerca del papel o menos inclinada.</p>';
      }
    });

    function pintarGrilla() {
      renderGrillaEditable(grillaCont, filasIds, opciones, etiquetaFila, (i, c, nuevoId) => {
        filasIds[i][c] = nuevoId;
      });
    }

    box.querySelector('#btn-guardar-ocr-diseno').addEventListener('click', async () => {
      if (!filasIds) return;
      const sinAsignar = contarSinAsignar(filasIds);
      if (sinAsignar > 0) {
        showToast(`Todavía hay ${sinAsignar} celda(s) sin asignar`, 'error');
        return;
      }
      const { filas, metaFilas } = construirFilasFinal(filasIds);
      const ok = await confirmarYGuardar(ensayo, filas, metaFilas, disenoExistente);
      if (ok) close();
    });
  });
}

// ---------------------------------------------------------------------
// BCA — Bloques Completos al Azar (comportamiento original).
// ---------------------------------------------------------------------
async function renderBCA(main, ensayo) {
  const tratamientos = await listarTratamientosBase(ensayo.id);

  if (tratamientos.length === 0) {
    main.innerHTML = `
      <div class="empty-state">
        <h3>Primero cargá los tratamientos</h3>
        <p>Andá a la pestaña "Tratamientos" para cargarlos antes de generar el diseño.</p>
      </div>
    `;
    return;
  }

  const { bloques } = await obtenerDiseno(ensayo.id);
  const disenoExistente = tieneDiseno(bloques);

  let filaFija = tratamientos.slice();
  if (disenoExistente) {
    const filas = await reconstruirFilasDeIds(ensayo.id);
    const porId = new Map(tratamientos.map(t => [t.id, t]));
    const filaGuardada = filas[0].map(id => porId.get(id)).filter(Boolean);
    if (filaGuardada.length === tratamientos.length) filaFija = filaGuardada;
  }

  let previewFilas = null;

  main.innerHTML = `
    <div class="card">
      <h3>1. Orden del primer bloque (fijo)</h3>
      <p class="field-hint">Definí manualmente el orden de los tratamientos para el primer bloque. A partir de este orden se generarán al azar los demás bloques.</p>
      <div id="fila-fija"></div>
    </div>
    <div class="card">
      <h3>2. Generar bloques al azar</h3>
      <p class="field-hint">Se generarán ${ensayo.numBloques} bloques en total, evitando que un mismo tratamiento quede en la misma columna en bloques consecutivos.</p>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-generar">Generar aleatorio</button>
        <button class="btn" id="btn-importar-foto-diseno" type="button">📷 Cargar diseño desde una foto</button>
      </div>
      <div id="preview-container"></div>
      <div class="btn-row" id="confirmar-row" hidden>
        <button class="btn btn-primary" id="btn-confirmar">Confirmar y guardar diseño</button>
      </div>
    </div>
  `;

  main.querySelector('#btn-importar-foto-diseno').addEventListener('click', () => {
    abrirImportarDisenoPorFoto({
      ensayo,
      disenoExistente,
      numFilas: ensayo.numBloques,
      numColumnas: tratamientos.length,
      opciones: tratamientos,
      etiquetaFila: (i) => `Bloque ${i + 1}`,
      construirFilasFinal: (filasIds) => ({ filas: filasIds, metaFilas: null })
    });
  });

  function pintarFilaFija() {
    renderReorderableList(
      main.querySelector('#fila-fija'),
      filaFija,
      t => `${t.codigo} — ${t.nombre || ''}`,
      t => t.color,
      (nuevoOrden) => { filaFija = nuevoOrden; pintarFilaFija(); }
    );
  }
  pintarFilaFija();

  function pintarPreview() {
    const cont = main.querySelector('#preview-container');
    const confirmarRow = main.querySelector('#confirmar-row');
    if (!previewFilas) {
      cont.innerHTML = '';
      confirmarRow.hidden = true;
      return;
    }
    const porId = new Map(tratamientos.map(t => [t.id, t]));
    const conflictosPorFilaCol = new Set(
      previewFilas.conflictos.map(c => `${c.filaIndice}-${c.columna}`)
    );

    cont.innerHTML = '';
    previewFilas.filas.forEach((fila, i) => {
      const filaDiv = document.createElement('div');
      filaDiv.className = 'diseno-preview-fila';
      const etiqueta = document.createElement('strong');
      etiqueta.textContent = `B${i + 1}: `;
      filaDiv.appendChild(etiqueta);
      fila.forEach((tId, c) => {
        const t = porId.get(tId);
        const span = document.createElement('span');
        span.className = 'diseno-preview-celda' + (conflictosPorFilaCol.has(`${i}-${c}`) ? ' conflicto' : '');
        span.textContent = t ? t.codigo : '?';
        filaDiv.appendChild(span);
      });
      cont.appendChild(filaDiv);
    });

    if (previewFilas.conflictos.length > 0) {
      const aviso = document.createElement('p');
      aviso.className = 'warning-box';
      aviso.textContent = `Ojo: con esta cantidad de tratamientos/bloques no se pudo evitar la adyacencia en ${previewFilas.conflictos.length} celda(s) (resaltadas). Podés regenerar o ajustarlas manualmente después en el Mapa de campo.`;
      cont.appendChild(aviso);
    }

    confirmarRow.hidden = false;
  }

  main.querySelector('#btn-generar').addEventListener('click', () => {
    if (filaFija.length !== tratamientos.length) {
      showToast('Falta ordenar todos los tratamientos', 'error');
      return;
    }
    previewFilas = generarDiseno(filaFija.map(t => t.id), ensayo.numBloques);
    pintarPreview();
  });

  main.querySelector('#btn-confirmar').addEventListener('click', async () => {
    await confirmarYGuardar(ensayo, previewFilas.filas, null, disenoExistente);
  });
}

// ---------------------------------------------------------------------
// DCA — Completamente al Azar: sin bloques reales, todo se sortea junto.
// ---------------------------------------------------------------------
async function renderDCA(main, ensayo) {
  const tratamientos = await listarTratamientosBase(ensayo.id);

  if (tratamientos.length === 0) {
    main.innerHTML = `
      <div class="empty-state">
        <h3>Primero cargá los tratamientos</h3>
        <p>Andá a la pestaña "Tratamientos" para cargarlos antes de generar el diseño.</p>
      </div>
    `;
    return;
  }

  const { bloques } = await obtenerDiseno(ensayo.id);
  const disenoExistente = tieneDiseno(bloques);
  let previewFilas = null;

  main.innerHTML = `
    <div class="card">
      <h3>Diseño Completamente al Azar (DCA)</h3>
      <p class="field-hint">No hay bloques: cada uno de los <strong>${tratamientos.length}</strong> tratamientos se repite <strong>${ensayo.numBloques}</strong> veces y todas esas parcelas se ubican al azar en el campo (la grilla de filas/columnas es solo para tener dónde ubicarlas físicamente).</p>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-generar">Generar aleatorio</button>
        <button class="btn" id="btn-importar-foto-diseno" type="button">📷 Cargar diseño desde una foto</button>
      </div>
      <div id="preview-container"></div>
      <div class="btn-row" id="confirmar-row" hidden>
        <button class="btn btn-primary" id="btn-confirmar">Confirmar y guardar diseño</button>
      </div>
    </div>
  `;

  main.querySelector('#btn-importar-foto-diseno').addEventListener('click', () => {
    abrirImportarDisenoPorFoto({
      ensayo,
      disenoExistente,
      numFilas: ensayo.numBloques,
      numColumnas: tratamientos.length,
      opciones: tratamientos,
      etiquetaFila: (i) => `Fila ${i + 1}`,
      construirFilasFinal: (filasIds) => ({
        filas: filasIds,
        metaFilas: filasIds.map((_, i) => ({ etiqueta: `Fila ${i + 1}` }))
      })
    });
  });

  function pintarPreview() {
    const cont = main.querySelector('#preview-container');
    const confirmarRow = main.querySelector('#confirmar-row');
    if (!previewFilas) {
      cont.innerHTML = '';
      confirmarRow.hidden = true;
      return;
    }
    const porId = new Map(tratamientos.map(t => [t.id, t]));
    cont.innerHTML = '';
    previewFilas.filas.forEach((fila, i) => {
      const filaDiv = document.createElement('div');
      filaDiv.className = 'diseno-preview-fila';
      const etiqueta = document.createElement('strong');
      etiqueta.textContent = `Fila ${i + 1}: `;
      filaDiv.appendChild(etiqueta);
      fila.forEach(tId => {
        const t = porId.get(tId);
        const span = document.createElement('span');
        span.className = 'diseno-preview-celda';
        span.textContent = t ? t.codigo : '?';
        filaDiv.appendChild(span);
      });
      cont.appendChild(filaDiv);
    });
    confirmarRow.hidden = false;
  }

  main.querySelector('#btn-generar').addEventListener('click', () => {
    previewFilas = generarDisenoDCA(tratamientos.map(t => t.id), ensayo.numBloques);
    pintarPreview();
  });

  main.querySelector('#btn-confirmar').addEventListener('click', async () => {
    const metaFilas = previewFilas.filas.map((_, i) => ({ etiqueta: `Fila ${i + 1}` }));
    await confirmarYGuardar(ensayo, previewFilas.filas, metaFilas, disenoExistente);
  });
}

// ---------------------------------------------------------------------
// Franjas cruzadas: Factor A (franjas horizontales) × Factor B (franjas
// verticales). Cada bloque sortea el orden de ambos factores por separado.
// ---------------------------------------------------------------------
async function renderFranja(main, ensayo) {
  const factorA = await listarTratamientosBase(ensayo.id, 'A');
  const factorB = await listarTratamientosBase(ensayo.id, 'B');

  if (factorA.length === 0 || factorB.length === 0) {
    main.innerHTML = `
      <div class="empty-state">
        <h3>Primero cargá los dos factores</h3>
        <p>Andá a la pestaña "Tratamientos" para cargar los niveles del Factor A y del Factor B antes de generar el diseño.</p>
      </div>
    `;
    return;
  }
  const avisoDescoincide = (factorA.length !== ensayo.numFactorA || factorB.length !== ensayo.numFactorB)
    ? `<div class="warning-box">La cantidad de niveles cargados (Factor A: ${factorA.length}, Factor B: ${factorB.length}) no coincide con la definida en el ensayo (Factor A: ${ensayo.numFactorA}, Factor B: ${ensayo.numFactorB}). Ajustala en "Tratamientos" o editando el ensayo.</div>`
    : '';

  await regenerarCombinaciones(ensayo.id);
  const combos = await listarTratamientosBase(ensayo.id, 'combo');
  const comboPorClave = new Map(combos.map(c => [`${c.factorAId}|${c.factorBId}`, c]));
  const comboPorId = new Map(combos.map(c => [c.id, c]));

  const { bloques } = await obtenerDiseno(ensayo.id);
  const disenoExistente = tieneDiseno(bloques);
  let previewFilas = null;

  const seccion = document.createElement('div');
  main.innerHTML = '';
  seccion.innerHTML = `
    ${avisoDescoincide}
    <div class="card">
      <h3>Diseño de franjas cruzadas</h3>
      <p class="field-hint">Se generarán <strong>${ensayo.numBloques}</strong> bloques; en cada uno se sortea el orden de las franjas A y de las franjas B por separado. Cada celda es la combinación de una franja A y una franja B.</p>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-generar">Generar aleatorio</button>
        <button class="btn" id="btn-importar-foto-diseno" type="button">📷 Cargar diseño desde una foto</button>
      </div>
      <div id="preview-container"></div>
      <div class="btn-row" id="confirmar-row" hidden>
        <button class="btn btn-primary" id="btn-confirmar">Confirmar y guardar diseño</button>
      </div>
    </div>
  `;
  main.appendChild(seccion);

  seccion.querySelector('#btn-importar-foto-diseno').addEventListener('click', () => {
    abrirImportarDisenoPorFoto({
      ensayo,
      disenoExistente,
      numFilas: ensayo.numBloques * factorA.length,
      numColumnas: factorB.length,
      opciones: combos,
      etiquetaFila: (i) => {
        const replica = Math.floor(i / factorA.length) + 1;
        const filaEnBloque = i % factorA.length;
        return `Bloque ${replica} · Franja ${factorA[filaEnBloque]?.codigo || filaEnBloque + 1}`;
      },
      construirFilasFinal: (filasIds) => ({
        filas: filasIds,
        metaFilas: filasIds.map((_, i) => {
          const replica = Math.floor(i / factorA.length) + 1;
          const filaEnBloque = i % factorA.length;
          return { replica, franjaA: factorA[filaEnBloque]?.codigo || `A${filaEnBloque + 1}` };
        })
      })
    });
  });

  function pintarPreview() {
    const cont = seccion.querySelector('#preview-container');
    const confirmarRow = seccion.querySelector('#confirmar-row');
    if (!previewFilas) {
      cont.innerHTML = '';
      confirmarRow.hidden = true;
      return;
    }
    cont.innerHTML = '';
    let filaGlobal = 0;
    for (let r = 0; r < ensayo.numBloques; r++) {
      const bloqueDiv = document.createElement('div');
      bloqueDiv.className = 'section-title';
      const titulo = document.createElement('p');
      titulo.innerHTML = `<strong>Bloque ${r + 1}</strong>`;
      bloqueDiv.appendChild(titulo);
      for (let a = 0; a < factorA.length; a++) {
        const fila = previewFilas.filas[filaGlobal];
        const meta = previewFilas.metaFilas[filaGlobal];
        const filaDiv = document.createElement('div');
        filaDiv.className = 'diseno-preview-fila';
        const etiqueta = document.createElement('strong');
        etiqueta.textContent = `Franja ${meta.franjaA}: `;
        filaDiv.appendChild(etiqueta);
        fila.forEach(comboId => {
          const c = comboPorId.get(comboId);
          const span = document.createElement('span');
          span.className = 'diseno-preview-celda';
          span.textContent = c ? c.codigo : '?';
          filaDiv.appendChild(span);
        });
        bloqueDiv.appendChild(filaDiv);
        filaGlobal++;
      }
      cont.appendChild(bloqueDiv);
    }
    confirmarRow.hidden = false;
  }

  seccion.querySelector('#btn-generar').addEventListener('click', () => {
    previewFilas = generarDisenoFranja(
      factorA, factorB,
      (idA, idB) => comboPorClave.get(`${idA}|${idB}`)?.id,
      ensayo.numBloques
    );
    pintarPreview();
  });

  seccion.querySelector('#btn-confirmar').addEventListener('click', async () => {
    await confirmarYGuardar(ensayo, previewFilas.filas, previewFilas.metaFilas, disenoExistente);
  });
}
