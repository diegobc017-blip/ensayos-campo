import { listarTratamientos } from '../db/tratamientosRepo.js';
import { obtenerDiseno, tieneDiseno } from '../db/layoutRepo.js';
import { actualizarEnsayo } from '../db/ensayosRepo.js';
import {
  areaParcelaHa, escalarPorHectarea, unidadSinPorHectarea, contarParcelasPorTratamiento,
  dosisIngredienteActivoPorHa, calcularDosisPorRecipiente
} from '../domain/dosificacion.js';

const ETIQUETAS_PULVERIZADORA = {
  mochila_manual: 'Mochila manual',
  mochila_motor: 'Mochila a motor/batería',
  mochila_co2: 'Mochila a CO2',
  arrastre: 'Pulverizadora de arrastre (tractor)',
  autopropulsada: 'Autopropulsada',
  dron: 'Dron',
  otra: 'Otra'
};

export async function render(main, ensayo) {
  const [tratamientos, { bloques, celdasPorBloque }] = await Promise.all([
    listarTratamientos(ensayo.id),
    obtenerDiseno(ensayo.id)
  ]);

  const areaHa = areaParcelaHa(ensayo);
  if (!areaHa) {
    main.innerHTML = `
      <div class="empty-state">
        <h3>Falta el tamaño de parcela</h3>
        <p>Cargá el ancho y el largo de la parcela editando el ensayo (pestaña "✎ Editar") para poder calcular las dosis automáticamente.</p>
      </div>
    `;
    return;
  }

  const tratamientosBase = tratamientos.filter(t => t.factor !== 'combo');
  const conProductos = tratamientosBase.filter(t => (t.aplicaciones || []).some(a => (a.productos || []).length > 0));

  if (conProductos.length === 0) {
    main.innerHTML = `
      <div class="empty-state">
        <h3>Todavía no cargaste productos</h3>
        <p>Cargá los productos y su dosis por hectárea en la pestaña "Tratamientos" (botón "Productos" de cada tratamiento) para ver acá el cálculo automático.</p>
      </div>
    `;
    return;
  }

  const hayDiseno = tieneDiseno(bloques);
  const celdasPlanas = [];
  for (const arr of celdasPorBloque.values()) celdasPlanas.push(...arr);
  const conteoPorTratamiento = hayDiseno ? contarParcelasPorTratamiento(ensayo, tratamientos, celdasPlanas) : new Map();

  const areaM2 = areaHa * 10000;

  main.innerHTML = `
    <div class="card">
      <h3>Dosificación automática</h3>
      <p class="field-hint">Tamaño de parcela: ${ensayo.dimensionParcela.ancho} × ${ensayo.dimensionParcela.largo} ${ensayo.dimensionParcela.unidad} = ${areaM2.toFixed(2)} m² (${areaHa.toFixed(5)} ha).</p>
      ${!hayDiseno ? '<p class="warning-box">Todavía no generaste el diseño de campo, así que solo se puede mostrar la dosis por parcela — para el total de todo el ensayo, generá primero el diseño.</p>' : ''}
      <p class="field-hint">El caudal de agua de cada aplicación se carga en "Tratamientos → Productos", junto con los productos.</p>
    </div>
    <div class="card">
      <h4>Calibración del aplicador (opcional)</h4>
      <p class="field-hint">Datos del equipo con el que se va a pulverizar el ensayo. El caudal y el volumen del tanque/botella se usan como valor por defecto en "Preparar en un recipiente" de cada aplicación (podés cambiarlos ahí puntualmente para probar otro tamaño); el tipo y la velocidad quedan como referencia del método usado, y en el futuro también van a servir para sugerir la presión/configuración del pulverizador.</p>
      <div class="field-row">
        <div class="field" style="max-width:220px">
          <label for="f-tipo-pulverizadora">Tipo de pulverizadora</label>
          <select id="f-tipo-pulverizadora">
            <option value="">Sin especificar</option>
            ${Object.entries(ETIQUETAS_PULVERIZADORA).map(([valor, etiqueta]) => `
              <option value="${valor}" ${ensayo.tipoPulverizadora === valor ? 'selected' : ''}>${etiqueta}</option>
            `).join('')}
          </select>
        </div>
        <div class="field" style="max-width:180px">
          <label for="f-velocidad-aplicador">Velocidad de aplicación (km/h)</label>
          <input id="f-velocidad-aplicador" type="number" step="any" min="0" value="${ensayo.velocidadAplicador ?? ''}" placeholder="ej. 5">
        </div>
      </div>
      <div class="field-row">
        <div class="field" style="max-width:220px">
          <label for="f-caudal-aplicador">Caudal del aplicador (L/ha)</label>
          <input id="f-caudal-aplicador" type="number" step="any" min="0" value="${ensayo.caudalAplicador ?? ''}" placeholder="ej. 100">
        </div>
        <div class="field" style="max-width:220px">
          <label for="f-volumen-tanque">Volumen del tanque / botella (L)</label>
          <input id="f-volumen-tanque" type="number" step="any" min="0" value="${ensayo.volumenTanque ?? ''}" placeholder="ej. 2">
        </div>
      </div>
    </div>
    <div id="lista-dosificacion"></div>
  `;

  const inTipoPulverizadora = main.querySelector('#f-tipo-pulverizadora');
  const inVelocidadAplicador = main.querySelector('#f-velocidad-aplicador');
  const inCaudalAplicador = main.querySelector('#f-caudal-aplicador');
  const inVolumenTanque = main.querySelector('#f-volumen-tanque');
  async function guardarCalibracion() {
    const cambios = {
      tipoPulverizadora: inTipoPulverizadora.value || null,
      velocidadAplicador: inVelocidadAplicador.value === '' ? null : Number(inVelocidadAplicador.value),
      caudalAplicador: inCaudalAplicador.value === '' ? null : Number(inCaudalAplicador.value),
      volumenTanque: inVolumenTanque.value === '' ? null : Number(inVolumenTanque.value)
    };
    await actualizarEnsayo(ensayo.id, cambios);
    Object.assign(ensayo, cambios);
    actualizarTodosLosRecipientes();
  }
  inTipoPulverizadora.addEventListener('change', guardarCalibracion);
  inVelocidadAplicador.addEventListener('change', guardarCalibracion);
  inCaudalAplicador.addEventListener('change', guardarCalibracion);
  inVolumenTanque.addEventListener('change', guardarCalibracion);

  const cont = main.querySelector('#lista-dosificacion');
  const actualizadoresRecipiente = [];
  function actualizarTodosLosRecipientes() {
    actualizadoresRecipiente.forEach(fn => fn());
  }

  conProductos.forEach(t => {
    const nParcelas = conteoPorTratamiento.get(t.id) || 0;
    const card = document.createElement('div');
    card.className = 'card';
    const titulo = document.createElement('h4');
    titulo.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${t.color};margin-right:6px"></span>${t.codigo} — ${t.nombre || 'Sin descripción'}`;
    card.appendChild(titulo);

    (t.aplicaciones || []).forEach((ap, apIdx) => {
      if ((ap.productos || []).length === 0) return;

      const aguaParcela = escalarPorHectarea(ap.caudalAgua, areaHa);
      const aguaTotal = aguaParcela != null && nParcelas > 0 ? aguaParcela * nParcelas : null;

      const apDiv = document.createElement('div');
      apDiv.className = 'section-title';
      apDiv.innerHTML = `
        <p><strong>${ap.tipo === 'secuencial' ? 'Aplicación secuencial' : 'Aplicación principal'}</strong>${ap.momento ? ' — ' + ap.momento : ''}</p>
        ${ap.caudalAgua
          ? `<p class="field-hint">Caudal de agua: ${ap.caudalAgua} L/ha → <strong>${aguaParcela.toFixed(2)} L</strong> por parcela${nParcelas > 0 ? ` · <strong>${aguaTotal.toFixed(2)} L</strong> en total (${nParcelas} parcela(s))` : ''}</p>`
          : '<p class="field-hint">No cargaste el caudal de agua de esta aplicación (opcional, pero hace falta para calcular cuánta agua preparar).</p>'}
      `;

      const tablaWrap = document.createElement('div');
      tablaWrap.className = 'table-wrap';
      const filas = ap.productos.map(p => {
        const porParcela = escalarPorHectarea(p.dosis, areaHa);
        const total = porParcela != null && nParcelas > 0 ? porParcela * nParcelas : null;
        const unidadBase = unidadSinPorHectarea(p.unidad);
        const ingredientesTexto = (p.ingredientes || []).length
          ? p.ingredientes.map(ing => {
              const iaPorHa = dosisIngredienteActivoPorHa(p.dosis, ing.concentracion);
              return `${ing.nombre}${ing.concentracion != null ? ` (${ing.concentracion}%)` : ''}${iaPorHa != null ? ` → ${iaPorHa.toFixed(3)} ${unidadBase} i.a./ha` : ''}`;
            }).join('<br>')
          : '<span class="field-hint">—</span>';
        return `
          <tr>
            <td>${p.nombre || '(sin nombre)'}</td>
            <td>${p.dosis !== '' && p.dosis != null ? p.dosis : '—'} ${p.dosis ? (p.unidad || '') : ''}</td>
            <td>${ingredientesTexto}</td>
            <td>${porParcela != null ? porParcela.toFixed(4) + ' ' + unidadBase : '—'}</td>
            <td>${total != null ? total.toFixed(4) + ' ' + unidadBase : (nParcelas === 0 && hayDiseno ? '0' : (hayDiseno ? '—' : 'sin diseño'))}</td>
          </tr>
        `;
      }).join('');
      tablaWrap.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Dosis (por ha)</th>
              <th>Ingrediente activo</th>
              <th>Por parcela</th>
              <th>Total ensayo${nParcelas > 0 ? ` (${nParcelas} parcelas)` : ''}</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      `;
      apDiv.appendChild(tablaWrap);

      // --- Preparar en un recipiente (botella, mochila, tanque) ---
      const idRecipiente = `recipiente-${t.id}-${apIdx}`;
      const recipienteDiv = document.createElement('div');
      recipienteDiv.className = 'card';
      recipienteDiv.style.background = 'var(--color-fondo-suave, #f5f7f2)';
      const caudalPorDefecto = ap.caudalAgua || ensayo.caudalAplicador || '';
      const volumenPorDefecto = ensayo.volumenTanque || '';
      recipienteDiv.innerHTML = `
        <p style="margin-top:0"><strong>Preparar en un recipiente</strong> <span class="field-hint">(botella, mochila o el tanque de tu aplicador)</span></p>
        <div class="field-row">
          <div class="field" style="max-width:180px">
            <label>Caudal de agua (L/ha)</label>
            <input class="in-recipiente-caudal" id="${idRecipiente}-caudal" type="number" step="any" min="0" value="${caudalPorDefecto}">
          </div>
          <div class="field" style="max-width:150px">
            <label>Volumen del recipiente</label>
            <input class="in-recipiente-volumen" id="${idRecipiente}-volumen" type="number" step="any" min="0" value="${volumenPorDefecto}" placeholder="litros">
          </div>
          <div class="btn-row" style="margin-bottom:8px;align-self:flex-end">
            <button type="button" class="btn btn-sm" data-vol="2">2 L</button>
            <button type="button" class="btn btn-sm" data-vol="3">3 L</button>
            <button type="button" class="btn btn-sm" data-vol="5">5 L</button>
          </div>
        </div>
        <div id="${idRecipiente}-resultado"></div>
      `;
      apDiv.appendChild(recipienteDiv);

      const inCaudalRecipiente = recipienteDiv.querySelector('.in-recipiente-caudal');
      const inVolumenRecipiente = recipienteDiv.querySelector('.in-recipiente-volumen');
      const resultadoDiv = recipienteDiv.querySelector(`#${idRecipiente}-resultado`);

      function actualizarResultadoRecipiente() {
        const caudal = inCaudalRecipiente.value;
        const volumen = inVolumenRecipiente.value;
        if (!caudal || !volumen) {
          resultadoDiv.innerHTML = '<p class="field-hint">Completá el caudal de agua y el volumen del recipiente.</p>';
          return;
        }
        const filasResultado = ap.productos.map(p => {
          const cantidad = calcularDosisPorRecipiente({ caudalAguaLHa: caudal, dosisProductoPorHa: p.dosis, volumenRecipienteL: volumen });
          const unidadBase = unidadSinPorHectarea(p.unidad) || '';
          if (cantidad == null) return `<li>${p.nombre || '(sin nombre)'}: <span class="field-hint">sin dosis cargada</span></li>`;
          return `<li>${p.nombre || '(sin nombre)'}: <strong>${cantidad.toFixed(3)} ${unidadBase}</strong></li>`;
        }).join('');
        resultadoDiv.innerHTML = `
          <p class="field-hint">En ${volumen} L de agua (con este caudal, equivalen a ${(Number(volumen) / Number(caudal)).toFixed(5)} ha):</p>
          <ul style="margin:4px 0 0">${filasResultado}</ul>
        `;
      }
      inCaudalRecipiente.addEventListener('input', actualizarResultadoRecipiente);
      inVolumenRecipiente.addEventListener('input', actualizarResultadoRecipiente);
      recipienteDiv.querySelectorAll('[data-vol]').forEach(btn => {
        btn.addEventListener('click', () => {
          inVolumenRecipiente.value = btn.dataset.vol;
          actualizarResultadoRecipiente();
        });
      });
      actualizadoresRecipiente.push(() => {
        if (!inCaudalRecipiente.value) inCaudalRecipiente.value = ap.caudalAgua || ensayo.caudalAplicador || '';
        if (!inVolumenRecipiente.value) inVolumenRecipiente.value = ensayo.volumenTanque || '';
        actualizarResultadoRecipiente();
      });
      actualizarResultadoRecipiente();

      card.appendChild(apDiv);
    });

    cont.appendChild(card);
  });
}
