import { dbGetAllByIndex, dbPut, dbDelete } from './db.js';
import { nuevoId, ahoraISO } from '../utils/idGen.js';

export async function listarNotas(ensayoId, filtro = {}) {
  let items = await dbGetAllByIndex('notas', 'by_ensayoId', ensayoId);
  if (filtro.bloqueId) items = items.filter(n => n.bloqueId === filtro.bloqueId);
  if (filtro.celdaId) items = items.filter(n => n.celdaId === filtro.celdaId);
  return items.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

export async function agregarNota({ ensayoId, bloqueId, celdaId, texto }) {
  const nota = {
    id: nuevoId(),
    ensayoId,
    bloqueId: bloqueId || null,
    celdaId: celdaId || null,
    texto: texto || '',
    fecha: ahoraISO()
  };
  await dbPut('notas', nota);
  return nota;
}

export async function eliminarNota(id) {
  await dbDelete('notas', id);
}
