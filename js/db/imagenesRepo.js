import { dbGetAllByIndex, dbPut, dbDelete, dbGetAll } from './db.js';
import { nuevoId, ahoraISO } from '../utils/idGen.js';

export async function listarImagenes(ensayoId, filtro = {}) {
  let items = await dbGetAllByIndex('imagenes', 'by_ensayoId', ensayoId);
  if (filtro.bloqueId) items = items.filter(i => i.bloqueId === filtro.bloqueId);
  if (filtro.celdaId) items = items.filter(i => i.celdaId === filtro.celdaId);
  return items.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

export async function agregarImagen({ ensayoId, bloqueId, celdaId, etapa, blob, thumbnailBlob, nombreArchivo, nota }) {
  const imagen = {
    id: nuevoId(),
    ensayoId,
    bloqueId: bloqueId || null,
    celdaId: celdaId || null,
    etapa: etapa || 'seguimiento',
    blob,
    thumbnailBlob,
    nombreArchivo: nombreArchivo || 'foto.jpg',
    nota: nota || null,
    fecha: ahoraISO(),
    tamanioBytes: blob ? blob.size : 0
  };
  await dbPut('imagenes', imagen);
  return imagen;
}

export async function eliminarImagen(id) {
  await dbDelete('imagenes', id);
}

export async function espacioUsadoImagenes() {
  const todas = await dbGetAll('imagenes');
  return todas.reduce((acc, i) => acc + (i.tamanioBytes || 0), 0);
}
