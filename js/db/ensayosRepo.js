import { dbGet, dbGetAll, dbPut, dbDelete, dbGetAllByIndex, dbDeleteMany } from './db.js';
import { nuevoId, ahoraISO } from '../utils/idGen.js';

export const ETIQUETAS_DISENO = {
  BCA: 'Bloques Completos al Azar (BCA)',
  DCA: 'Completamente al Azar (DCA)',
  FRANJA: 'Franjas cruzadas'
};

export async function listarEnsayos() {
  const todos = await dbGetAll('ensayos');
  return todos.sort((a, b) => (b.actualizadoEn || '').localeCompare(a.actualizadoEn || ''));
}

export async function obtenerEnsayo(id) {
  return dbGet('ensayos', id);
}

export async function crearEnsayo(datos) {
  const ahora = ahoraISO();
  const ensayo = {
    id: nuevoId(),
    nombre: datos.nombre || 'Ensayo sin nombre',
    cultivo: datos.cultivo || '',
    ubicacion: datos.ubicacion || '',
    fechaSiembra: datos.fechaSiembra || null,
    notas: datos.notas || '',
    tipoDiseno: datos.tipoDiseno || 'BCA',
    numTratamientos: Number(datos.numTratamientos) || 0,
    numBloques: Number(datos.numBloques) || 0,
    numFactorA: Number(datos.numFactorA) || 0,
    numFactorB: Number(datos.numFactorB) || 0,
    dimensionParcela: {
      ancho: datos.dimensionParcela?.ancho ? Number(datos.dimensionParcela.ancho) : null,
      largo: datos.dimensionParcela?.largo ? Number(datos.dimensionParcela.largo) : null,
      unidad: datos.dimensionParcela?.unidad || 'm'
    },
    estado: 'planificacion',
    creadoEn: ahora,
    actualizadoEn: ahora
  };
  await dbPut('ensayos', ensayo);
  return ensayo;
}

export async function actualizarEnsayo(id, cambios) {
  const actual = await dbGet('ensayos', id);
  if (!actual) throw new Error('Ensayo no encontrado');
  const actualizado = {
    ...actual,
    ...cambios,
    dimensionParcela: {
      ...actual.dimensionParcela,
      ...(cambios.dimensionParcela || {})
    },
    id: actual.id,
    actualizadoEn: ahoraISO()
  };
  await dbPut('ensayos', actualizado);
  return actualizado;
}

export function areaParcela(ensayo) {
  const d = ensayo?.dimensionParcela;
  if (!d || !d.ancho || !d.largo) return null;
  return d.ancho * d.largo;
}

export function areaTotal(ensayo) {
  const area = areaParcela(ensayo);
  if (area == null) return null;
  const totalParcelas = (ensayo.numTratamientos || 0) * (ensayo.numBloques || 0);
  return area * totalParcelas;
}

export async function eliminarEnsayo(id) {
  const [tratamientos, bloques, celdas, variables, resultados, imagenes, notas] = await Promise.all([
    dbGetAllByIndex('tratamientos', 'by_ensayoId', id),
    dbGetAllByIndex('bloques', 'by_ensayoId', id),
    dbGetAllByIndex('celdas', 'by_ensayoId', id),
    dbGetAllByIndex('variablesResultado', 'by_ensayoId', id),
    dbGetAllByIndex('resultados', 'by_ensayoId', id),
    dbGetAllByIndex('imagenes', 'by_ensayoId', id),
    dbGetAllByIndex('notas', 'by_ensayoId', id)
  ]);
  await Promise.all([
    dbDeleteMany('tratamientos', tratamientos.map(x => x.id)),
    dbDeleteMany('bloques', bloques.map(x => x.id)),
    dbDeleteMany('celdas', celdas.map(x => x.id)),
    dbDeleteMany('variablesResultado', variables.map(x => x.id)),
    dbDeleteMany('resultados', resultados.map(x => x.id)),
    dbDeleteMany('imagenes', imagenes.map(x => x.id)),
    dbDeleteMany('notas', notas.map(x => x.id))
  ]);
  await dbDelete('ensayos', id);
}
