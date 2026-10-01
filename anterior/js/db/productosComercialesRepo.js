// "Maletín" de productos comerciales aprendidos: cuando alguien carga a
// mano que, por ejemplo, "Jinete" es la mezcla de Fluroxipir 11.53% +
// Triclopir 34%, esa asociación queda guardada acá para que la próxima vez
// que se escriba, dicte o lea de una foto/planilla el nombre "Jinete", la
// app ya sepa qué ingredientes activos lleva (y en qué concentración) sin
// tener que volver a explicarlo. No pertenece a un ensayo en particular:
// se comparte entre todos los ensayos, como un diccionario propio.

import { dbGetAll, dbPut, dbDelete, dbGetByIndex, dbGet } from './db.js';
import { nuevoId, ahoraISO } from '../utils/idGen.js';
import { normalizarNombreProducto } from '../utils/textMatch.js';

export async function listarProductosComerciales() {
  const items = await dbGetAll('productosComerciales');
  return items.sort((a, b) => (a.nombreComercial || '').localeCompare(b.nombreComercial || ''));
}

export async function buscarProductoComercialPorNombre(nombre) {
  const normalizado = normalizarNombreProducto(nombre);
  if (!normalizado) return null;
  return (await dbGetByIndex('productosComerciales', 'by_nombreNormalizado', normalizado)) || null;
}

/**
 * Guarda (o actualiza) un producto comercial aprendido.
 * @param {string} nombreComercial - ej. "Jinete"
 * @param {{nombre:string, concentracion:number|null}[]} ingredientes - ej.
 *   [{nombre:'Fluroxypyr', concentracion:11.53}, {nombre:'Triclopyr', concentracion:34}]
 */
export async function aprenderProductoComercial(nombreComercial, ingredientes) {
  const nombreNormalizado = normalizarNombreProducto(nombreComercial);
  if (!nombreNormalizado) throw new Error('El producto necesita un nombre');
  const existente = await buscarProductoComercialPorNombre(nombreComercial);
  const ahora = ahoraISO();
  const registro = {
    id: existente ? existente.id : nuevoId(),
    nombreComercial: nombreComercial.trim(),
    nombreNormalizado,
    ingredientes: (ingredientes || []).filter(i => (i.nombre || '').trim()).map(i => ({
      nombre: i.nombre.trim(),
      concentracion: i.concentracion === '' || i.concentracion == null ? null : Number(i.concentracion)
    })),
    creadoEn: existente ? existente.creadoEn : ahora,
    actualizadoEn: ahora
  };
  await dbPut('productosComerciales', registro);
  return registro;
}

export async function eliminarProductoComercial(id) {
  await dbDelete('productosComerciales', id);
}

export async function obtenerProductoComercial(id) {
  return dbGet('productosComerciales', id);
}
