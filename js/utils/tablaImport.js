// Lógica compartida para importar una tabla de tratamientos (una foto de
// una planilla escrita/impresa, o un archivo Excel/CSV con la misma
// estructura) y convertirla en tratamientos con sus productos. No toca el
// DOM ni la base de datos: recibe texto/celdas ya extraídas y devuelve
// estructuras de datos listas para revisar en pantalla y, luego, guardar.
//
// El modelo intermedio es una lista PLANA de "filas" (una por línea/renglón
// de la tabla): cada fila puede empezar un tratamiento nuevo o ser una
// línea más (otro ingrediente) del tratamiento anterior. Mantenerlo plano
// —en vez de armar de entrada los bloques— es lo que permite que la
// persona corrija fácilmente en la pantalla de revisión cuándo empieza
// cada tratamiento, sin depender de que el reconocimiento automático haya
// acertado la agrupación.

import { interpretarProducto, extraerConcentracion } from './textMatch.js';
import { nuevoId } from './idGen.js';

/** Códigos cortos típicos de una franja/tratamiento: "A", "B1", "T1", "T12"... */
const RE_CODIGO_CORTO = /^[A-Za-zÁÉÍÓÚÑ]{1,3}\d{0,2}$/;

/** Último número "tipo dosis" de una línea (admite miles con punto y decimales con coma). */
const RE_NUMERO_DOSIS = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:cc|gr?|ml|kg|lts?|l)?\.?\s*$/i;

