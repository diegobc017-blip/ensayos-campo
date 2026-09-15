import {
  listarTratamientosBase, agregarTratamiento, actualizarTratamiento,
  eliminarTratamiento, reordenarTratamientos, regenerarCombinaciones
} from '../db/tratamientosRepo.js';
import { renderReorderableList } from '../components/dragSortable.js';
import { showToast, confirmDialog, openModal } from '../components/ui.js';
import { habilitarDictado } from '../components/voiceInput.js';
import { reconocerTexto } from '../utils/ocr.js';
import { parsearLineaTratamiento } from '../utils/textMatch.js';
import { nuevoId } from '../utils/idGen.js';

export async function render(main, ensayo) {
  if (ensayo.tipoDiseno === 'FRANJA') {
    await renderFranja(main, ensayo);
  } else {
    await renderSimple(main, ensayo);
  }
}

// ---------------------------------------------------------------------
// Diseño BCA / DCA: una sola lista de tratamientos.
// ---------------------------------------------------------------------
async function renderSimple(main, ensayo) {
  const tratamientos = await listarTratamientosBase(ensayo.id);

  main.innerHTML = `
    <div class="card">
      <h3>Tratamientos</h3>
      <p class="field-hint">Este ensayo necesita <strong>${ensayo.numTratamientos}</strong> tratamientos. Cargados: <strong>${tratamientos.length}</strong>.</p>
      ${tratamientos.length !== ensayo.numTratamientos ? '<p class="warning-box">La cantidad cargada no coincide con la definida en el ensayo. Ajustala aquí o editá el ensayo.</p>' : ''}
      <div id="lista-tratamientos"></div>
    </div>
    <form id="form-nuevo-tratamiento" class="card">
      <h4>Agregar tratamiento</h4>
      <div class="field-row">
        <div class="field">
          <label for="ft-codigo">Código</label>
          <input id="ft-codigo" placeholder="ej. T1">
        </div>
        <div class="field" style="flex:2">
          <label for="ft-nombre">Nombre / descripción</label>
          <input id="ft-nombre" placeholder="ej. Fungicida X 1L/ha" required>
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">+ Agregar tratamiento</button>
      <div class="btn-row">
        <button type="button" class="btn" id="btn-importar-foto">📷 Cargar por foto</button>
      </div>
    </form>
  `;

  habilitarDictado(main.querySelector('#ft-nombre'));

  main.querySelector('#btn-importar-foto').addEventListener('click', () => {
    abrirImportarPorFoto({
      onImportado: async () => {
        const actualizados = await listarTratamientosBase(ensayo.id);
        tratamientos.length = 0;
        tratamientos.push(...actualizados);
        pintarLista();
      },
      agregar: (datos) => agregarTratamiento(ensayo.id, datos)
    });
  });

  function pintarLista() {
    const cont = main.querySelector('#lista-tratamientos');
    pintarListaTratamientos(cont, tratamientos, {
      onCambio: async () => {
        const actualizados = await listarTratamientosBase(ensayo.id);
        tratamientos.length = 0;
        tratamientos.push(...actualizados);
        pintarLista();
      },
      onReordenar: async (nuevoOrden) => {
        await reordenarTratamientos(ensayo.id, nuevoOrden.map(t => t.id));
        const actualizados = await listarTratamientosBase(ensayo.id);
        tratamientos.length = 0;
        tratamientos.push(...actualizados);
        pintarLista();
      }
    });
  }

  pintarLista();

  main.querySelector('#form-nuevo-tratamiento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = main.querySelector('#ft-codigo').value.trim();
    const nombre = main.querySelector('#ft-nombre').value.trim();
    if (tratamientos.length >= ensayo.numTratamientos) {
      const ok = await confirmDialog({
        titulo: 'Más tratamientos que los definidos',
        mensaje: `El ensayo está definido para ${ensayo.numTratamientos} tratamientos. ¿Agregar igual? Podés ajustar la cantidad definida editando el ensayo.`,
        textoConfirmar: 'Agregar igual'
      });
      if (!ok) return;
    }
    await agregarTratamiento(ensayo.id, { codigo, nombre });
    const actualizados = await listarTratamientosBase(ensayo.id);
    tratamientos.length = 0;
    tratamientos.push(...actualizados);
    pintarLista();
    main.querySelector('#form-nuevo-tratamiento').reset();
    showToast('Tratamiento agregado');
  });
}

