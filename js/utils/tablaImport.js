// Lógica compartida para importar una tabla de tratamientos (una foto de
// una planilla escrita/impresa, o un archivo Excel/CSV con la misma
// estructura) y convertirla en tratamientos con sus productos. No toca el
// DOM ni la base de datos: recibe texto/celdas ya extraídas y devuelve
// estructuras de datos listas para revisar en pantalla y, luego, guardar.
//
// El modelo intermedio es una lista PLANA de "filas" (una por producto):
// cada fila puede empezar un tratamiento nuevo o ser un producto más
// (principal o secuencial) del tratamiento anterior. Mantenerlo plano —en
// vez de armar de entrada los bloques— es lo que permite que la persona
// corrija fácilmente en la pantalla de revisión cuándo empieza cada
// tratamiento, sin depender de que el reconocimiento automático haya
// acertado la agrupación.
//
// Un mismo renglón de la tabla (una línea de OCR, o una celda de Excel)
// puede traer VARIOS productos "en fila" — como en la planilla de Franjas
// Cruzadas o de Instalación DBCA, donde una sola línea grande dice, por
// ejemplo, "T1  Glifosato 60,2% 2500  Dicamba 300  Duplex 25". Todo eso
// pertenece a un solo tratamiento (T1): por eso una línea puede generar
// varias filas de golpe, todas menos la primera con `nuevoTratamiento:
// false`. La aplicación secuencial (marcada con "SEC", "SECUENCIAL" o
// variantes/abreviaturas parecidas, en cualquier parte de la línea) tampoco
// arranca un tratamiento nuevo: sigue siendo del mismo tratamiento, solo
// que sus productos quedan marcados con `secuencial: true`.

import { interpretarProducto, extraerConcentracion, buscarIngredienteActivo } from './textMatch.js';
import { nuevoId } from './idGen.js';

/** Códigos cortos típicos de una franja/tratamiento: "A", "B1", "T1", "T12"... */
const RE_CODIGO_CORTO = /^[A-Za-zÁÉÍÓÚÑ]{1,3}\d{0,2}$/;

/** Un token que es (o podría ser, con unidad pegada) un número de dosis. */
const RE_TOKEN_NUMERO = /^(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)$/;

/** Unidades típicas de dosis, para separarlas si vienen pegadas al número ("2500cc", "300ml"). */
const RE_UNIDAD_PEGADA = /^(\d[\d.,]*)(cc|gr?|ml|kg|lts?|l)\.?$/i;

/**
 * Distintas formas de marcar que lo que sigue es una aplicación secuencial
 * (una segunda pasada del mismo tratamiento), en cualquier parte de la
 * línea: "SEC", "SEC.", "SEC:", "SECS", "SECUENCIAL", "SECUENCIALES",
 * "2DA APLICACION", "SEGUNDA APLICACIÓN"... Los alternativos más largos van
 * primero para que no se corten a mitad de palabra.
 */
const RE_MARCA_SECUENCIAL = /\b(SECUENCIALES|SECUENCIAL|SECS|SEC|2D?A\.?\s*APLICACI[OÓ]N|SEGUNDA\s*APLICACI[OÓ]N)\b/i;

