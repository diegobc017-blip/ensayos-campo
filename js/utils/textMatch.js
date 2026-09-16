// Utilidades para interpretar texto leído por OCR, dictado por voz o
// tipeado a mano: emparejarlo con códigos de tratamiento ya cargados
// (tolerando errores típicos de lectura), separar una línea suelta en
// "código" + "nombre", y — lo más importante para cargar productos —
// reconocer si lo que se escribió es un ingrediente activo (de la lista de
// referencia) o el nombre comercial de una mezcla de varios activos.

import { INGREDIENTES_ACTIVOS, COADYUVANTES } from '../data/ingredientesActivos.js';

export function distanciaLevenshtein(a, b) {
  a = a || '';
  b = b || '';
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + costo);
    }
  }
  return dp[m][n];
}

function normalizarCodigo(s) {
  return (s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Busca, entre `opciones` ({id, codigo}), la que mejor coincide con `token`
 * (un fragmento de texto leído por OCR). Tolera errores menores de lectura
 * (1-2 caracteres de diferencia según el largo del código). Devuelve la
 * opción encontrada o null si no hay ninguna suficientemente parecida.
 */
export function emparejarCodigo(token, opciones) {
  const t = normalizarCodigo(token);
  if (!t) return null;

  const exacto = opciones.find(o => normalizarCodigo(o.codigo) === t);
  if (exacto) return exacto;

  let mejor = null;
  let mejorDist = Infinity;
  for (const o of opciones) {
    const c = normalizarCodigo(o.codigo);
    if (!c) continue;
    const d = distanciaLevenshtein(t, c);
    const umbral = c.length <= 3 ? 1 : 2;
    if (d <= umbral && d < mejorDist) {
      mejor = o;
      mejorDist = d;
    }
  }
  return mejor;
}

const UNIDADES_DOSIS = [
  'l\\/ha', 'lt\\/ha', 'lts\\/ha', 'litros?\\/ha',
  'kg\\/ha', 'kilos?\\/ha',
  'g\\/ha', 'gr\\/ha', 'gramos?\\/ha',
  'cc\\/ha', 'ml\\/ha'
];
const RE_DOSIS = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES_DOSIS.join('|')})\\b`, 'i');

/**
 * Busca en una línea de texto una dosis "por hectárea" (ej. "1,5 L/ha",
 * "2 kg/ha"). Devuelve { dosis, unidad, resto } (resto = la línea sin esa
 * parte, para poder seguir interpretando código/nombre) o null si no
 * encuentra ninguna.
 */
export function parsearDosis(linea) {
  const m = linea.match(RE_DOSIS);
  if (!m) return null;
  const dosis = parseFloat(m[1].replace(',', '.'));
  const unidad = m[2];
  const resto = (linea.slice(0, m.index) + linea.slice(m.index + m[0].length))
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { dosis, unidad, resto };
}

/**
 * Interpreta una línea de texto suelta como { codigo, nombre, dosis, unidad }
 * para proponer un tratamiento (y, si hay dosis, un producto) a partir de
 * una foto de una lista escrita. Reconoce formatos como "T1 - Fungicida X"
 * o "T1 - Fungicida X - 1.5 L/ha"; si no hay separador claro, asume que la
 * primera palabra corta es el código.
 */
export function parsearLineaTratamiento(linea) {
  const limpio = (linea || '').trim();
  if (!limpio) return null;

  const dosisInfo = parsearDosis(limpio);
  const base = (dosisInfo ? dosisInfo.resto : limpio).replace(/[-–—:.\s]+$/, '').trim();

  let codigo = '';
  let nombre = base;
  const conSeparador = base.match(/^([A-Za-z0-9º°]{1,8})\s*[-–—:.]\s*(.+)$/);
  if (conSeparador) {
    codigo = conSeparador[1].trim();
    nombre = conSeparador[2].trim();
  } else {
    const partes = base.split(/\s+/);
    if (partes.length > 1 && /^[A-Za-z0-9º°]{1,5}$/.test(partes[0])) {
      codigo = partes[0];
      nombre = partes.slice(1).join(' ');
    }
  }

  return {
    codigo,
    nombre,
    dosis: dosisInfo ? dosisInfo.dosis : '',
    unidad: dosisInfo ? dosisInfo.unidad : ''
  };
}

// ---------------------------------------------------------------------
// Reconocimiento de productos: ingrediente activo vs. nombre comercial.
// ---------------------------------------------------------------------

/** minúsculas, sin tildes, sin signos — para comparar nombres de productos. */
export function normalizarNombreProducto(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%,.\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const RE_CONCENTRACION = /(\d+(?:[.,]\d+)?)\s*%/;

/**
 * Extrae un porcentaje de concentración de un texto de producto, si lo
 * tiene (ej. "Glifosato 60,2%" -> { texto: "Glifosato", concentracion: 60.2 }).
 * Si no encuentra ninguno, devuelve concentracion: null y el texto tal cual.
 */
export function extraerConcentracion(texto) {
  const t = (texto || '').trim();
  const m = t.match(RE_CONCENTRACION);
  if (!m) return { texto: t, concentracion: null };
  const concentracion = parseFloat(m[1].replace(',', '.'));
  const resto = (t.slice(0, m.index) + t.slice(m.index + m[0].length))
    .replace(/[-–—:,.\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { texto: resto, concentracion };
}

/**
 * Busca, en la lista de ingredientes activos de referencia, el que mejor
 * coincide con `texto` (ya sin el % de concentración). Tolera errores de
 * OCR/tipeo razonables. Devuelve el registro de INGREDIENTES_ACTIVOS o null.
 */
export function buscarIngredienteActivo(texto, lista = INGREDIENTES_ACTIVOS) {
  const t = normalizarNombreProducto(texto);
  if (!t || t.length < 3) return null;

  // Coincidencia exacta primero.
  const exacto = lista.find(i => normalizarNombreProducto(i.nombre) === t);
  if (exacto) return exacto;

  // ¿El nombre del ingrediente aparece como sub-cadena del texto (o al
  // revés)? Cubre casos como "Glifosato 60,2" (ya sin %) o textos con
  // ruido de OCR alrededor del nombre.
  const porInclusion = lista.find(i => {
    const n = normalizarNombreProducto(i.nombre);
    return n.length >= 4 && (t.includes(n) || n.includes(t));
  });
  if (porInclusion) return porInclusion;

  // Si no, distancia de edición sobre la primera palabra significativa
  // (para tolerar errores de OCR letra por letra).
  const primeraPalabra = t.split(' ')[0];
  let mejor = null;
  let mejorDist = Infinity;
  for (const i of lista) {
    const n = normalizarNombreProducto(i.nombre);
    const primeraDeN = n.split(' ')[0];
    const d = distanciaLevenshtein(primeraPalabra, primeraDeN);
    const umbral = primeraDeN.length <= 5 ? 1 : Math.min(3, Math.ceil(primeraDeN.length / 4));
    if (d <= umbral && d < mejorDist) {
      mejor = i;
      mejorDist = d;
    }
  }
  return mejor;
}

/** true si el texto parece nombrar uno de los coadyuvantes/adyuvantes conocidos. */
export function esCoadyuvante(texto) {
  const t = normalizarNombreProducto(texto);
  if (!t) return false;
  return COADYUVANTES.some(c => {
    const n = normalizarNombreProducto(c);
    return t === n || t.includes(n) || n.includes(t);
  });
}

/**
 * Interpreta el nombre de un producto (escrito, dictado por voz, u
 * OCR'eado de una foto o planilla) y decide qué es:
 *
 *  - 'activo': coincide con un ingrediente activo de la lista de referencia.
 *    `ingredientes` tiene un solo elemento con ese nombre canónico y la
 *    concentración detectada (si el texto traía un "%").
 *  - 'comercial': coincide con un producto comercial ya aprendido (una
 *    mezcla de 2+ activos, p.ej. "Jinete" = Fluroxipir + Triclopir).
 *    `ingredientes` trae todos los activos guardados para ese producto.
 *  - 'coadyuvante': un adyuvante/coadyuvante conocido (no controla malezas
 *    por sí mismo, así que no hace falta pedir su ingrediente activo).
 *  - 'desconocido': no se pudo identificar — conviene que la persona lo
 *    revise a mano (elegir el/los ingredientes activos, o aprenderlo como
 *    producto comercial nuevo).
 *
 * @param {string} textoOriginal
 * @param {{id:string, nombreNormalizado:string, ingredientes:{nombre:string,concentracion:number|null}[]}[]} [productosComerciales]
 */
function buscarProductoComercialEnLista(textoNormalizado, productosComerciales) {
  if (!textoNormalizado) return null;
  const exacto = productosComerciales.find(p => (p.nombreNormalizado || normalizarNombreProducto(p.nombreComercial)) === textoNormalizado);
  if (exacto) return exacto;
  if (textoNormalizado.length < 3) return null;
  return productosComerciales.find(p => {
    const n = p.nombreNormalizado || normalizarNombreProducto(p.nombreComercial);
    return distanciaLevenshtein(textoNormalizado, n) <= (n.length <= 5 ? 1 : 2);
  }) || null;
}

export function interpretarProducto(textoOriginal, productosComerciales = []) {
  const original = (textoOriginal || '').trim();
  if (!original) {
    return { tipo: 'vacio', ingredientes: [], nombreOriginal: original };
  }

  // 1) ¿Es, tal cual, un producto comercial ya aprendido?
  const comercialDirecto = buscarProductoComercialEnLista(normalizarNombreProducto(original), productosComerciales);
  if (comercialDirecto) {
    return {
      tipo: 'comercial',
      ingredientes: (comercialDirecto.ingredientes || []).map(i => ({ ...i })),
      nombreOriginal: original,
      productoComercial: comercialDirecto
    };
  }

  // 2) ¿Trae varios ingredientes separados por "+" (una mezcla escrita
  // explícitamente, ej. "Fluroxipir 11.53% + Triclopir 34%")? Se interpreta
  // cada parte por separado, sin necesidad de haberla aprendido antes —
  // esto es justamente lo que evita confundir una mezcla con un solo
  // ingrediente activo.
  if (original.includes('+')) {
    const segmentos = original.split('+').map(s => s.trim()).filter(Boolean);
    if (segmentos.length > 1) {
      const interpretados = segmentos.map(seg => {
        const { texto, concentracion } = extraerConcentracion(seg);
        const activo = buscarIngredienteActivo(texto);
        return { nombre: activo ? activo.nombre : texto, concentracion, reconocido: !!activo };
      });
      if (interpretados.some(i => i.reconocido)) {
        return {
          tipo: 'comercial',
          ingredientes: interpretados.map(({ nombre, concentracion }) => ({ nombre, concentracion })),
          nombreOriginal: original
        };
      }
    }
  }

  // 3) Un solo ingrediente activo de la lista de referencia (con o sin %).
  const { texto: sinPct, concentracion } = extraerConcentracion(original);
  const activo = buscarIngredienteActivo(sinPct);
  if (activo) {
    return {
      tipo: 'activo',
      ingredientes: [{ nombre: activo.nombre, concentracion }],
      nombreOriginal: original,
      referencia: activo
    };
  }

  // 4) Coadyuvante/adyuvante conocido (no controla malezas por sí mismo).
  if (esCoadyuvante(sinPct)) {
    return { tipo: 'coadyuvante', ingredientes: [], nombreOriginal: original };
  }

  // 5) Producto comercial aprendido, pero con algún error de tipeo/OCR
  // respecto al texto guardado (ya sin el % si tenía).
  const comercialAproximado = buscarProductoComercialEnLista(normalizarNombreProducto(sinPct), productosComerciales);
  if (comercialAproximado) {
    return {
      tipo: 'comercial',
      ingredientes: (comercialAproximado.ingredientes || []).map(i => ({ ...i })),
      nombreOriginal: original,
      productoComercial: comercialAproximado
    };
  }

  return { tipo: 'desconocido', ingredientes: [], nombreOriginal: original };
}