// ---------------------------------------------------------------------
// Diseño de franjas cruzadas: dos listas (Factor A / Factor B). Las
// combinaciones A×B (los "tratamientos" reales de cada parcela) se
// regeneran automáticamente cada vez que cambia alguna de las dos listas.
// ---------------------------------------------------------------------
async function renderFranja(main, ensayo) {
  let factorA = await listarTratamientosBase(ensayo.id, 'A');
  let factorB = await listarTratamientosBase(ensayo.id, 'B');

  main.innerHTML = `
    <div class="card">
      <h3>Diseño de franjas cruzadas</h3>
      <p class="field-hint">Cargá por separado los niveles del <strong>Factor A</strong> (franjas horizontales) y del <strong>Factor B</strong> (franjas verticales). Cada parcela del mapa de campo será la combinación de una franja A y una franja B, generada automáticamente.</p>
    </div>
    <div class="card">
      <h4>Factor A — franjas horizontales <span class="field-hint">(necesita ${ensayo.numFactorA})</span></h4>
      <div id="lista-factor-a"></div>
      <form id="form-factor-a" class="field-row" style="align-items:flex-end;margin-top:10px">
        <div class="field" style="margin-bottom:0">
          <label for="fa-codigo">Código</label>
          <input id="fa-codigo" placeholder="ej. A1">
        </div>
        <div class="field" style="flex:2;margin-bottom:0">
          <label for="fa-nombre">Nombre / descripción</label>
          <input id="fa-nombre" placeholder="ej. Dosis 1" required>
        </div>
        <button type="submit" class="btn btn-primary">+ Agregar</button>
      </form>
      <div class="btn-row">
        <button type="button" class="btn" id="btn-importar-foto-a">📷 Cargar Factor A por foto</button>
      </div>
    </div>
    <div class="card">
      <h4>Factor B — franjas verticales <span class="field-hint">(necesita ${ensayo.numFactorB})</span></h4>
      <div id="lista-factor-b"></div>
      <form id="form-factor-b" class="field-row" style="align-items:flex-end;margin-top:10px">
        <div class="field" style="margin-bottom:0">
          <label for="fb-codigo">Código</label>
          <input id="fb-codigo" placeholder="ej. B1">
        </div>
        <div class="field" style="flex:2;margin-bottom:0">
          <label for="fb-nombre">Nombre / descripción</label>
          <input id="fb-nombre" placeholder="ej. Producto Y" required>
        </div>
        <button type="submit" class="btn btn-primary">+ Agregar</button>
      </form>
      <div class="btn-row">
        <button type="button" class="btn" id="btn-importar-foto-b">📷 Cargar Factor B por foto</button>
      </div>
    </div>
    <div class="card">
      <h4>Combinaciones (parcelas)</h4>
      <p class="field-hint">Se generan solas a partir de los dos factores. Cantidad actual: <strong>${factorA.length * factorB.length}</strong> (necesarias por bloque: <strong>${ensayo.numFactorA * ensayo.numFactorB}</strong>).</p>
    </div>
  `;

  habilitarDictado(main.querySelector('#fa-nombre'));
  habilitarDictado(main.querySelector('#fb-nombre'));

  async function sincronizarCombinaciones() {
    await regenerarCombinaciones(ensayo.id);
    const p = main.querySelector('.card:last-child p.field-hint');
    if (p) p.innerHTML = `Se generan solas a partir de los dos factores. Cantidad actual: <strong>${factorA.length * factorB.length}</strong> (necesarias por bloque: <strong>${ensayo.numFactorA * ensayo.numFactorB}</strong>).`;
  }

  function pintarA() {
    pintarListaTratamientos(main.querySelector('#lista-factor-a'), factorA, {
      onCambio: async () => {
        factorA = await listarTratamientosBase(ensayo.id, 'A');
        pintarA();
        await sincronizarCombinaciones();
      },
      onReordenar: async (nuevoOrden) => {
        await reordenarTratamientos(ensayo.id, nuevoOrden.map(t => t.id));
        factorA = await listarTratamientosBase(ensayo.id, 'A');
        pintarA();
        await sincronizarCombinaciones();
      }
    });
  }

  function pintarB() {
    pintarListaTratamientos(main.querySelector('#lista-factor-b'), factorB, {
      onCambio: async () => {
        factorB = await listarTratamientosBase(ensayo.id, 'B');
        pintarB();
        await sincronizarCombinaciones();
      },
      onReordenar: async (nuevoOrden) => {
        await reordenarTratamientos(ensayo.id, nuevoOrden.map(t => t.id));
        factorB = await listarTratamientosBase(ensayo.id, 'B');
        pintarB();
        await sincronizarCombinaciones();
      }
    });
  }

  pintarA();
  pintarB();
  await sincronizarCombinaciones();

  main.querySelector('#btn-importar-foto-a').addEventListener('click', () => {
    abrirImportarPorFoto({
      onImportado: async () => {
        factorA = await listarTratamientosBase(ensayo.id, 'A');
        pintarA();
        await sincronizarCombinaciones();
      },
      agregar: (datos) => agregarTratamiento(ensayo.id, { ...datos, factor: 'A' })
    });
  });

  main.querySelector('#btn-importar-foto-b').addEventListener('click', () => {
    abrirImportarPorFoto({
      onImportado: async () => {
        factorB = await listarTratamientosBase(ensayo.id, 'B');
        pintarB();
        await sincronizarCombinaciones();
      },
      agregar: (datos) => agregarTratamiento(ensayo.id, { ...datos, factor: 'B' })
    });
  });

  main.querySelector('#form-factor-a').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = main.querySelector('#fa-codigo').value.trim();
    const nombre = main.querySelector('#fa-nombre').value.trim();
    await agregarTratamiento(ensayo.id, { codigo, nombre, factor: 'A' });
    factorA = await listarTratamientosBase(ensayo.id, 'A');
    pintarA();
    await sincronizarCombinaciones();
    main.querySelector('#form-factor-a').reset();
    showToast('Nivel de Factor A agregado');
  });

  main.querySelector('#form-factor-b').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = main.querySelector('#fb-codigo').value.trim();
    const nombre = main.querySelector('#fb-nombre').value.trim();
    await agregarTratamiento(ensayo.id, { codigo, nombre, factor: 'B' });
    factorB = await listarTratamientosBase(ensayo.id, 'B');
    pintarB();
    await sincronizarCombinaciones();
    main.querySelector('#form-factor-b').reset();
    showToast('Nivel de Factor B agregado');
  });
}

