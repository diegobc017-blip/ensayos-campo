// Modal para importar una tabla completa de tratamientos (varias líneas de
// ingredientes activos por tratamiento, como una planilla de diseño de
// franjas o de instalación de ensayos) a partir de una FOTO o de un
// archivo EXCEL/CSV. A diferencia de "Cargar por foto" (que asume una
// línea = un tratamiento), acá cada tratamiento puede traer varios
// productos (incluida una aplicación secuencial marcada "SEC.:"), y el
// resultado se arma con títulos genéricos "Tratamiento 1, 2, 3..." para
// que la persona después indique qué es cada uno (pre-emergente,
// efectividad de tal ingrediente, etc.) — lo importante es que los
// productos y dosis ya queden cargados.

import { openModal, showToast, confirmDialog } from '../components/ui.js';
import { reconocerTexto, mensajeProgreso } from '../utils/ocr.js';
import { leerFilasDeArchivo } from '../utils/xlsxImport.js';
import { filasDesdeLineasOCR, filasDesdeHojaExcel, construirTratamientosDesdeFilas } from '../utils/tablaImport.js';
import { interpretarProducto } from '../utils/textMatch.js';
import { listarProductosComerciales, aprenderProductoComercial } from '../db/productosComercialesRepo.js';
import { INGREDIENTES_ACTIVOS } from '../data/ingredientesActivos.js';
import { nuevoId } from '../utils/idGen.js';

const ETIQUETAS_TIPO = {
  activo: '✓ Ingrediente activo reconocido',
  comercial: '✓ Producto comercial conocido (mezcla)',
  coadyuvante: 'Coadyuvante / adyuvante (no es ingrediente activo)',
  desconocido: '⚠ No se reconoce — revisá el nombre o definilo como producto comercial',
  vacio: ''
};

/**
 * @param {{onImportado:()=>Promise<void>, agregar:(datos:object)=>Promise<object>, actualizar:(id:string, cambios:object)=>Promise<object>}} opciones
 */