function limpiar(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

/** Quita separadores de miles y normaliza la coma decimal a punto ("2.500" -> "2500", "11,53" -> "11.53"). */
function normalizarNumero(txt) {
  return (txt || '')
    .split('+')
    .map(seg => seg.trim().replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
    .join(' + ');
}

/** Busca en el texto la primera marca de "aplicación secuencial" (ver RE_MARCA_SECUENCIAL). */
function buscarMarcaSecuencial(texto) {
  const m = texto.match(RE_MARCA_SECUENCIAL);
  if (!m) return null;
  let fin = m.index + m[0].length;
  // Consumir puntuación/dos puntos pegados después de la marca (ej. "SEC.:", "SEC:").
  while (fin < texto.length && /[.:\s]/.test(texto[fin])) fin++;
  return { inicio: m.index, fin };
}

function clasificarToken(tok) {
  if (/%$/.test(tok)) return { tipo: 'nombre' }; // "60,2%", "11.53%": va con el nombre/concentración.
  const mUnidad = tok.match(RE_UNIDAD_PEGADA);
  const numTexto = mUnidad ? mUnidad[1] : tok;
  const unidad = mUnidad ? mUnidad[2] : '';
  if (RE_TOKEN_NUMERO.test(numTexto)) return { tipo: 'dosis', numero: numTexto, unidad };
  return { tipo: 'nombre' };
}

/**
 * Recorre un segmento de texto (ya sin código de franja ni marca de
 * secuencial) y separa los pares "nombre de producto" + "dosis" que
 * encuentre en fila, en el orden en que aparecen. Soporta que haya más de
 * un producto en el mismo segmento (ej. "Glifosato 2500 Dicamba 300 Duplex
 * 25") y que una dosis venga combinada con "+" (ej. "60 + 1.000").
 */
function extraerPares(segmento) {
  const tokens = limpiar(segmento).split(' ').filter(Boolean);
  const pares = [];
  let nombreActual = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // El OCR a veces separa el "%" del número con un espacio ("11.53 %" en
    // vez de "11.53%"). Sin este caso especial, ese número se confundiría
    // con una dosis y cortaría el nombre del ingrediente activo a la mitad
    // (arruinando el reconocimiento de todo lo que viene después). Un "%"
    // suelto (pegado al número anterior, o el número que lo precede) se
    // trata como parte del nombre/concentración, nunca como dosis.
    if (tok === '%' && nombreActual.length > 0) {
      nombreActual[nombreActual.length - 1] += '%';
      continue;
    }
    if (RE_TOKEN_NUMERO.test(tok) && tokens[i + 1] === '%') {
      nombreActual.push(tok + '%');
      i++; // consume el "%" suelto también.
      continue;
    }

    const clasif = clasificarToken(tok);
    if (clasif.tipo === 'dosis') {
      let dosisTexto = clasif.numero;
      let unidad = clasif.unidad;
      let j = i + 1;
      // Dosis combinada tipo "60 + 1.000" (dos ingredientes de un mismo
      // producto con dosis distinta): se guarda entera para que la persona
      // la revise/ajuste en la pantalla de revisión.
      while (tokens[j] === '+' && clasificarToken(tokens[j + 1] || '').tipo === 'dosis') {
        const sig = clasificarToken(tokens[j + 1]);
        dosisTexto += ' + ' + sig.numero;
        if (!unidad) unidad = sig.unidad;
        j += 2;
      }
      pares.push({ nombre: limpiar(nombreActual.join(' ')), dosis: normalizarNumero(dosisTexto), unidad });
      nombreActual = [];
      i = j - 1;
    } else {
      nombreActual.push(tok);
    }
  }
  const nombreSobrante = limpiar(nombreActual.join(' '));
  if (nombreSobrante) pares.push({ nombre: nombreSobrante, dosis: '', unidad: '' });
  return pares;
}

/**
 * Interpreta una línea de texto (leída por OCR de una foto, o ya separada
 * de una celda de Excel) como una o varias filas de revisión —una por cada
 * producto que traiga esa línea—: { nuevoTratamiento, labelDetectado,
 * ingredienteTexto, dosis, unidad, secuencial }.
 */
export function parsearFilaTabla(lineaOriginal) {
  const lineaLimpia = limpiar(lineaOriginal);
  if (!lineaLimpia) return [];

  const marca = buscarMarcaSecuencial(lineaLimpia);
  let textoPrincipal = limpiar(marca ? lineaLimpia.slice(0, marca.inicio) : lineaLimpia);
  const textoSecuencial = limpiar(marca ? lineaLimpia.slice(marca.fin) : '');

  // ¿La parte principal empieza con un código corto de franja/tratamiento
  // (A, B, T1...)? Esa es la marca de "tratamiento nuevo".
  let labelDetectado = '';
  if (textoPrincipal) {
    const partes = textoPrincipal.split(' ');
    if (RE_CODIGO_CORTO.test(partes[0])) {
      labelDetectado = partes[0];
      textoPrincipal = limpiar(partes.slice(1).join(' '));
    }
  }

  const filas = [];
  let esPrimera = true;
  function empujar(par, secuencial) {
    if (!par.nombre && !par.dosis) return;
    filas.push({
      id: nuevoId(),
      nuevoTratamiento: esPrimera && !!labelDetectado,
      labelDetectado: esPrimera ? labelDetectado : '',
      ingredienteTexto: par.nombre,
      concentracion: null,
      dosis: par.dosis || '',
      unidad: par.unidad || '',
      secuencial
    });
    esPrimera = false;
  }

  extraerPares(textoPrincipal).forEach(par => empujar(par, false));
  extraerPares(textoSecuencial).forEach(par => empujar(par, true));

  // Caso especial: la línea es *solo* el código de tratamiento, sin
  // productos (la tabla lo puso en su propio renglón, ej. "T1" solo).
  if (filas.length === 0 && labelDetectado) {
    filas.push({
      id: nuevoId(), nuevoTratamiento: true, labelDetectado,
      ingredienteTexto: '', concentracion: null, dosis: '', unidad: '', secuencial: false
    });
  }

  return filas;
}

/** Convierte las líneas detectadas por OCR en filas de revisión. */
export function filasDesdeLineasOCR(lineas) {
  const filas = (lineas || []).flatMap(linea => parsearFilaTabla(linea));
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
 * C=dosis (el orden de las planillas de ejemplo). Si la celda de
 * "ingrediente" trae más de un producto (ej. varios separados por coma o
 * ";", además del que ya separa `interpretarProducto` con "+"), cada uno
 * se reparte la misma dosis de la celda salvo que traiga la suya propia.
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

    const marca = buscarMarcaSecuencial(ingredienteCelda);
    const secuencial = !!marca;
    if (marca) ingredienteCelda = limpiar(ingredienteCelda.slice(0, marca.inicio) + ' ' + ingredienteCelda.slice(marca.fin));

    // También puede venir un título de tabla en una fila entera (ninguna
    // columna de dosis con número) antes del encabezado real — se ignora.
    if (!ingredienteCelda && !dosisCelda && labelCelda) continue;

    filas.push({
      id: nuevoId(),
      nuevoTratamiento: !!labelCelda,
      labelDetectado: labelCelda,
      ingredienteTexto: ingredienteCelda,
      concentracion: null,
      dosis: normalizarNumero(dosisCelda),
      unidad: '',
      secuencial
    });
  }
  if (filas.length > 0 && !filas.some(f => f.nuevoTratamiento)) filas[0].nuevoTratamiento = true;
  return aplicarConcentracionInicial(filas);
}

