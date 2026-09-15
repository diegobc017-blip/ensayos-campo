import { listarTratamientos } from '../db/tratamientosRepo.js';
import { obtenerDiseno, tieneDiseno } from '../db/layoutRepo.js';
import { areaParcelaHa, escalarPorHectarea, unidadSinPorHectarea, contarParcelasPorTratamiento } from '../domain/dosificacion.js';

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
    <div id="lista-dosificacion"></div>
  `;

  const cont = main.querySelector('#lista-dosificacion');

  conProductos.forEach(t => {
    const nParcelas = conteoPorTratamiento.get(t.id) || 0;
    const card = document.createElement('div');
    card.className = 'card';
    const titulo = document.createElement('h4');
    titulo.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${t.color};margin-right:6px"></span>${t.codigo} — ${t.nombre || 'Sin descripción'}`;
    card.appendChild(titulo);

    (t.aplicaciones || []).forEach(ap => {
      if ((ap.productos || []).length === 0) return;

      const aguaParcela = escalarPorHectarea(ap.caudalAgua, areaHa);
      const aguaTotal = aguaParcela != null && nParcelas > 0 ? aguaParcela * nParcelas : null;

      const apDiv = document.createElement('div');
      apDiv.className = 'section-title';
      apDiv.innerHTML = `
        <p><strong>${ap.tipo === 'secuencial' ? 'Aplicación secuencial' : 'Aplicación principal'}</strong>${ap.momento ? ' — ' + ap.momento : ''}</p>
        ${ap.caudalAgua
          ? `<p class="field-hint">Caudal de agua: ${ap.caudalAgua} L/ha → <strong>${aguaParcela.toFixed(2)} L</strong> por parcela${nParcelas > 0 ? ` · <strong>${aguaTotal.toFixed(2)} L</strong> en total (${nParcelas} parcela(s))` : ''}</p>`
          : '<p class="field-hint">No cargaste el caudal de agua de esta aplicación (opcional).</p>'}
      `;

      const tablaWrap = document.createElement('div');
      tablaWrap.className = 'table-wrap';
      const filas = ap.productos.map(p => {
        const porParcela = escalarPorHectarea(p.dosis, areaHa);
        const total = porParcela != null && nParcelas > 0 ? porParcela * nParcelas : null;
        const unidadBase = unidadSinPorHectarea(p.unidad);
        return `
          <tr>
            <td>${p.nombre || '(sin nombre)'}</td>
            <td>${p.dosis !== '' && p.dosis != null ? p.dosis : '—'} ${p.dosis ? (p.unidad || '') : ''}</td>
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
              <th>Por parcela</th>
              <th>Total ensayo${nParcelas > 0 ? ` (${nParcelas} parcelas)` : ''}</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      `;
      apDiv.appendChild(tablaWrap);
      card.appendChild(apDiv);
    });

    cont.appendChild(card);
  });
}