export function abrirImportarTablaCompleta({ onImportado, agregar, actualizar }) {
  let filas = [];
  let productosComerciales = [];
  let cargando = false;

  openModal((box, close) => {
    async function pintar() {
      box.innerHTML = `
        <h3>Importar tabla completa</h3>
        <p class="field-hint">Para tablas con varios ingredientes por tratamiento (ej. diseño de franjas o instalación de ensayo), desde una <strong>foto</strong> o un archivo <strong>Excel/CSV</strong> con las columnas "franja/tratamiento", "ingredientes activos" y "dosis". Vas a poder revisar y corregir todo antes de guardar — los tratamientos se crean como "Tratamiento 1, 2, 3..." para que después indiques qué es cada uno.</p>
        <input type="file" id="tabla-foto" accept="image/*" hidden>
        <input type="file" id="tabla-excel" accept=".xlsx,.xls,.csv,.txt" hidden>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-tabla-foto" type="button">📷 Foto de la tabla</button>
          <button class="btn btn-primary" id="btn-tabla-excel" type="button">📊 Archivo Excel / CSV</button>
        </div>
        <div id="tabla-estado"></div>
        <div id="tabla-revision"></div>
        <div class="btn-row" id="tabla-acciones" hidden>
          <button class="btn" id="btn-tabla-add-fila" type="button">+ Agregar línea</button>
          <button class="btn btn-primary" id="btn-tabla-guardar" type="button">Guardar tratamientos</button>
        </div>
      `;

      const estado = box.querySelector('#tabla-estado');
      const revision = box.querySelector('#tabla-revision');
      const acciones = box.querySelector('#tabla-acciones');

      box.querySelector('#btn-tabla-foto').addEventListener('click', () => box.querySelector('#tabla-foto').click());
      box.querySelector('#btn-tabla-excel').addEventListener('click', () => box.querySelector('#tabla-excel').click());

      box.querySelector('#tabla-foto').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        cargando = true;
        estado.innerHTML = '<p class="field-hint">Preparando...</p>';
        try {
          const { lineas } = await reconocerTexto(file, {
            onProgreso: (m) => { estado.innerHTML = `<p class="field-hint">${mensajeProgreso(m)}</p>`; }
          });
          filas = filasDesdeLineasOCR(lineas);
          if (filas.length === 0) filas = [filaVacia(true)];
          estado.innerHTML = `<p class="field-hint">Se detectaron ${filas.length} línea(s). El reconocimiento en foto puede equivocarse (más con letra manuscrita) — revisá cada línea, especialmente dónde empieza cada tratamiento.</p>`;
        } catch (err) {
          console.error(err);
          estado.innerHTML = '<p class="warning-box">No se pudo leer la foto. Probá con mejor luz, más cerca o menos inclinada.</p>';
          filas = [];
        }
        cargando = false;
        await pintar();
      });

      box.querySelector('#tabla-excel').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        cargando = true;
        estado.innerHTML = '<p class="field-hint">Leyendo archivo...</p>';
        await pintar();
        try {
          const filas2D = await leerFilasDeArchivo(file);
          filas = filasDesdeHojaExcel(filas2D);
          if (filas.length === 0) {
            estado.innerHTML = '<p class="warning-box">No se encontraron filas con datos en el archivo.</p>';
            filas = [filaVacia(true)];
          } else {
            estado.innerHTML = `<p class="field-hint">Se leyeron ${filas.length} línea(s) del archivo. Revisá que la agrupación por tratamiento y las dosis sean correctas antes de guardar.</p>`;
          }
        } catch (err) {
          console.error(err);
          estado.innerHTML = '<p class="warning-box">No se pudo leer el archivo. Verificá que sea un .xlsx, .xls o .csv válido.</p>';
          filas = [];
        }
        cargando = false;
        await pintar();
      });

      if (filas.length === 0) {
        acciones.hidden = true;
        return;
      }
      acciones.hidden = false;
      if (!productosComerciales.length) productosComerciales = await listarProductosComerciales();
      pintarRevision(revision, filas, productosComerciales, () => pintar());

      box.querySelector('#btn-tabla-add-fila').addEventListener('click', () => {
        filas.push(filaVacia(filas.length === 0));
        pintar();
      });

      box.querySelector('#btn-tabla-guardar').addEventListener('click', async () => {
        const filasValidas = filas.filter(f => f.ingredienteTexto.trim());
        if (filasValidas.length === 0) { showToast('No hay ninguna línea con contenido para guardar', 'error'); return; }
        const specs = construirTratamientosDesdeFilas(filas, productosComerciales);
        if (specs.length === 0) { showToast('No se pudo armar ningún tratamiento', 'error'); return; }

        const desconocidos = specs.reduce((n, s) => n + s.aplicaciones.reduce((m, a) =>
          m + a.productos.filter(p => p.tipo === 'desconocido').length, 0), 0);
        if (desconocidos > 0) {
          const ok = await confirmDialog({
            titulo: 'Hay productos sin identificar',
            mensaje: `${desconocidos} producto(s) no se pudieron reconocer como ingrediente activo ni como producto comercial conocido. Se van a guardar igual (podés corregirlos después desde "Productos" de cada tratamiento). ¿Continuar?`,
            textoConfirmar: 'Guardar igual'
          });
          if (!ok) return;
        }

        for (const spec of specs) {
          const creado = await agregar({ codigo: spec.codigo, nombre: spec.nombre });
          if (spec.aplicaciones.length > 0) {
            await actualizar(creado.id, { aplicaciones: spec.aplicaciones });
          }
        }
        showToast(`${specs.length} tratamiento(s) importado(s)`);
        close();
        await onImportado();
      });
    }

    pintar();
  });

  function filaVacia(nuevoTrat) {
    return {
      id: nuevoId(), nuevoTratamiento: nuevoTrat, labelDetectado: '',
      ingredienteTexto: '', concentracion: null, dosis: '', unidad: '', secuencial: false
    };
  }

  function pintarRevision(revision, filas, productosComerciales, onCambio) {
    revision.innerHTML = '';
    let numTratamiento = 0;

    filas.forEach((f, i) => {
      if (f.nuevoTratamiento) {
        numTratamiento++;
        const divisor = document.createElement('div');
        divisor.className = 'section-title';
        divisor.innerHTML = `<strong>Tratamiento ${numTratamiento}</strong>${f.labelDetectado ? ` <span class="field-hint">(detectado como "${f.labelDetectado}" en la tabla)</span>` : ''}`;
        revision.appendChild(divisor);
      }

      const fila = document.createElement('div');
      fila.className = 'card';
      fila.style.padding = '10px';
      fila.style.marginBottom = '8px';

      const interpretado = interpretarProducto(f.ingredienteTexto, productosComerciales);
      f.tipoDetectado = interpretado.tipo;

      fila.innerHTML = `
        <div class="field-row" style="flex-wrap:wrap;align-items:flex-end">
          <label style="display:flex;align-items:center;gap:4px;margin-bottom:8px">
            <input type="checkbox" class="in-tabla-nuevo" ${f.nuevoTratamiento ? 'checked' : ''}>
            <span class="field-hint">Nuevo tratamiento acá</span>
          </label>
          <div class="field" style="flex:2;min-width:160px;margin-bottom:8px">
            <input class="in-tabla-ingrediente" value="${escapar(f.ingredienteTexto)}" placeholder="Ingrediente activo o producto">
          </div>
          <div class="field" style="max-width:90px;margin-bottom:8px">
            <input class="in-tabla-conc" type="number" step="any" min="0" max="100" value="${f.concentracion ?? ''}" placeholder="% conc.">
          </div>
          <div class="field" style="max-width:100px;margin-bottom:8px">
            <input class="in-tabla-dosis" value="${escapar(f.dosis)}" placeholder="Dosis">
          </div>
          <div class="field" style="max-width:80px;margin-bottom:8px">
            <input class="in-tabla-unidad" value="${escapar(f.unidad)}" placeholder="cc, gr...">
          </div>
          <label style="display:flex;align-items:center;gap:4px;margin-bottom:8px">
            <input type="checkbox" class="in-tabla-sec" ${f.secuencial ? 'checked' : ''}>
            <span class="field-hint">Secuencial</span>
          </label>
          <button class="btn btn-sm btn-danger" data-accion="quitar" type="button" style="margin-bottom:8px">✕</button>
        </div>
        <p class="field-hint in-tabla-feedback">${ETIQUETAS_TIPO[interpretado.tipo] || ''}</p>
        ${interpretado.tipo === 'desconocido' && f.ingredienteTexto.trim() ? '<button class="btn btn-sm" data-accion="definir-comercial" type="button">¿Es un producto comercial (mezcla)? Definirlo</button>' : ''}
      `;
      revision.appendChild(fila);

      fila.querySelector('.in-tabla-nuevo').addEventListener('change', (e) => { f.nuevoTratamiento = e.target.checked; onCambio(); });
      fila.querySelector('.in-tabla-ingrediente').addEventListener('input', (e) => { f.ingredienteTexto = e.target.value; });
      fila.querySelector('.in-tabla-ingrediente').addEventListener('blur', onCambio);
      fila.querySelector('.in-tabla-conc').addEventListener('input', (e) => { f.concentracion = e.target.value === '' ? null : Number(e.target.value); });
      fila.querySelector('.in-tabla-dosis').addEventListener('input', (e) => { f.dosis = e.target.value; });
      fila.querySelector('.in-tabla-unidad').addEventListener('input', (e) => { f.unidad = e.target.value; });
      fila.querySelector('.in-tabla-sec').addEventListener('change', (e) => { f.secuencial = e.target.checked; });
      fila.querySelector('[data-accion="quitar"]').addEventListener('click', () => {
        filas.splice(i, 1);
        onCambio();
      });
      const btnDefinir = fila.querySelector('[data-accion="definir-comercial"]');
      if (btnDefinir) {
        btnDefinir.addEventListener('click', () => {
          abrirDefinirProductoComercial(f.ingredienteTexto, async () => {
            productosComerciales.length = 0;
            productosComerciales.push(...(await listarProductosComerciales()));
            onCambio();
          });
        });
      }
    });
  }
}

