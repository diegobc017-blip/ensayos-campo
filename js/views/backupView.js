import { exportarRespaldo, descargarRespaldo, leerArchivoRespaldo, importarRespaldo } from '../utils/exportImport.js';
import { estimarAlmacenamiento, pedirPersistencia } from '../db/db.js';
import { showToast, confirmDialog } from '../components/ui.js';

function formatearBytes(bytes) {
  if (bytes == null) return '?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function render(main, setHeader) {
  setHeader('Respaldo', true, () => history.back());
  main.innerHTML = '<p class="field-hint">Cargando...</p>';

  const estimacion = await estimarAlmacenamiento();

  main.innerHTML = `
    <div class="card">
      <h3>Espacio usado</h3>
      ${estimacion
        ? `<p>${formatearBytes(estimacion.usage)} usados de ${formatearBytes(estimacion.quota)} disponibles en este navegador.</p>`
        : '<p class="field-hint">Este navegador no permite estimar el espacio usado.</p>'}
      <button class="btn btn-sm" id="btn-persistir">Pedir almacenamiento persistente</button>
    </div>

    <div class="card">
      <h3>Exportar respaldo</h3>
      <p class="field-hint">Los datos de esta app viven solo en este dispositivo/navegador. Exportá un respaldo periódicamente para no perder tu trabajo.</p>
      <button class="btn btn-primary btn-block" id="btn-exportar">Exportar todo a un archivo</button>
    </div>

    <div class="card">
      <h3>Importar respaldo</h3>
      <div class="field">
        <label for="input-respaldo">Elegir archivo de respaldo (.json)</label>
        <input type="file" id="input-respaldo" accept="application/json">
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-fusionar" disabled>Fusionar con lo actual</button>
        <button class="btn btn-danger" id="btn-reemplazar" disabled>Reemplazar todo</button>
      </div>
    </div>
  `;

  main.querySelector('#btn-persistir').addEventListener('click', async () => {
    const ok = await pedirPersistencia();
    showToast(ok ? 'Almacenamiento persistente concedido' : 'El navegador no concedió almacenamiento persistente');
  });

  main.querySelector('#btn-exportar').addEventListener('click', async () => {
    showToast('Generando respaldo...');
    const respaldo = await exportarRespaldo();
    descargarRespaldo(respaldo);
    showToast('Respaldo descargado');
  });

  let archivoElegido = null;
  const input = main.querySelector('#input-respaldo');
  const btnFusionar = main.querySelector('#btn-fusionar');
  const btnReemplazar = main.querySelector('#btn-reemplazar');

  input.addEventListener('change', () => {
    archivoElegido = input.files[0] || null;
    btnFusionar.disabled = !archivoElegido;
    btnReemplazar.disabled = !archivoElegido;
  });

  async function ejecutarImportacion(modo) {
    if (!archivoElegido) return;
    try {
      const respaldo = await leerArchivoRespaldo(archivoElegido);
      if (modo === 'reemplazar') {
        const ok = await confirmDialog({
          titulo: 'Reemplazar todos los datos',
          mensaje: 'Esto borra todo lo que tenés cargado ahora en este dispositivo y lo reemplaza por el contenido del respaldo. No se puede deshacer.',
          textoConfirmar: 'Reemplazar todo',
          peligroso: true
        });
        if (!ok) return;
      }
      await importarRespaldo(respaldo, modo);
      showToast('Respaldo importado');
    } catch (e) {
      console.error(e);
      showToast('No se pudo importar el archivo: ' + e.message, 'error');
    }
  }

  btnFusionar.addEventListener('click', () => ejecutarImportacion('fusionar'));
  btnReemplazar.addEventListener('click', () => ejecutarImportacion('reemplazar'));
}
