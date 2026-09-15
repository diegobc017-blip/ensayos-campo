const DB_NAME = 'ensayosBCA_db';
const DB_VERSION = 1;

let dbPromise = null;

function abrirDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('ensayos')) {
        db.createObjectStore('ensayos', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('tratamientos')) {
        const s = db.createObjectStore('tratamientos', { keyPath: 'id' });
        s.createIndex('by_ensayoId', 'ensayoId');
      }

      if (!db.objectStoreNames.contains('bloques')) {
        const s = db.createObjectStore('bloques', { keyPath: 'id' });
        s.createIndex('by_ensayoId', 'ensayoId');
      }

      if (!db.objectStoreNames.contains('celdas')) {
        const s = db.createObjectStore('celdas', { keyPath: 'id' });
        s.createIndex('by_ensayoId', 'ensayoId');
        s.createIndex('by_bloqueId', 'bloqueId');
      }

      if (!db.objectStoreNames.contains('variablesResultado')) {
        const s = db.createObjectStore('variablesResultado', { keyPath: 'id' });
        s.createIndex('by_ensayoId', 'ensayoId');
      }

      if (!db.objectStoreNames.contains('resultados')) {
        const s = db.createObjectStore('resultados', { keyPath: 'id' });
        s.createIndex('by_ensayoId', 'ensayoId');
        s.createIndex('by_celdaId', 'celdaId');
        s.createIndex('by_variableId', 'variableId');
        s.createIndex('by_cuadrilla', 'cuadrilla');
      }

      if (!db.objectStoreNames.contains('imagenes')) {
        const s = db.createObjectStore('imagenes', { keyPath: 'id' });
        s.createIndex('by_ensayoId', 'ensayoId');
        s.createIndex('by_bloqueId', 'bloqueId');
        s.createIndex('by_celdaId', 'celdaId');
      }

      if (!db.objectStoreNames.contains('notas')) {
        const s = db.createObjectStore('notas', { keyPath: 'id' });
        s.createIndex('by_ensayoId', 'ensayoId');
        s.createIndex('by_bloqueId', 'bloqueId');
        s.createIndex('by_celdaId', 'celdaId');
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStore(nombre, modo = 'readonly') {
  const db = await abrirDB();
  const tx = db.transaction(nombre, modo);
  return tx.objectStore(nombre);
}

export async function dbGet(storeName, id) {
  const store = await getStore(storeName);
  return promisifyRequest(store.get(id));
}

export async function dbGetAll(storeName) {
  const store = await getStore(storeName);
  return promisifyRequest(store.getAll());
}

export async function dbGetAllByIndex(storeName, indexName, valor) {
  const store = await getStore(storeName);
  return promisifyRequest(store.index(indexName).getAll(valor));
}

export async function dbPut(storeName, valor) {
  const store = await getStore(storeName, 'readwrite');
  return promisifyRequest(store.put(valor));
}

export async function dbPutMany(storeName, valores) {
  const db = await abrirDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const v of valores) store.put(v);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbDelete(storeName, id) {
  const store = await getStore(storeName, 'readwrite');
  return promisifyRequest(store.delete(id));
}

export async function dbDeleteMany(storeName, ids) {
  const db = await abrirDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const id of ids) store.delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbClear(storeName) {
  const store = await getStore(storeName, 'readwrite');
  return promisifyRequest(store.clear());
}

export const ALL_STORES = [
  'ensayos', 'tratamientos', 'bloques', 'celdas',
  'variablesResultado', 'resultados', 'imagenes', 'notas'
];

export async function estimarAlmacenamiento() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      return await navigator.storage.estimate();
    } catch (e) {
      return null;
    }
  }
  return null;
}

export async function pedirPersistencia() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch (e) {
      return false;
    }
  }
  return false;
}