// ---------------------------------------------------------------------
// Lista genérica de tratamientos (reusada para la lista simple y para
// cada uno de los dos factores del diseño de franjas).
// ---------------------------------------------------------------------
function pintarListaTratamientos(cont, tratamientos, { onCambio, onReordenar }) {
  if (tratamientos.length === 0) {
    cont.innerHTML = '<p class="empty-state">Todavía no cargaste nada acá.</p>';
    return;
  }
  cont.innerHTML = '';
  const lista = document.createElement('ul');
  lista.className = 'list-plain';
  tratamientos.forEach(t => {
    const li = document.createElement('li');
    li.className = 'list-item';
    const numProductos = (t.aplicaciones || []).reduce((n, a) => n + (a.productos || []).length, 0);
    li.innerHTML = `
      <span style="width:14px;height:14px;border-radius:50%;background:${t.color};flex:0 0 auto;display:inline-block"></span>
      <div class="list-item-main">
        <div class="list-item-title">${t.codigo} — ${t.nombre || 'Sin descripción'}</div>
        <div class="list-item-sub">${numProductos > 0 ? `${numProductos} producto(s) cargado(s)` : 'Sin productos cargados'}</div>
      </div>
      <button class="btn btn-sm" data-accion="productos" data-id="${t.id}">Productos</button>
      <button class="btn btn-sm" data-accion="editar" data-id="${t.id}">Editar</button>
      <button class="btn btn-sm btn-danger" data-accion="borrar" data-id="${t.id}">Eliminar</button>
    `;
    lista.appendChild(li);
  });
  cont.appendChild(lista);

  const ordenCont = document.createElement('div');
  ordenCont.className = 'section-title';
  const ordenTitulo = document.createElement('p');
  ordenTitulo.className = 'field-hint';
  ordenTitulo.textContent = 'Orden de referencia (color/posición sugerida):';
  ordenCont.appendChild(ordenTitulo);
  const reorderDiv = document.createElement('div');
  ordenCont.appendChild(reorderDiv);
  cont.appendChild(ordenCont);

  renderReorderableList(
    reorderDiv,
    tratamientos,
    t => `${t.codigo} — ${t.nombre}`,
    t => t.color,
    onReordenar
  );

  cont.querySelectorAll('[data-accion="borrar"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        titulo: 'Eliminar tratamiento',
        mensaje: 'Si ya generaste el diseño con este tratamiento, tendrás que volver a generarlo. ¿Continuar?',
        textoConfirmar: 'Eliminar',
        peligroso: true
      });
      if (!ok) return;
      await eliminarTratamiento(btn.dataset.id);
      showToast('Tratamiento eliminado');
      await onCambio();
    });
  });

  cont.querySelectorAll('[data-accion="editar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = tratamientos.find(x => x.id === btn.dataset.id);
      abrirEdicion(cont, t, onCambio);
    });
  });

  cont.querySelectorAll('[data-accion="productos"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = tratamientos.find(x => x.id === btn.dataset.id);
      abrirEditorProductos(t, onCambio);
    });
  });
}

