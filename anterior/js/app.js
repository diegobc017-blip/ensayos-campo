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
const btnAyuda = document.getElementById('btn-ayuda');

let onBackHandler = null;

function setHeader(titulo, mostrarBack, onBack) {
  titleEl.textContent = titulo;
  btnBack.hidden = !mostrarBack;
  onBackHandler = onBack || (() => navegar('#/'));
}

btnBack.addEventListener('click', () => onBackHandler && onBackHandler());
btnRespaldo.addEventListener('click', () => navegar('#/respaldo'));

// --- Ayuda: qué hace cada pantalla ----------------------------------------

btnAyuda.addEventListener('click', () => {
  openModal((box, close) => {
    box.innerHTML = `
      <h3>¿Cómo funciona la app?</h3>
      <p class="field-hint">Funciona sin conexión: todo se guarda en este dispositivo. Podés instalarla como app (botón &#8615;) y usar el botón &#128190; para respaldar/pasar los datos a otro celular.</p>
      <div class="section-title">
        <p><strong>1. Creá el ensayo</strong></p>
        <p class="field-hint">Nombre, cultivo, tipo de diseño (BCA, DCA o Franjas cruzadas), cantidad de tratamientos/bloques y tamaño de parcela. Podés editarlo después desde "✎ Editar".</p>
      </div>
      <div class="section-title">
        <p><strong>2. Tratamientos</strong></p>
        <p class="field-hint">Cargá cada tratamiento a mano, dictando por voz, con "Cargar por foto" (una línea = un tratamiento simple), o con "Importar tabla completa" desde una foto o un Excel/CSV de una planilla con varios productos por tratamiento — se arman como "Tratamiento 1, 2..." y siempre te muestra una pantalla para revisar y corregir antes de guardar. En "Productos" de cada tratamiento cargás el ingrediente activo (o nombre comercial) y el % de concentración; si es una mezcla comercial (ej. "Jinete" = dos activos), la podés definir una vez y la app la reconoce sola después.</p>
      </div>
      <div class="section-title">
        <p><strong>3. Diseño</strong></p>
        <p class="field-hint">Fijás el primer bloque y la app sortea el resto, evitando que un mismo tratamiento quede adyacente entre bloques (en BCA). Ahí también podés indicar la orientación (Norte/Sur/Este/Oeste) para ubicarte en el lote.</p>
      </div>
      <div class="section-title">
        <p><strong>4. Mapa de campo</strong></p>
        <p class="field-hint">Es el plano ya sorteado: tocá una parcela para cambiar el tratamiento a mano, o para sacarle fotos y agregar notas puntuales de esa parcela.</p>
      </div>
      <div class="section-title">
        <p><strong>5. Dosificación</strong></p>
        <p class="field-hint">Calcula sola la dosis por parcela y por todo el ensayo a partir de la dosis por hectárea que cargaste. También podés cargar la calibración del aplicador (tipo de pulverizadora, velocidad, caudal, tamaño del tanque) y usar "Preparar en un recipiente" para saber cuánto producto poner en una botella o mochila puntual.</p>
      </div>
      <div class="section-title">
        <p><strong>6. Resultados e Informe</strong></p>
        <p class="field-hint">Cargás las mediciones de campo (por variable y parcela) y el Informe arma automáticamente los promedios por tratamiento y por bloque, listo para exportar a PDF o CSV.</p>
      </div>
      <div class="section-title">
        <p><strong>7. Fotos y notas</strong></p>
        <p class="field-hint">Fotos y observaciones generales del ensayo (además de las que podés sacar parcela por parcela desde el Mapa de campo).</p>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-cerrar-ayuda">Entendido</button>
      </div>
    `;
    box.querySelector('#btn-cerrar-ayuda').addEventListener('click', close);
  });
});

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
