// Cálculo de dosificación: a partir de la dosis de un producto (cargada
// "por hectárea", como viene en las etiquetas/recomendaciones agronómicas)
// y el tamaño real de la parcela del ensayo, calcula cuánto producto (y
// cuánta agua, según el caudal de aplicación) corresponde por parcela y
// para todo el ensayo. Módulo puro: no toca DOM ni DB.

/** Área de una parcela en hectáreas, o null si el ensayo no tiene dimensiones cargadas. */
export function areaParcelaHa(ensayo) {
  const dim = ensayo?.dimensionParcela;
  const ancho = Number(dim?.ancho);
  const largo = Number(dim?.largo);
  if (!ancho || !largo) return null;
  const factorAMetros = dim.unidad === 'cm' ? 0.01 : 1;
  const areaM2 = (ancho * factorAMetros) * (largo * factorAMetros);
  return areaM2 / 10000;
}

/**
 * Escala una cantidad "por hectárea" (dosis de producto o caudal de agua) al
 * área real de la parcela. Devuelve null si falta algún dato.
 */
export function escalarPorHectarea(cantidadPorHa, areaHa) {
  if (cantidadPorHa === null || cantidadPorHa === undefined || cantidadPorHa === '') return null;
  if (areaHa === null || areaHa === undefined) return null;
  const n = Number(cantidadPorHa);
  if (Number.isNaN(n)) return null;
  return n * areaHa;
}

/** Quita el sufijo "/ha" de una unidad (ej. "L/ha" -> "L") para mostrar cantidades totales. */
export function unidadSinPorHectarea(unidad) {
  return (unidad || '').replace(/\s*\/\s*ha\s*$/i, '').trim() || (unidad || '');
}

/**
 * Cuenta, para cada tratamiento (incluyendo niveles de Factor A/B en un
 * diseño de franjas cruzadas), en cuántas parcelas del diseño actual se
 * aplica. En franjas, cada celda es una combinación A×B, así que cuenta
 * para ambos niveles involucrados.
 *
 * @param {{tipoDiseno:string}} ensayo
 * @param {{id:string, factor?:string, factorAId?:string, factorBId?:string}[]} tratamientos
 * @param {{tratamientoId:string}[]} celdas - todas las celdas del diseño (aplanadas)
 * @returns {Map<string, number>}
 */
export function contarParcelasPorTratamiento(ensayo, tratamientos, celdas) {
  const conteo = new Map();
  if (ensayo?.tipoDiseno === 'FRANJA') {
    const combosPorId = new Map(tratamientos.filter(t => t.factor === 'combo').map(t => [t.id, t]));
    for (const c of celdas) {
      const combo = combosPorId.get(c.tratamientoId);
      if (!combo) continue;
      conteo.set(combo.factorAId, (conteo.get(combo.factorAId) || 0) + 1);
      conteo.set(combo.factorBId, (conteo.get(combo.factorBId) || 0) + 1);
    }
  } else {
    for (const c of celdas) {
      conteo.set(c.tratamientoId, (conteo.get(c.tratamientoId) || 0) + 1);
    }
  }
  return conteo;
}

// ---------------------------------------------------------------------
// Ingrediente activo puro y preparación en un recipiente (botella,
// mochila o el tanque del aplicador) — para saber cuánto producto
// "comercial" corresponde poner en un volumen de agua puntual, además de
// la dosis total del ensayo.
// ---------------------------------------------------------------------

/**
 * Cantidad de ingrediente activo puro aplicada por hectárea, a partir de
 * la dosis del producto comercial (por ha) y su % de concentración. Ej.:
 * 2500 cc/ha de un producto al 60,2% de glifosato -> ~1505 cc/ha de
 * glifosato puro (mismo criterio que usan las recomendaciones agronómicas
 * para pasar de dosis de producto comercial a dosis de i.a.).
 */
export function dosisIngredienteActivoPorHa(dosisProductoPorHa, concentracionPct) {
  if (dosisProductoPorHa === '' || dosisProductoPorHa == null) return null;
  if (concentracionPct === '' || concentracionPct == null) return null;
  const dosis = Number(dosisProductoPorHa);
  const conc = Number(concentracionPct);
  if (Number.isNaN(dosis) || Number.isNaN(conc)) return null;
  return dosis * (conc / 100);
}

/**
 * Cuánto producto hay que cargar en un recipiente (botella, mochila,
 * tanque) de agua de `volumenRecipienteL` litros, a partir del caudal de
 * agua por hectárea (L/ha) de esa aplicación y la dosis del producto por
 * hectárea. El recipiente representa una fracción de hectárea —
 * volumenRecipienteL / caudalAguaLHa— y esa misma fracción de la dosis por
 * hectárea es la que corresponde poner adentro.
 *
 * @returns {number|null} cantidad de producto (misma unidad que
 *   `dosisProductoPorHa`) para ese recipiente, o null si falta algún dato.
 */
export function calcularDosisPorRecipiente({ caudalAguaLHa, dosisProductoPorHa, volumenRecipienteL }) {
  const caudal = Number(caudalAguaLHa);
  const dosis = Number(dosisProductoPorHa);
  const volumen = Number(volumenRecipienteL);
  if (!caudal || Number.isNaN(dosis) || !volumen) return null;
  const fraccionHa = volumen / caudal;
  return dosis * fraccionHa;
}