function abrirEdicion(cont, t, onCambio) {
  const li = [...cont.querySelectorAll('.list-item')].find(el => el.querySelector(`[data-id="${t.id}"]`));
  if (!li) return;
  li.innerHTML = `
    <div class="list-item-main">
      <div class="field-row">
        <input class="edit-codigo" value="${t.codigo}" style="max-width:80px">
        <input class="edit-nombre" value="${t.nombre}">
      </div>
    </div>
    <button class="btn btn-sm btn-primary" data-accion="guardar">Guardar</button>
  `;
  habilitarDictado(li.querySelector('.edit-nombre'));
  li.querySelector('[data-accion="guardar"]').addEventListener('click', async () => {
    const codigo = li.querySelector('.edit-codigo').value.trim();
    const nombre = li.querySelector('.edit-nombre').value.trim();
    await actualizarTratamiento(t.id, { codigo, nombre });
    showToast('Tratamiento actualizado');
    await onCambio();
  });
}

// ---------------------------------------------------------------------
// Cargar tratamientos (o niveles de un factor) a partir de una foto de una
// lista escrita a mano o impresa. El reconocimiento de texto corre en el
// propio dispositivo (sin internet); cada línea detectada se muestra en una
// tabla editable para corregir cualquier error de lectura antes de guardar.
// ---------------------------------------------------------------------
function abrirImportarPorFoto({ onImportado, agregar }) {
  openModal((box, close) => {
    box.innerHTML = `
      <h3>Cargar por foto</h3>
      <p class="field-hint">Sacá una foto de la lista escrita (una línea por tratamiento, idealmente "código - nombre"). El reconocimiento corre en el celular, sin internet, así que puede equivocarse con letra manuscrita — vas a poder revisar y corregir todo antes de guardar.</p>
      <input type="file" id="foto-ocr" accept="image/*" capture="environment" hidden>
      <div class="btn-row"><button class="btn btn-primary" id="btn-elegir-foto" type="button">📷 Elegir / sacar foto</button></div>
      <div id="estado-ocr"></div>
      <div id="revision-ocr"></div>
      <div class="btn-row" id="acciones-ocr" hidden>
        <button class="btn" id="btn-agregar-linea-ocr" type="button">+ Agregar línea</button>
        <button class="btn btn-primary" id="btn-guardar-ocr" type="button">Guardar tratamientos</button>
      </div>
    `;

    const input = box.querySelector('#foto-ocr');
    const estado = box.querySelector('#estado-ocr');
    const revision = box.querySelector('#revision-ocr');
    const acciones = box.querySelector('#acciones-ocr');
    let filas = [];

    box.querySelector('#btn-elegir-foto').addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      estado.innerHTML = '<p class="field-hint">Leyendo la foto... 0%</p>';
      revision.innerHTML = '';
      acciones.hidden = true;
      try {
        const { lineas } = await reconocerTexto(file, {
          onProgreso: (m) => {
            if (m.status === 'recognizing text') {
              estado.innerHTML = `<p class="field-hint">Leyendo la foto... ${Math.round(m.progress * 100)}%</p>`;
            }
          }
        });
        filas = lineas.map(parsearLineaTratamiento).filter(Boolean);
        if (filas.length === 0) filas = [{ codigo: '', nombre: '' }];
        estado.innerHTML = lineas.length
          ? `<p class="field-hint">Se detectaron ${filas.length} línea(s). Revisá y corregí antes de guardar.</p>`
          : '<p class="field-hint">No se detectó texto en la foto. Podés agregar líneas a mano.</p>';
        pintarRevision();
        acciones.hidden = false;
      } catch (e) {
        console.error(e);
        estado.innerHTML = '<p class="warning-box">No se pudo leer la foto. Probá con mejor luz, más cerca del texto o menos inclinada.</p>';
      }
    });

    function pintarRevision() {
      revision.innerHTML = '';
      filas.forEach((f, i) => {
        const fila = document.createElement('div');
        fila.className = 'field-row';
        fila.innerHTML = `
          <div class="field" style="max-width:90px;margin-bottom:8px">
            <input class="in-ocr-codigo" data-i="${i}" value="${f.codigo || ''}" placeholder="Código">
          </div>
          <div class="field" style="flex:2;margin-bottom:8px">
            <input class="in-ocr-nombre" data-i="${i}" value="${f.nombre || ''}" placeholder="Nombre / descripción">
          </div>
          <button class="btn btn-sm btn-danger" data-accion="quitar-ocr" data-i="${i}" type="button" style="align-self:flex-start;margin-top:2px">✕</button>
        `;
        revision.appendChild(fila);
      });
      revision.querySelectorAll('.in-ocr-codigo').forEach(inp => {
        inp.addEventListener('input', () => { filas[Number(inp.dataset.i)].codigo = inp.value; });
      });
      revision.querySelectorAll('.in-ocr-nombre').forEach(inp => {
        inp.addEventListener('input', () => { filas[Number(inp.dataset.i)].nombre = inp.value; });
      });
      revision.querySelectorAll('[data-accion="quitar-ocr"]').forEach(btn => {
        btn.addEventListener('click', () => { filas.splice(Number(btn.dataset.i), 1); pintarRevision(); });
      });
    }

    box.querySelector('#btn-agregar-linea-ocr').addEventListener('click', () => {
      filas.push({ codigo: '', nombre: '' });
      pintarRevision();
    });

    box.querySelector('#btn-guardar-ocr').addEventListener('click', async () => {
      const validas = filas.filter(f => (f.nombre || '').trim() || (f.codigo || '').trim());
      if (validas.length === 0) { showToast('No hay ninguna línea para guardar', 'error'); return; }
      for (const f of validas) {
        await agregar({ codigo: f.codigo.trim(), nombre: f.nombre.trim() });
      }
      showToast(`${validas.length} tratamiento(s) agregado(s)`);
      close();
      await onImportado();
    });
  });
}

