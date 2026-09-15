import { dbGetAllByIndex, dbPut, dbPutMany, dbDeleteMany, dbGet } from './db.js';
import { nuevoId } from '../utils/idGen.js';

export async function obtenerDiseno(ensayoId) {
  const [bloques, celdas] = await Promise.all([
    dbGetAllByIndex('bloques', 'by_ensayoId', ensayoId),
    dbGetAllByIndex('celdas', 'by_ensayoId', ensayoId)
  ]);
  bloques.sort((a, b) => a.indice - b.indice);
  const celdasPorBloque = new Map();
  for (const c of celdas) {
    if (!celdasPorBloque.has(c.bloqueId)) celdasPorBloque.set(c.bloqueId, []);
    celdasPorBloque.get(c.bloqueId).push(c);
  }
  for (const arr of celdasPorBloque.values()) {
    arr.sort((a, b) => a.posicion - b.posicion);
  }
  return { bloques, celdasPorBloque };
}

export function tieneDiseno(bloques) {
  return Array.isArray(bloques) && bloques.length > 0;
}

// Etiqueta legible de un bloque/fila para mostrar en las distintas vistas.
export function etiquetaBloque(bloque) {
  if (!bloque) return '(desconocido)';
  if (bloque.etiqueta) return bloque.etiqueta;
  if (bloque.franjaA) return `Bloque ${bloque.replica} — Franja ${bloque.franjaA}`;
  return `Bloque ${bloque.indice + 1}`;
}

/**
 * Persiste un diseño completo (filas de tratamientoIds) reemplazando
 * cualquier bloque/celda previo del ensayo. Las fotos/notas/resultados
 * que referenciaban celdas viejas quedan "huérfanas" (conservan su copia
 * de tratamiento/observación pero pierden el link a una celda vigente);
 * el llamador es responsable de advertir al usuario antes de invocar esto.
 *
 * @param {string[][]} filas
 * @param {{etiqueta?:string, replica?:number, franjaA?:string}[]} [metaFilas]
 *   metadata opcional por fila (una entrada por cada fila de `filas`), usada
 *   para diseños que no son un simple "Bloque N" (p.ej. franjas cruzadas).
 */
export async function guardarDiseno(ensayoId, filas, metaFilas = null) {
  const previo = await obtenerDiseno(ensayoId);
  const idsBloquesViejos = previo.bloques.map(b => b.id);
  const idsCeldasViejas = [];
  for (const arr of previo.celdasPorBloque.values()) {
    for (const c of arr) idsCeldasViejas.push(c.id);
  }

  const nuevosBloques = [];
  const nuevasCeldas = [];

  filas.forEach((fila, indice) => {
    const meta = metaFilas ? metaFilas[indice] : null;
    const bloque = { id: nuevoId(), ensayoId, indice, ...(meta || {}) };
    nuevosBloques.push(bloque);
    fila.forEach((tratamientoId, posicion) => {
      nuevasCeldas.push({
        id: nuevoId(),
        ensayoId,
        bloqueId: bloque.id,
        bloqueIndice: indice,
        posicion,
        tratamientoId,
        editadaManualmente: false,
        observacionRapida: null
      });
    });
  });

  await dbDeleteMany('celdas', idsCeldasViejas);
  await dbDeleteMany('bloques', idsBloquesViejos);
  await dbPutMany('bloques', nuevosBloques);
  await dbPutMany('celdas', nuevasCeldas);

  return { bloques: nuevosBloques, celdas: nuevasCeldas };
}

export async function actualizarCeldaTratamiento(celdaId, tratamientoId, editadaManualmente) {
  const celda = await dbGet('celdas', celdaId);
  if (!celda) throw new Error('Celda no encontrada');
  const actualizada = { ...celda, tratamientoId, editadaManualmente };
  await dbPut('celdas', actualizada);
  return actualizada;
}

export async function guardarObservacionCelda(celdaId, observacionRapida) {
  const celda = await dbGet('celdas', celdaId);
  if (!celda) throw new Error('Celda no encontrada');
  const actualizada = { ...celda, observacionRapida };
  await dbPut('celdas', actualizada);
  return actualizada;
}

export async function reconstruirFilasDeIds(ensayoId) {
  const { bloques, celdasPorBloque } = await obtenerDiseno(ensayoId);
  return bloques.map(b => (celdasPorBloque.get(b.id) || []).map(c => c.tratamientoId));
}

export async function hayDatosAsociados(ensayoId) {
  const [imagenes, notas, resultados] = await Promise.all([
    dbGetAllByIndex('imagenes', 'by_ensayoId', ensayoId),
    dbGetAllByIndex('notas', 'by_ensayoId', ensayoId),
    dbGetAllByIndex('resultados', 'by_ensayoId', ensayoId)
  ]);
  const conCelda = [...imagenes, ...notas, ...resultados].some(x => x.celdaId || x.bloqueId);
  return conCelda;
}
