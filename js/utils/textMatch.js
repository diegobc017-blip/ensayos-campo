// Utilidades para interpretar texto leído por OCR: emparejarlo con códigos
// de tratamiento ya cargados (tolerando errores típicos de lectura) y
// separar una línea suelta en "código" + "nombre".

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