function escapar(s) {
  return (s ?? '').toString().replace(/"/g, '&quot;');
}

/** Mini-modal para aprender un producto comercial nuevo (nombre -> ingredientes activos + %). */
export function abrirDefinirProductoComercial(nombreSugerido, onAprendido, ingredientesIniciales) {
  let ingredientes = ingredientesIniciales && ingredientesIniciales.length
    ? ingredientesIniciales.map(i => ({ nombre: i.nombre || '', concentracion: i.concentracion ?? '' }))
    : [{ nombre: '', concentracion: '' }];

  openModal((box, close) => {
    function pintar() {
      box.innerHTML = `
        <h3>Definir producto comercial</h3>
        <p class="field-hint">Indicá qué ingrediente(s) activo(s) lleva este producto comercial. Se va a guardar para reconocerlo solo la próxima vez.</p>
        <div class="field">
          <label>Nombre comercial</label>
          <input id="def-nombre" value="${escapar(nombreSugerido)}">
        </div>
        <div id="def-ingredientes"></div>
        <div class="btn-row">
          <button class="btn" id="btn-def-add" type="button">+ Agregar ingrediente activo</button>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-def-guardar" type="button">Guardar</button>
          <button class="btn" id="btn-def-cancelar" type="button">Cancelar</button>
        </div>
      `;
      const cont = box.querySelector('#def-ingredientes');
      ingredientes.forEach((ing, i) => {
        const fila = document.createElement('div');
        fila.className = 'field-row';
        fila.innerHTML = `
          <div class="field" style="flex:2;margin-bottom:6px">
            <input class="def-ing-nombre" list="lista-activos-${i}" data-i="${i}" value="${escapar(ing.nombre)}" placeholder="Ingrediente activo">
            <datalist id="lista-activos-${i}">${INGREDIENTES_ACTIVOS.map(a => `<option value="${a.nombre}">`).join('')}</datalist>
          </div>
          <div class="field" style="max-width:100px;margin-bottom:6px">
            <input class="def-ing-conc" type="number" step="any" min="0" max="100" data-i="${i}" value="${ing.concentracion}" placeholder="% conc.">
          </div>
          <button class="btn btn-sm btn-danger" data-accion="quitar-ing" data-i="${i}" type="button">✕</button>
        `;
        cont.appendChild(fila);
      });
      cont.querySelectorAll('.def-ing-nombre').forEach(inp => {
        inp.addEventListener('input', () => { ingredientes[Number(inp.dataset.i)].nombre = inp.value; });
      });
      cont.querySelectorAll('.def-ing-conc').forEach(inp => {
        inp.addEventListener('input', () => { ingredientes[Number(inp.dataset.i)].concentracion = inp.value; });
      });
      cont.querySelectorAll('[data-accion="quitar-ing"]').forEach(btn => {
        btn.addEventListener('click', () => { ingredientes.splice(Number(btn.dataset.i), 1); pintar(); });
      });
      box.querySelector('#btn-def-add').addEventListener('click', () => {
        ingredientes.push({ nombre: '', concentracion: '' });
        pintar();
      });
      box.querySelector('#btn-def-cancelar').addEventListener('click', close);
      box.querySelector('#btn-def-guardar').addEventListener('click', async () => {
        const nombre = box.querySelector('#def-nombre').value.trim();
        const validos = ingredientes.filter(i => i.nombre.trim());
        if (!nombre || validos.length === 0) {
          showToast('Completá el nombre y al menos un ingrediente activo', 'error');
          return;
        }
        await aprenderProductoComercial(nombre, validos);
        showToast('Producto comercial guardado');
        close();
        await onAprendido();
      });
    }
    pintar();
  });
}
