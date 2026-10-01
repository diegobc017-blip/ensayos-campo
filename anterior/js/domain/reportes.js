// Agregación de resultados para el informe. Puro: recibe arrays ya
// cargados desde la DB y devuelve estructuras listas para pintar en tablas
// o exportar a CSV. No persiste nada.

function etiquetaBloque(bloque) {
  if (!bloque) return '(desconocido)';
  if (bloque.etiqueta) return bloque.etiqueta;
  if (bloque.franjaA) return `Bloque ${bloque.replica} — Franja ${bloque.franjaA}`;
  return `Bloque ${bloque.indice + 1}`;
}

function estadisticas(valores) {
  if (valores.length === 0) return { n: 0, promedio: null, min: null, max: null };
  const n = valores.length;
  const suma = valores.reduce((a, b) => a + b, 0);
  return {
    n,
    promedio: suma / n,
    min: Math.min(...valores),
    max: Math.max(...valores)
  };
}

function agruparPor(resultados, campo) {
  const grupos = new Map();
  for (const r of resultados) {
    const clave = r[campo] || '(sin dato)';
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(r);
  }
  return grupos;
}

/**
 * @param {Array} resultados - registros del store `resultados` para un ensayo.
 * @param {Array} variables - registros de `variablesResultado` del ensayo.
 * @param {Array} tratamientos - registros de `tratamientos` del ensayo.
 * @param {Array} bloques - registros de `bloques` del ensayo.
 */
export function calcularInforme(resultados, variables, tratamientos, bloques) {
  const tratamientosPorId = new Map(tratamientos.map(t => [t.id, t]));
  const bloquesPorId = new Map(bloques.map(b => [b.id, b]));

  const porTratamiento = [];
  for (const variable of variables) {
    const deVariable = resultados.filter(r => r.variableId === variable.id);
    const grupos = agruparPor(deVariable, 'tratamientoId');
    for (const [tratamientoId, regs] of grupos) {
      const trat = tratamientosPorId.get(tratamientoId);
      const stats = estadisticas(regs.map(r => r.valor));
      porTratamiento.push({
        variableId: variable.id,
        variableNombre: variable.nombre,
        unidad: variable.unidad,
        tratamientoId,
        tratamientoCodigo: trat ? trat.codigo : '(desconocido)',
        tratamientoNombre: trat ? trat.nombre : '',
        ...stats
      });
    }
  }

  const porBloque = [];
  for (const variable of variables) {
    const deVariable = resultados.filter(r => r.variableId === variable.id);
    const grupos = agruparPor(deVariable, 'bloqueId');
    for (const [bloqueId, regs] of grupos) {
      const bloque = bloquesPorId.get(bloqueId);
      const stats = estadisticas(regs.map(r => r.valor));
      porBloque.push({
        variableId: variable.id,
        variableNombre: variable.nombre,
        unidad: variable.unidad,
        bloqueId,
        bloqueEtiqueta: etiquetaBloque(bloque),
        ...stats
      });
    }
  }

  const gruposCuadrilla = agruparPor(resultados, 'cuadrilla');
  const porCuadrilla = [];
  for (const [cuadrilla, regs] of gruposCuadrilla) {
    const parcelas = new Set(regs.map(r => r.celdaId));
    porCuadrilla.push({
      cuadrilla,
      mediciones: regs.length,
      parcelasAtendidas: parcelas.size,
      ultimaFecha: regs.reduce((max, r) => (r.fecha > max ? r.fecha : max), '')
    });
  }
  porCuadrilla.sort((a, b) => b.mediciones - a.mediciones);

  return { porTratamiento, porBloque, porCuadrilla };
}
