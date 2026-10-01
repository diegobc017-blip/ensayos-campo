// Orientación (Norte/Sur/Este/Oeste) del mapa de campo: es puramente
// informativa (una referencia para ubicarse al pisar el lote y para el
// informe impreso) — no cambia el diseño, el sorteo ni el orden de los
// bloques/parcelas.

export const ETIQUETAS_PUNTO_CARDINAL = { N: 'Norte', S: 'Sur', E: 'Este', O: 'Oeste' };

const ORDEN_HORARIO = ['N', 'E', 'S', 'O'];

/**
 * A partir de qué punto cardinal está "hacia arriba" en el mapa de campo,
 * calcula los otros tres lados (en sentido horario), para poder mostrar los
 * cuatro puntos cardinales alrededor de la grilla.
 * @param {string} arriba - 'N' | 'S' | 'E' | 'O'
 * @returns {{arriba:string, derecha:string, abajo:string, izquierda:string}|null}
 */
export function calcularLadosOrientacion(arriba) {
  const i = ORDEN_HORARIO.indexOf(arriba);
  if (i < 0) return null;
  return {
    arriba: ORDEN_HORARIO[i],
    derecha: ORDEN_HORARIO[(i + 1) % 4],
    abajo: ORDEN_HORARIO[(i + 2) % 4],
    izquierda: ORDEN_HORARIO[(i + 3) % 4]
  };
}
