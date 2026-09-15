import { listarVariables, listarResultados } from '../db/resultadosRepo.js';
import { listarTratamientos } from '../db/tratamientosRepo.js';
import { obtenerDiseno, tieneDiseno } from '../db/layoutRepo.js';
import { calcularInforme } from '../domain/reportes.js';
import { descargarCSV } from '../utils/csvExport.js';
import { ETIQUETAS_DISENO } from '../db/ensayosRepo.js';

function fmt(n) {
  return n == null ? '' : Math.round(n * 100) / 100;
}

function textoAplicaciones(t) {
  const aplicaciones = t.aplicaciones || [];
  if (aplicaciones.length === 0) return '(sin productos cargados)';
  return aplicaciones.map(a => {
    const productos = (a.productos || [])
      .filter(p => p.nombre)
      .map(p => `${p.nombre}${p.dosis ? ' ' + p.dosis : ''}${p.unidad ? ' ' + p.unidad : ''}`)
      .join(' + ');
    const tipo = a.tipo === 'secuencial' ? 'Secuencial' : 'Principal';
    return `${tipo}${a.momento ? ' (' + a.momento + ')' : ''}: ${productos || '(sin productos)'}`;
  }).join(' · ');
}

export async function render(main, ensayo) {
  const [variables, tratamientos, resultados, { bloques }] = await Promise.all([
    listarVariables(ensayo.id),
    listarTratamientos(ensayo.id),
    listarResultados(ensayo.id),
    obtenerDiseno(ensayo.id)
  ]);

  if (!tieneDiseno(bloques)) {
    main.innerHTML = `<div class="empty-state"><h3>Todavía no hay diseño ni resultados</h3></div>`;
    return;
  }

  if (resultados.length === 0) {
    main.innerHTML = `
      <div class="empty-state">
        <h3>Todavía no hay mediciones cargadas</h3>
        <p>Cargalas desde la pestaña "Resultados" para poder ver el informe.</p>
      </div>
    `;
    return;
  }

  const informe = calcularInforme(resultados, variables, tratamientos, bloques);

  main.innerHTML = `
    <div class="btn-row no-print">
      <button class="btn btn-primary" id="btn-pdf">Exportar / Imprimir PDF</button>
      <button class="btn" id="btn-csv-tratamiento">CSV por tratamiento</button>
      <button class="btn" id="btn-csv-crudo">CSV datos crudos</button>
      <button class="btn" id="btn-csv-productos">CSV productos</button>
    </div>

    <div class="card">
      <h3>Ensayo: ${ensayo.nombre}</h3>
      <p class="card-sub">${ensayo.cultivo || ''} · ${ensayo.ubicacion || ''} · Diseño: ${ETIQUETAS_DISENO[ensayo.tipoDiseno] || 'BCA'} · Generado: ${new Date().toLocaleString()}</p>
    </div>

    <div class="card">
      <h3>Tratamientos y productos</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Tratamiento</th><th>Aplicaciones / productos</th></tr></thead>
          <tbody>
            ${tratamientos.filter(t => t.factor !== 'combo').map(t => `
              <tr>
                <td>${t.factor === 'A' ? 'Factor A · ' : t.factor === 'B' ? 'Factor B · ' : ''}${t.codigo} — ${t.nombre}</td>
                <td>${textoAplicaciones(t)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>Resumen por tratamiento</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Tratamiento</th><th>Variable</th><th>N</th><th>Promedio</th><th>Mín</th><th>Máx</th></tr></thead>
          <tbody>
            ${informe.porTratamiento.map(r => `
              <tr>
                <td>${r.tratamientoCodigo} — ${r.tratamientoNombre}</td>
                <td>${r.variableNombre}${r.unidad ? ' (' + r.unidad + ')' : ''}</td>
                <td>${r.n}</td>
                <td>${fmt(r.promedio)}</td>
                <td>${fmt(r.min)}</td>
                <td>${fmt(r.max)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>Resumen por bloque</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Bloque</th><th>Variable</th><th>N</th><th>Promedio</th><th>Mín</th><th>Máx</th></tr></thead>
          <tbody>
            ${informe.porBloque.map(r => `
              <tr>
                <td>${r.bloqueEtiqueta}</td>
                <td>${r.variableNombre}${r.unidad ? ' (' + r.unidad + ')' : ''}</td>
                <td>${r.n}</td>
                <td>${fmt(r.promedio)}</td>
                <td>${fmt(r.min)}</td>
                <td>${fmt(r.max)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>Avance por cuadrilla</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Cuadrilla</th><th>Mediciones cargadas</th><th>Parcelas atendidas</th><th>Última fecha</th></tr></thead>
          <tbody>
            ${informe.porCuadrilla.map(r => `
              <tr>
                <td>${r.cuadrilla || '(sin dato)'}</td>
                <td>${r.mediciones}</td>
                <td>${r.parcelasAtendidas}</td>
                <td>${r.ultimaFecha ? new Date(r.ultimaFecha).toLocaleDateString() : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  main.querySelector('#btn-pdf').addEventListener('click', () => window.print());

  main.querySelector('#btn-csv-productos').addEventListener('click', () => {
    const filas = [];
    tratamientos.filter(t => t.factor !== 'combo').forEach(t => {
      const aplicaciones = t.aplicaciones || [];
      if (aplicaciones.length === 0) {
        filas.push([t.codigo, t.nombre, t.factor || '', '', '', '', '', '']);
        return;
      }
      aplicaciones.forEach(a => {
        const productos = a.productos && a.productos.length > 0 ? a.productos : [{}];
        productos.forEach(p => {
          filas.push([t.codigo, t.nombre, t.factor || '', a.tipo, a.momento || '', p.nombre || '', p.dosis ?? '', p.unidad || '']);
        });
      });
    });
    descargarCSV(
      `productos-${ensayo.nombre}.csv`,
      ['Tratamiento', 'Nombre', 'Factor', 'Tipo aplicacion', 'Momento', 'Producto', 'Dosis', 'Unidad'],
      filas
    );
  });

  main.querySelector('#btn-csv-tratamiento').addEventListener('click', () => {
    descargarCSV(
      `informe-tratamiento-${ensayo.nombre}.csv`,
      ['Tratamiento', 'Codigo', 'Variable', 'Unidad', 'N', 'Promedio', 'Min', 'Max'],
      informe.porTratamiento.map(r => [r.tratamientoNombre, r.tratamientoCodigo, r.variableNombre, r.unidad, r.n, fmt(r.promedio), fmt(r.min), fmt(r.max)])
    );
  });

  main.querySelector('#btn-csv-crudo').addEventListener('click', () => {
    const tratPorId = new Map(tratamientos.map(t => [t.id, t]));
    const varPorId = new Map(variables.map(v => [v.id, v]));
    descargarCSV(
      `datos-crudos-${ensayo.nombre}.csv`,
      ['Tratamiento', 'Variable', 'Valor', 'Unidad', 'Cuadrilla', 'Fecha', 'Observacion'],
      resultados.map(r => {
        const t = tratPorId.get(r.tratamientoId);
        const v = varPorId.get(r.variableId);
        return [
          t ? `${t.codigo} - ${t.nombre}` : '',
          v ? v.nombre : '',
          r.valor,
          v ? v.unidad : '',
          r.cuadrilla,
          r.fecha ? new Date(r.fecha).toLocaleDateString() : '',
          r.observacion || ''
        ];
      })
    );
  });
}