/**
 * Si el texto leído (de una sola línea, sin "+") coincide, tolerando
 * errores típicos de OCR, con alguno de los ingredientes activos de
 * referencia, se reemplaza por su nombre canónico — así se prioriza
 * mostrar el nombre correcto del ingrediente activo en la pantalla de
 * revisión en vez de dejar una lectura ruidosa de la foto/planilla. Un
 * texto con "+" (varios ingredientes en una sola celda/renglón) se deja
 * intacto acá: separarlo y reconocer cada parte ya lo hace
 * `interpretarProducto` más adelante, y reemplazarlo entero por un solo
 * nombre reconocido perdería el resto de la mezcla.
 */
function priorizarNombreConocido(texto) {
  const limpio = (texto || '').trim();
  if (!limpio || limpio.includes('+')) return limpio;
  const activo = buscarIngredienteActivo(limpio);
  return activo ? activo.nombre : limpio;
}

/** Separa el "% de concentración" del texto del ingrediente, si lo trae. */
function aplicarConcentracionInicial(filas) {
  return filas.map(f => {
    const { texto, concentracion } = extraerConcentracion(f.ingredienteTexto);
    return { ...f, ingredienteTexto: priorizarNombreConocido(texto), concentracion };
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
        // Se copia también al nivel superior (además de en `ingredientes[0]`)
        // porque el editor de productos (tratamientosView) muestra y edita el
        // campo "% conc." desde acá para el caso de un solo ingrediente activo.
        concentracion: ingredientes[0]?.concentracion ?? null,
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