function limpiar(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

/**
 * Interpreta una línea de texto (leída por OCR de una foto) como una fila
 * de la tabla: { nuevoTratamiento, labelDetectado, ingredienteTexto, dosis, secuencial }.
 */
export function parsearFilaTabla(lineaOriginal) {
  let linea = limpiar(lineaOriginal);
  if (!linea) return null;

  // "SEC.:" o "SEC:" al principio marca una aplicación secuencial.
  const secMatch = linea.match(/^SEC\.?\s*:?\s*/i);
  const secuencial = !!secMatch;
  if (secMatch) linea = limpiar(linea.slice(secMatch[0].length));

  // ¿Empieza con un código corto de franja/tratamiento (A, B, T1...)
  // seguido de más texto? Si es así, esa es la marca de "tratamiento nuevo".
  let labelDetectado = '';
  let resto = linea;
  const partes = linea.split(/\s+/);
  if (partes.length > 1 && RE_CODIGO_CORTO.test(partes[0])) {
    labelDetectado = partes[0];
    resto = limpiar(partes.slice(1).join(' '));
  } else if (partes.length === 1 && RE_CODIGO_CORTO.test(partes[0])) {
    // Línea que es solo el código (la tabla lo puso en su propio renglón).
    labelDetectado = partes[0];
    resto = '';
  }

  // Dosis: el último número de la línea.
  let dosis = '';
  let ingredienteTexto = resto;
  const mNum = resto.match(RE_NUMERO_DOSIS);
  if (mNum && mNum[1]) {
    dosis = mNum[1].replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    ingredienteTexto = limpiar(resto.slice(0, mNum.index));
  }

  if (!ingredienteTexto && !labelDetectado) return null;

  return {
    id: nuevoId(),
    nuevoTratamiento: !!labelDetectado,
    labelDetectado,
    ingredienteTexto,
    concentracion: null,
    dosis,
    unidad: '',
    secuencial
  };
}

/** Convierte las líneas detectadas por OCR en filas de revisión. */
export function filasDesdeLineasOCR(lineas) {
  const filas = (lineas || []).map(parsearFilaTabla).filter(Boolean);
  // Si nada trajo código de tratamiento, al menos la primera fila arranca uno.
  if (filas.length > 0 && !filas.some(f => f.nuevoTratamiento)) filas[0].nuevoTratamiento = true;
  return aplicarConcentracionInicial(filas);
}

function buscarIndiceHeader(filas2D) {
  for (let i = 0; i < Math.min(filas2D.length, 6); i++) {
    const fila = filas2D[i] || [];
    const textoFila = fila.map(c => (c == null ? '' : String(c))).join(' ').toLowerCase();
    if (/dosis/.test(textoFila) && /(ingredient|activo|producto)/.test(textoFila)) {
      return i;
    }
  }
  return -1;
}

/**
 * Convierte una hoja de cálculo (array de filas, cada una array de celdas —
 * el formato que devuelve SheetJS con {header:1}) en filas de revisión.
 * Busca la fila de encabezados por palabras clave para ubicar las columnas
 * de "ingredientes activos" y "dosis" aunque no estén en el orden habitual;
 * si no encuentra encabezados, asume columnas A=código, B=ingrediente,
 * C=dosis (el orden de las planillas de ejemplo).
 */
export function filasDesdeHojaExcel(filas2D) {
  if (!Array.isArray(filas2D) || filas2D.length === 0) return [];

  const idxHeader = buscarIndiceHeader(filas2D);
  let colLabel = 0, colIngrediente = 1, colDosis = 2, primeraFilaDatos = 0;

  if (idxHeader >= 0) {
    const header = filas2D[idxHeader].map(c => (c == null ? '' : String(c)).toLowerCase());
    const iIngrediente = header.findIndex(h => /(ingredient|activo|producto)/.test(h));
    const iDosis = header.findIndex(h => /dosis/.test(h));
    if (iIngrediente >= 0) colIngrediente = iIngrediente;
    if (iDosis >= 0) colDosis = iDosis;
    colLabel = header.findIndex((h, i) => i !== colIngrediente && i !== colDosis && !/extrapola/.test(h));
    if (colLabel < 0) colLabel = 0;
    primeraFilaDatos = idxHeader + 1;
  }

  const filas = [];
  for (let i = primeraFilaDatos; i < filas2D.length; i++) {
    const fila = filas2D[i] || [];
    const labelCelda = limpiar(fila[colLabel] == null ? '' : String(fila[colLabel]));
    let ingredienteCelda = limpiar(fila[colIngrediente] == null ? '' : String(fila[colIngrediente]));
    const dosisCelda = fila[colDosis] == null ? '' : String(fila[colDosis]).trim();
    if (!labelCelda && !ingredienteCelda && !dosisCelda) continue; // fila vacía

    const secMatch = ingredienteCelda.match(/^SEC\.?\s*:?\s*/i);
    const secuencial = !!secMatch;
    if (secMatch) ingredienteCelda = limpiar(ingredienteCelda.slice(secMatch[0].length));

    // También puede venir un título de tabla en una fila entera (ninguna
    // columna de dosis con número) antes del encabezado real — se ignora.
    if (!ingredienteCelda && !dosisCelda && labelCelda) continue;

    filas.push({
      id: nuevoId(),
      nuevoTratamiento: !!labelCelda,
      labelDetectado: labelCelda,
      ingredienteTexto: ingredienteCelda,
      concentracion: null,
      dosis: dosisCelda.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'),
      unidad: '',
      secuencial
    });
  }
  if (filas.length > 0 && !filas.some(f => f.nuevoTratamiento)) filas[0].nuevoTratamiento = true;
  return aplicarConcentracionInicial(filas);
}

/** Separa el "% de concentración" del texto del ingrediente, si lo trae. */
function aplicarConcentracionInicial(filas) {
  return filas.map(f => {
    const { texto, concentracion } = extraerConcentracion(f.ingredienteTexto);
    return { ...f, ingredienteTexto: texto, concentracion };
  });
}

/**
 * Agrupa la lista plana de filas (ya revisada/corregida por la persona) en
 * bloques de tratamiento, usando el flag `nuevoTratamiento` de cada fila.
 * Devuelve [{ filas: [...] }] — solo agrupa, no interpreta productos
 * todavía (eso lo hace `construirTratamientosDesdeFilas`).
 */
export function agruparEnTratamientos(filas) {
  const bloques = [];
  for (const fila of filas) {
    if (fila.nuevoTratamiento || bloques.length === 0) {
      bloques.push({ filas: [] });
    }
    bloques[bloques.length - 1].filas.push(fila);
  }
  return bloques;
}

/**
 * A partir de la lista plana de filas ya revisadas, arma los tratamientos
 * finales: título genérico "Tratamiento N" (editable después por la
 * persona), y sus aplicaciones (principal / secuencial) con los productos
 * ya interpretados (ingrediente activo, producto comercial conocido,
 * coadyuvante o desconocido).
 *
 * @param {object[]} filas
 * @param {object[]} productosComerciales - de listarProductosComerciales()
 */
export function construirTratamientosDesdeFilas(filas, productosComerciales = []) {
  const bloques = agruparEnTratamientos(filas);
  return bloques.map((bloque, i) => {
    const productosPrincipal = [];
    const productosSecuencial = [];
    for (const f of bloque.filas) {
      if (!f.ingredienteTexto.trim()) continue;
      const interpretado = interpretarProducto(f.ingredienteTexto, productosComerciales);
      // Si la persona corrigió la concentración a mano en la revisión, esa
      // gana por sobre la que se haya detectado del texto original.
      const ingredientes = interpretado.ingredientes.length
        ? interpretado.ingredientes.map((ing, idx) => ({
            ...ing,
            concentracion: idx === 0 && f.concentracion != null ? f.concentracion : ing.concentracion
          }))
        : [];
      const producto = {
        id: nuevoId(),
        nombre: f.ingredienteTexto.trim(),
        dosis: f.dosis || '',
        unidad: f.unidad || '',
        tipo: interpretado.tipo,
        ingredientes
      };
      (f.secuencial ? productosSecuencial : productosPrincipal).push(producto);
    }

    const aplicaciones = [];
    if (productosPrincipal.length > 0) {
      aplicaciones.push({ id: nuevoId(), tipo: 'principal', momento: '', caudalAgua: '', productos: productosPrincipal });
    }
    if (productosSecuencial.length > 0) {
      aplicaciones.push({ id: nuevoId(), tipo: 'secuencial', momento: '', caudalAgua: '', productos: productosSecuencial });
    }

    return {
      codigo: `Tratamiento ${i + 1}`,
      nombre: '',
      labelOriginal: bloque.filas[0]?.labelDetectado || '',
      aplicaciones
    };
  });
}
