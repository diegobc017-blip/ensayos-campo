// db.js — guardado local en el navegador (IndexedDB). Todo queda en este equipo,
// funciona sin internet y sobrevive a cerrar la app o apagar la PC.
//   ensayos   : un documento por ensayo (keyPath id)
//   config    : perfiles, equipos, indicadores propios, sesión y datos de la app
//   imagenes  : fotos de parcelas y del ensayo (Blob), con referencia al ensayo
const NOMBRE = 'ensayos_campo_v2', VERSION = 1;
let dbp = null;

function abrir() {
  if (dbp) return dbp;
  dbp = new Promise((ok, mal) => {
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('ensayos')) db.createObjectStore('ensayos', {keyPath: 'id'});
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', {keyPath: 'id'});
      if (!db.objectStoreNames.contains('imagenes')) { const s = db.createObjectStore('imagenes', {keyPath: 'id'}); s.createIndex('ensayo', 'ensayo'); }
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
    r.onblocked = () => mal(new Error('La base de datos está abierta en otra pestaña con una versión anterior. Cerrá las otras pestañas de la app.'));
  });
  return dbp;
}
const req = r => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
async function tx(stores, modo, fn) {
  const db = await abrir(), t = db.transaction(stores, modo), out = fn(t);
  await new Promise((ok, mal) => { t.oncomplete = ok; t.onerror = () => mal(t.error); t.onabort = () => mal(t.error || new Error('Transacción cancelada')); });
  return out;
}

export async function cargarTodo() {
  const db = await abrir(), t = db.transaction(['ensayos', 'config'], 'readonly');
  const [ensayos, config] = await Promise.all([req(t.objectStore('ensayos').getAll()), req(t.objectStore('config').get('principal'))]);
  return {ensayos, config: config || null};
}
export const guardarEnsayos = lista => tx(['ensayos'], 'readwrite', t => { const s = t.objectStore('ensayos'); lista.forEach(e => s.put(e)); });
export const borrarEnsayos = ids => tx(['ensayos', 'imagenes'], 'readwrite', t => {
  const s = t.objectStore('ensayos'), im = t.objectStore('imagenes');
  ids.forEach(id => { s.delete(id); im.index('ensayo').openCursor(IDBKeyRange.only(id)).onsuccess = e => { const c = e.target.result; if (c) { c.delete(); c.continue(); } }; });
});
export const guardarConfig = cfg => tx(['config'], 'readwrite', t => t.objectStore('config').put({...cfg, id: 'principal'}));

export const guardarImagen = img => tx(['imagenes'], 'readwrite', t => t.objectStore('imagenes').put(img));
export const borrarImagen = id => tx(['imagenes'], 'readwrite', t => t.objectStore('imagenes').delete(id));
export async function imagenesDe(ensayo) { const db = await abrir(); return req(db.transaction('imagenes').objectStore('imagenes').index('ensayo').getAll(ensayo)); }
export async function todasLasImagenes() { const db = await abrir(); return req(db.transaction('imagenes').objectStore('imagenes').getAll()); }

export async function borrarTodo() {
  await tx(['ensayos', 'config', 'imagenes'], 'readwrite', t => ['ensayos', 'config', 'imagenes'].forEach(s => t.objectStore(s).clear()));
}
export async function uso() { try { return await navigator.storage?.estimate?.(); } catch (e) { return null; } }
export async function pedirPersistencia() { try { return await navigator.storage?.persist?.(); } catch (e) { return false; } }
