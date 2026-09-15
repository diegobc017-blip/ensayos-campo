import { dbGetAllByIndex, dbPut, dbDelete } from './db.js';
import { nuevoId, ahoraISO } from '../utils/idGen.js';

export async function listarVariables(ensayoId) {
  const items = await dbGetAllByIndex('variablesResultado', 'by_ensayoId', ensayoId);
  return items.sort((a, b) => a.orden - b.orden);
}

export async function agregarVariable(ensayoId, { nombre, unidad }) {
  const existentes = await listarVariables(ensayoId);
  const variable = {
    id: nuevoId(),
    ensayoId,
    nombre: nombre || 'Variable',
    unidad: unidad || '',
    orden: existentes.length
  };
  await dbPut('variablesResultado', variable);
  return variable;
}

export async function eliminarVariable(id) {
  await dbDelete('variablesResultado', id);
}

export async function listarResultados(ensayoId, filtro = {}) {
  let items = await dbGetAllByIndex('resultados', 'by_ensayoId', ensayoId);
  if (filtro.celdaId) items = items.filter(r => r.celdaId === filtro.celdaId);
  if (filtro.variableId) items = items.filter(r => r.variableId === filtro.variableId);
  return items.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

export async function agregarResultado({ ensayoId, bloqueId, celdaId, tratamientoId, variableId, valor, cuadrilla, fecha, observacion }) {
  const resultado = {
    id: nuevoId(),
    ensayoId,
    bloqueId: bloqueId || null,
    celdaId,
    tratamientoId: tratamientoId || null,
    variableId,
    valor: Number(valor),
    cuadrilla: cuadrilla || '',
    fecha: fecha || ahoraISO(),
    observacion: observacion || null
  };
  await dbPut('resultados', resultado);
  return resultado;
}

export async function eliminarResultado(id) {
  await dbDelete('resultados', id);
}
