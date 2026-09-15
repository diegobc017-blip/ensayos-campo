import { ruta, iniciarRouter, navegar } from './router.js';
import { renderTabs, ocultarTabs } from './components/tabs.js';
import { showToast, openModal } from './components/ui.js';
import { obtenerEnsayo } from './db/ensayosRepo.js';

import * as ensayosListView from './views/ensayosListView.js';
import * as ensayoFormView from './views/ensayoFormView.js';
import * as tratamientosView from './views/tratamientosView.js';
import * as dosificacionView from './views/dosificacionView.js';
import * as disenoView from './views/disenoView.js';
import * as mapaCampoView from './views/mapaCampoView.js';
import * as resultadosView from './views/resultadosView.js';
import * as informeView from './views/informeView.js';
import * as fotosNotasView from './views/fotosNotasView.js';
import * as backupView from './views/backupView.js';

const main = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
const titleEl = document.getElementById('app-title');
const btnBack = document.getElementById('btn-back');
const btnRespaldo = document.getElementById('btn-respaldo');
const btnInstalar = document.getElementById('btn-instalar');

let onBackHandler = null;

function setHeader(titulo, mostrarBack, onBack) {
  titleEl.textContent = titulo;
  btnBack.hidden = !mostrarBack;
  onBackHandler = onBack || (() => navegar('#/'));
}

btnBack.addEventListener('click', () => onBackHandler && onBackHandler());
btnRespaldo.addEventListener('click', () => navegar('#/respaldo'));

const TABS_ENSAYO = [
  { key: 'tratamientos', label: 'Tratamientos' },
  { key: 'dosificacion', label: 'Dosificación' },
  { key: 'diseno', label: 'Diseño' },
  { key: 'mapa', label: 'Mapa de campo' },
  { key: 'resultados', label: 'Resultados' },
  { key: 'informe', label: 'Informe' },
  { key: 'fotos-notas', label: 'Fotos y notas' },
  { key: 'editar', label: '✎ Editar' }
];

const VISTAS_TAB = {
  tratamientos: tratamientosView,
  dosificacion: dosificacionView,
  diseno: disenoView,
  mapa: mapaCampoView,
  resultados: resultadosView,
  informe: informeView,
  'fotos-notas': fotosNotasView
};

ruta('/', () => {
  ocultarTabs(tabsEl);
  ensayosListView.render(main, setHeader);
});

ruta('/ensayo/nuevo', () => {
  ocultarTabs(tabsEl);
  ensayoFormView.render(main, setHeader, null);
});

ruta('/ensayo/:id/editar', ({ id }) => {
  ocultarTabs(tabsEl);
  ensayoFormView.render(main, setHeader, id);
});

ruta('/ensayo/:id', ({ id }) => {
  navegar(`#/ensayo/${id}/tratamientos`);
});

ruta('/ensayo/:id/:tab', async ({ id, tab }) => {
  const ensayo = await obtenerEnsayo(id);
  if (!ensayo) {
    showToast('El ensayo no existe', 'error');
    navegar('#/');
    return;
  }

  if (tab === 'editar') {
    navegar(`#/ensayo/${id}/editar`);
    return;
  }

  const vista = VISTAS_TAB[tab];
  if (!vista) {
    navegar(`#/ensayo/${id}/tratamientos`);
    return;
  }

  setHeader(ensayo.nombre, true, () => navegar('#/'));
  renderTabs(tabsEl, TABS_ENSAYO, tab, (key) => {
    if (key === 'editar') navegar(`#/ensayo/${id}/editar`);
    else navegar(`#/ensayo/${id}/${key}`);
  });

  main.innerHTML = '<p class="field-hint">Cargando...</p>';
  await vista.render(main, ensayo);
});

ruta('/respaldo', () => {
  ocultarTabs(tabsEl);
  backupView.render(main, setHeader);
});

iniciarRouter();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('No se pudo registrar el service worker', e));
  });
}

// --- Instalar como app en el celular -------------------------------------

function corriendoInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
let promptDiferido = null;

if (!corriendoInstalada()) {
  btnInstalar.hidden = false;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptDiferido = e;
  btnInstalar.hidden = false;
});

window.addEventListener('appinstalled', () => {
  btnInstalar.hidden = true;
  promptDiferido = null;
});

btnInstalar.addEventListener('click', async () => {
  if (promptDiferido) {
    promptDiferido.prompt();
    await promptDiferido.userChoice;
    promptDiferido = null;
    return;
  }
  openModal((box, close) => {
    box.innerHTML = `
      <h3>Instalar en el celular</h3>
      ${esIOS ? `
        <p>En Safari (iPhone/iPad):</p>
        <ol>
          <li>Tocá el botón compartir <strong>(&#x25A2; con flecha hacia arriba)</strong>.</li>
          <li>Elegí <strong>"Agregar a pantalla de inicio"</strong>.</li>
        </ol>
      ` : `
        <p>En Chrome (Android):</p>
        <ol>
          <li>Tocá el menú <strong>⋮</strong> (arriba a la derecha).</li>
          <li>Elegí <strong>"Instalar app"</strong> o <strong>"Agregar a pantalla de inicio"</strong>.</li>
        </ol>
      `}
      <p class="field-hint">Una vez instalada funciona sin conexión; los datos ya viven en este dispositivo.</p>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-cerrar-instalar">Entendido</button>
      </div>
    `;
    box.querySelector('#btn-cerrar-instalar').addEventListener('click', close);
  });
});
