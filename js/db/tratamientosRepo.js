import { dbGetAllByIndex, dbPut, dbPutMany, dbDelete, dbDeleteMany, dbGet } from './db.js';
import { nuevoId } from '../utils/idGen.js';

const COLORES = [
  '#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#e91e63',
  '#00bcd4', '#8bc34a', '#ffc107', '#795548', '#607d8b',
  '#f44336', '#3f51b5', '#009688', '#cddc39', '#ff5722'
];

export function colorPorOrden(orden) {
  return COLORES[orden % COLORES.length];
}

export async function listarTratamientos(ensayoId) {
  const items = await dbGetAllByIndex('tratamientos', 'by_ensayoId', ensayoId);
  return items.sort((a, b) => a.orden - b.orden);
}

// Tratamientos "reales" (excluye las combinaciones auto-generadas para
// diseños de franjas cruzadas, que no son tratamientos cargados a mano).
export async function listarTratamientosBase(ensayoId, factor = null) {
  const items = await listarTratamientos(ensayoId);
  return items.filter(t => (factor ? t.factor === factor : t.factor !== 'combo'));
}

export async function obtenerTratamiento(id) {
  return dbGet('tratamientos', id);
}

export async function agregarTratamiento(ensayoId, { codigo, nombre, factor = null }) {
  const existentes = factor
    ? (await listarTratamientos(ensayoId)).filter(t => t.factor === factor)
    : await listarTratamientosBase(ensayoId);
  const orden = existentes.length;
  const tratamiento = {
    id: nuevoId(),
    ensayoId,
    codigo: codigo || `T${orden + 1}`,
    nombre: nombre || '',
    orden,
    color: colorPorOrden(orden),
    factor: factor || null,
    aplicaciones: []
  };
  await dbPut('tratamientos', tratamiento);
  return tratamiento;
}

export async function actualizarTratamiento(id, cambios) {
  const actual = await dbGet('tratamientos', id);
  if (!actual) throw new Error('Tratamiento no encontrado');
  const actualizado = { ...actual, ...cambios, id: actual.id, ensayoId: actual.ensayoId };
  await dbPut('tratamientos', actualizado);
  return actualizado;
}

export async function eliminarTratamiento(id) {
  await dbDelete('tratamientos', id);
}

export async function reordenarTratamientos(ensayoId, idsEnOrden) {
  const items = await listarTratamientos(ensayoId);
  const porId = new Map(items.map(t => [t.id, t]));
  for (let i = 0; i < idsEnOrden.length; i++) {
    const t = porId.get(idsEnOrden[i]);
    if (t) {
      t.orden = i;
      t.color = colorPorOrden(i);
      await dbPut('tratamientos', t);
    }
  }
}

/**
 * Diseño de franjas cruzadas: los "tratamientos" reales son los niveles del
 * Factor A (franjas horizontales) y Factor B (franjas verticales), cargados
 * por separado. Esta función (re)genera las combinaciones A×B, que son las
 * que efectivamente se asignan a las parcelas del mapa de campo. Es un
 * upsert: si una combinación ya existía (mismo par A/B) conserva su id y sus
 * productos/aplicaciones, para no romper un diseño ya generado.
 */
export async function regenerarCombinaciones(ensayoId) {
  const todos = await listarTratamientos(ensayoId);
  const factorA = todos.filter(t => t.factor === 'A');
  const factorB = todos.filter(t => t.factor === 'B');
  const combosExistentes = todos.filter(t => t.factor === 'combo');
  const existentesPorClave = new Map(combosExistentes.map(c => [`${c.factorAId}|${c.factorBId}`, c]));

  const clavesValidas = new Set();
  const resultado = [];
  let i = 0;
  for (const a of factorA) {
    for (const b of factorB) {
      const clave = `${a.id}|${b.id}`;
      clavesValidas.add(clave);
      const existente = existentesPorClave.get(clave);
      resultado.push({
        id: existente ? existente.id : nuevoId(),
        ensayoId,
        codigo: `${a.codigo}×${b.codigo}`,
        nombre: `${a.nombre || a.codigo} × ${b.nombre || b.codigo}`,
        orden: i,
        color: colorPorOrden(i),
        factor: 'combo',
        factorAId: a.id,
        factorBId: b.id,
        aplicaciones: existente ? (existente.aplicaciones || []) : []
      });
      i++;
    }
  }

  const idsABorrar = combosExistentes
    .filter(c => !clavesValidas.has(`${c.factorAId}|${c.factorBId}`))
    .map(c => c.id);

  if (resultado.length > 0) await dbPutMany('tratamientos', resultado);
  if (idsABorrar.length > 0) await dbDeleteMany('tratamientos', idsABorrar);
  return resultado;
}