// ---------------------------------------------------------------------
// Editor de productos/aplicaciones de un tratamiento (o nivel de factor).
// Una "aplicación" es un momento de aplicación (principal o secuencial,
// es decir, aplicada más adelante en el tiempo) con uno o varios productos
// (mezcla de tanque).
// ---------------------------------------------------------------------
function abrirEditorProductos(tratamiento, onGuardado) {
  let aplicaciones = (tratamiento.aplicaciones || []).map(a => ({
    id: a.id || nuevoId(),
    tipo: a.tipo || 'principal',
    momento: a.momento || '',
    productos: (a.productos || []).map(p => ({ ...p }))
  }));

  openModal((box, close) => {
    function pintar() {
      box.innerHTML = `
        <h3>Productos — ${tratamiento.codigo}</h3>
        <p class="field-hint">${tratamiento.nombre || ''}</p>
        <div id="lista-aplicaciones"></div>
        <div class="btn-row">
          <button class="btn" id="btn-add-principal" type="button">+ Aplicación principal</button>
          <button class="btn" id="btn-add-secuencial" type="button">+ Aplicación secuencial</button>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-guardar-productos" type="button">Guardar</button>
          <button class="btn" id="btn-cerrar-productos" type="button">Cerrar sin guardar</button>
        </div>
      `;

      const cont = box.querySelector('#lista-aplicaciones');
      if (aplicaciones.length === 0) {
        cont.innerHTML = '<p class="empty-state">Sin aplicaciones cargadas todavía.</p>';
      } else {
        cont.innerHTML = '';
        aplicaciones.forEach((ap, i) => {
          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = `
            <div class="btn-row" style="margin-top:0;justify-content:space-between;align-items:center">
              <strong>${ap.tipo === 'secuencial' ? 'Aplicación secuencial' : 'Aplicación principal'}</strong>
              <button class="btn btn-sm btn-danger" data-accion="quitar-aplicacion" data-i="${i}" type="button">Quitar</button>
            </div>
            <div class="field">
              <label>Momento de aplicación${ap.tipo === 'secuencial' ? ' (ej. "15 días después de la principal")' : ''}</label>
              <input class="in-momento" data-i="${i}" value="${ap.momento}" placeholder="${ap.tipo === 'secuencial' ? 'ej. 15 días después, macollaje...' : 'ej. Pre-emergente, V4...'}">
            </div>
            <div id="productos-${i}"></div>
            <div class="btn-row">
              <button class="btn btn-sm" data-accion="agregar-producto" data-i="${i}" type="button">+ Producto</button>
            </div>
          `;
          cont.appendChild(card);

          const prodCont = card.querySelector(`#productos-${i}`);
          if (ap.productos.length === 0) {
            prodCont.innerHTML = '<p class="field-hint">Sin productos en esta aplicación.</p>';
          } else {
            ap.productos.forEach((p, j) => {
              const fila = document.createElement('div');
              fila.className = 'field-row';
              fila.innerHTML = `
                <div class="field" style="flex:2;margin-bottom:6px">
                  <input class="in-prod-nombre" data-i="${i}" data-j="${j}" value="${p.nombre || ''}" placeholder="Producto">
                </div>
                <div class="field" style="margin-bottom:6px">
                  <input class="in-prod-dosis" data-i="${i}" data-j="${j}" type="number" step="any" value="${p.dosis ?? ''}" placeholder="Dosis">
                </div>
                <div class="field" style="max-width:90px;margin-bottom:6px">
                  <input class="in-prod-unidad" data-i="${i}" data-j="${j}" value="${p.unidad || ''}" placeholder="Unidad">
                </div>
                <button class="btn btn-sm btn-danger" data-accion="quitar-producto" data-i="${i}" data-j="${j}" type="button" style="align-self:flex-start;margin-top:2px">✕</button>
              `;
              prodCont.appendChild(fila);
            });
          }
        });
      }

      cont.querySelectorAll('.in-momento').forEach(inp => {
        inp.addEventListener('input', () => { aplicaciones[Number(inp.dataset.i)].momento = inp.value; });
        habilitarDictado(inp);
      });
      cont.querySelectorAll('.in-prod-nombre').forEach(inp => {
        inp.addEventListener('input', () => { aplicaciones[Number(inp.dataset.i)].productos[Number(inp.dataset.j)].nombre = inp.value; });
        habilitarDictado(inp);
      });
      cont.querySelectorAll('.in-prod-dosis').forEach(inp => {
        inp.addEventListener('input', () => { aplicaciones[Number(inp.dataset.i)].productos[Number(inp.dataset.j)].dosis = inp.value; });
      });
      cont.querySelectorAll('.in-prod-unidad').forEach(inp => {
        inp.addEventListener('input', () => { aplicaciones[Number(inp.dataset.i)].productos[Number(inp.dataset.j)].unidad = inp.value; });
      });
      cont.querySelectorAll('[data-accion="agregar-producto"]').forEach(btn => {
        btn.addEventListener('click', () => {
          aplicaciones[Number(btn.dataset.i)].productos.push({ id: nuevoId(), nombre: '', dosis: '', unidad: '' });
          pintar();
        });
      });
      cont.querySelectorAll('[data-accion="quitar-producto"]').forEach(btn => {
        btn.addEventListener('click', () => {
          aplicaciones[Number(btn.dataset.i)].productos.splice(Number(btn.dataset.j), 1);
          pintar();
        });
      });
      cont.querySelectorAll('[data-accion="quitar-aplicacion"]').forEach(btn => {
        btn.addEventListener('click', () => {
          aplicaciones.splice(Number(btn.dataset.i), 1);
          pintar();
        });
      });

      box.querySelector('#btn-add-principal').addEventListener('click', () => {
        aplicaciones.push({ id: nuevoId(), tipo: 'principal', momento: '', productos: [] });
        pintar();
      });
      box.querySelector('#btn-add-secuencial').addEventListener('click', () => {
        aplicaciones.push({ id: nuevoId(), tipo: 'secuencial', momento: '', productos: [] });
        pintar();
      });
      box.querySelector('#btn-guardar-productos').addEventListener('click', async () => {
        await actualizarTratamiento(tratamiento.id, { aplicaciones });
        showToast('Productos guardados');
        close();
        await onGuardado();
      });
      box.querySelector('#btn-cerrar-productos').addEventListener('click', close);
    }

    pintar();
  });
}
