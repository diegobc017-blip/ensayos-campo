import { dbGetAll, dbPutMany, dbClear, ALL_STORES } from '../db/db.js';

const FORMATO_VERSION = 1;
const STORES_CON_BLOBS = new Set(['imagenes']);
const CAMPOS_BLOB = ['blob', 'thumbnailBlob'];

function blobADataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function dataURLABlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function serializarRegistro(storeName, registro) {
  if (!STORES_CON_BLOBS.has(storeName)) return registro;
  const copia = { ...registro };
  for (const campo of CAMPOS_BLOB) {
    if (copia[campo] instanceof Blob) {
      copia[campo] = { __blob__: true, dataUrl: await blobADataURL(copia[campo]) };
    }
  }
  return copia;
}

async function deserializarRegistro(storeName, registro) {
  if (!STORES_CON_BLOBS.has(storeName)) return registro;
  const copia = { ...registro };
  for (const campo of CAMPOS_BLOB) {
    if (copia[campo] && copia[campo].__blob__) {
      copia[campo] = await dataURLABlob(copia[campo].dataUrl);
    }
  }
  return copia;
}

export async function exportarRespaldo() {
  const data = {};
  for (const storeName of ALL_STORES) {
    const registros = await dbGetAll(storeName);
    data[storeName] = await Promise.all(registros.map(r => serializarRegistro(storeName, r)));
  }
  return {
    formatoVersion: FORMATO_VERSION,
    generadoEn: new Date().toISOString(),
    data
  };
}

export function descargarRespaldo(respaldo) {
  const json = JSON.stringify(respaldo);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `respaldo-ensayos-${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function leerArchivoRespaldo(file) {
  const texto = await file.text();
  const respaldo = JSON.parse(texto);
  if (!respaldo || !respaldo.data) throw new Error('Archivo de respaldo inválido');
  return respaldo;
}

/**
 * @param {'reemplazar'|'fusionar'} modo
 */
export async function importarRespaldo(respaldo, modo = 'fusionar') {
  if (modo === 'reemplazar') {
    for (const storeName of ALL_STORES) {
      await dbClear(storeName);
    }
  }
  for (const storeName of ALL_STORES) {
    const registros = respaldo.data[storeName] || [];
    const deserializados = await Promise.all(registros.map(r => deserializarRegistro(storeName, r)));
    if (deserializados.length > 0) {
      await dbPutMany(storeName, deserializados);
    }
  }
}
