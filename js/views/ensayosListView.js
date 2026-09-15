import { listarEnsayos, ETIQUETAS_DISENO } from '../db/ensayosRepo.js';
import { navegar } from '../router.js';

const ETIQUETA_ESTADO = {
  planificacion: 'Planificación',
  en_curso: 'En curso',
  finalizado: 'Finalizado'
};

export async function render(main, setHeader) {
  setHeader('Ensayos de Campo', false);
  main.innerHTML = '<p class="field-hint">Cargando...</p>';

  const ensayos = await listarEnsayos();

  main.innerHTML = '';

  if (ensayos.length === 0) {
    const vacio = document.createElement('div');
    vacio.className = 'empty-state';
    vacio.innerHTML = `
      <h3>Todavía no cargaste ningún ensayo</h3>
      <p>Tocá el botón "+ Nuevo ensayo" para empezar.</p>
    `;
    main.appendChild(vacio);
  } else {
    for (const ensayo of ensayos) {
      const card = document.createElement('button');
      card.className = 'card card-list-item';
      const detalleDiseno = ensayo.tipoDiseno === 'FRANJA'
        ? `Factor A: ${ensayo.numFactorA || 0} · Factor B: ${ensayo.numFactorB || 0} · ${ensayo.numBloques || 0} bloques`
        : `${ensayo.numTratamientos || 0} tratamientos · ${ensayo.numBloques || 0} bloques`;
      card.innerHTML = `
        <div class="card-title">${ensayo.nombre}</div>
        <div class="card-sub">${ensayo.cultivo || 'Sin cultivo'} · ${ensayo.ubicacion || 'Sin ubicación'}</div>
        <div class="card-sub">${detalleDiseno}</div>
        <span class="badge">${ETIQUETAS_DISENO[ensayo.tipoDiseno] || ETIQUETAS_DISENO.BCA}</span>
        <span class="badge badge-${ensayo.estado}">${ETIQUETA_ESTADO[ensayo.estado] || ensayo.estado}</span>
      `;
      card.addEventListener('click', () => navegar(`#/ensayo/${ensayo.id}/tratamientos`));
      main.appendChild(card);
    }
  }

  const fab = document.createElement('button');
  fab.className = 'btn btn-primary btn-fab';
  fab.textContent = '+ Nuevo ensayo';
  fab.addEventListener('click', () => navegar('#/ensayo/nuevo'));
  main.appendChild(fab);
}
