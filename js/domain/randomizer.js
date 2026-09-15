// Generación de bloques (repeticiones) al azar para un diseño de Bloques
// Completos al Azar (BCA), evitando que un mismo tratamiento quede adyacente
// (misma columna) entre filas consecutivas. Módulo puro: no toca DOM ni DB.

function barajar(array) {
  const copia = array.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Backtracking real: asigna columna por columna, probando candidatos en orden
// aleatorio, y deshace (vuelve atrás) si una rama no puede completarse.
function backtrackPermutacion(tratamientoIds, filaAnterior, filaAnteAnterior, estrictoN2) {
  const columnas = tratamientoIds.length;
  const asignacion = new Array(columnas).fill(null);

  function paso(col, disponibles) {
    if (col === columnas) return asignacion.slice();

    const candidatos = barajar(disponibles);
    for (const t of candidatos) {
      if (filaAnterior && t === filaAnterior[col]) continue;
      if (estrictoN2 && filaAnteAnterior && t === filaAnteAnterior[col]) continue;

      asignacion[col] = t;
      const restantes = disponibles.filter(x => x !== t);
      const resultado = paso(col + 1, restantes);
      if (resultado) return resultado;
      asignacion[col] = null;
    }
    return null;
  }

  return paso(0, tratamientoIds.slice());
}

function contarConflictos(fila, filaAnterior) {
  if (!filaAnterior) return 0;
  let conflictos = 0;
  for (let c = 0; c < fila.length; c++) {
    if (fila[c] === filaAnterior[c]) conflictos++;
  }
  return conflictos;
}

function permutacionAleatoria(tratamientoIds) {
  return barajar(tratamientoIds);
}

function mejorEsfuerzo(tratamientoIds, filaAnterior, intentos = 50) {
  let mejor = null;
  let mejorConflictos = Infinity;
  for (let i = 0; i < intentos; i++) {
    const candidata = permutacionAleatoria(tratamientoIds);
    const conflictos = contarConflictos(candidata, filaAnterior);
    if (conflictos < mejorConflictos) {
      mejor = candidata;
      mejorConflictos = conflictos;
      if (mejorConflictos === 0) break;
    }
  }
  return mejor;
}

// Genera una fila válida respecto a la fila anterior (restricción dura) e,
// idealmente, también distinta de la fila anteanterior (restricción blanda).
function generarFilaValida(tratamientoIds, filaAnterior, filaAnteAnterior) {
  if (tratamientoIds.length >= 2 && filaAnteAnterior) {
    for (let intento = 0; intento < 200; intento++) {
      const fila = backtrackPermutacion(tratamientoIds, filaAnterior, filaAnteAnterior, true);
      if (fila) return { fila, nivel: 'fuerte' };
    }
  }

  if (tratamientoIds.length >= 2) {
    const fila = backtrackPermutacion(tratamientoIds, filaAnterior, null, false);
    if (fila) return { fila, nivel: 'minimo' };
  }

  const fila = mejorEsfuerzo(tratamientoIds, filaAnterior);
  return { fila, nivel: 'conflicto' };
}

function detectarConflictos(filas) {
  const conflictos = [];
  for (let i = 1; i < filas.length; i++) {
    for (let c = 0; c < filas[i].length; c++) {
      if (filas[i][c] === filas[i - 1][c]) {
        conflictos.push({ filaIndice: i, columna: c, filaVecina: i - 1 });
      }
    }
  }
  return conflictos;
}

/**
 * Diseño Completamente al Azar (DCA): a diferencia del BCA, no hay bloques
 * reales que restrinjan el sorteo — cada tratamiento se repite `numBloques`
 * veces y todas esas parcelas se distribuyen al azar en el campo, sin
 * garantizar que cada fila tenga exactamente uno de cada tratamiento ni
 * evitar repeticiones adyacentes. La grilla de filas/columnas resultante es
 * solo para poder ubicar físicamente las parcelas en el mapa de campo.
 *
 * @param {string[]} tratamientoIds
 * @param {number} numBloques - cantidad de repeticiones por tratamiento.
 * @returns {{ filas: string[][], conflictos: Array, niveles: string[] }}
 */
export function generarDisenoDCA(tratamientoIds, numBloques) {
  if (!Array.isArray(tratamientoIds) || tratamientoIds.length === 0) {
    throw new Error('Se necesita al menos un tratamiento');
  }
  if (numBloques < 1) {
    throw new Error('Se necesita al menos una repetición');
  }

  const columnas = tratamientoIds.length;
  const todasLasParcelas = [];
  for (let r = 0; r < numBloques; r++) {
    for (const id of tratamientoIds) todasLasParcelas.push(id);
  }
  const barajadas = barajar(todasLasParcelas);

  const filas = [];
  for (let i = 0; i < barajadas.length; i += columnas) {
    filas.push(barajadas.slice(i, i + columnas));
  }

  return { filas, niveles: filas.map(() => 'aleatorio'), conflictos: [] };
}

/**
 * Diseño de franjas cruzadas (strip-plot): dos factores se aplican en
 * franjas que se cruzan — el Factor A en franjas "horizontales" (una por
 * fila) y el Factor B en franjas "verticales" (una por columna); cada celda
 * de la grilla es la combinación de una franja A y una franja B. Dentro de
 * cada bloque/repetición, el orden de las franjas A y el de las franjas B
 * se sortean de forma independiente.
 *
 * @param {{id:string}[]} nivelesA - niveles del Factor A, en cualquier orden.
 * @param {{id:string}[]} nivelesB - niveles del Factor B, en cualquier orden.
 * @param {(idA:string, idB:string) => string} idCombinacion - devuelve el id
 *   del tratamiento-combinación para un par (A, B) dado.
 * @param {number} numBloques - cantidad de repeticiones.
 * @returns {{ filas: string[][], metaFilas: {replica:number, franjaA:string}[], conflictos: Array }}
 */
export function generarDisenoFranja(nivelesA, nivelesB, idCombinacion, numBloques) {
  if (!Array.isArray(nivelesA) || nivelesA.length === 0) {
    throw new Error('Se necesita al menos un nivel del Factor A');
  }
  if (!Array.isArray(nivelesB) || nivelesB.length === 0) {
    throw new Error('Se necesita al menos un nivel del Factor B');
  }
  if (numBloques < 1) {
    throw new Error('Se necesita al menos un bloque');
  }

  const filas = [];
  const metaFilas = [];

  for (let r = 0; r < numBloques; r++) {
    const ordenA = barajar(nivelesA);
    const ordenB = barajar(nivelesB);
    ordenA.forEach((a, filaEnBloque) => {
      const fila = ordenB.map(b => idCombinacion(a.id, b.id));
      filas.push(fila);
      metaFilas.push({ replica: r + 1, franjaA: a.codigo || `A${filaEnBloque + 1}` });
    });
  }

  return { filas, metaFilas, conflictos: [] };
}

/**
 * @param {string[]} tratamientoIds - ids de tratamientos, en el orden fijado
 *   manualmente por el usuario para la fila 0 (bloque base).
 * @param {number} numBloques - cantidad total de repeticiones a generar.
 * @returns {{ filas: string[][], conflictos: Array, niveles: string[] }}
 */
export function generarDiseno(tratamientoIds, numBloques) {
  if (!Array.isArray(tratamientoIds) || tratamientoIds.length === 0) {
    throw new Error('Se necesita al menos un tratamiento');
  }
  if (numBloques < 1) {
    throw new Error('Se necesita al menos un bloque');
  }

  const filas = [tratamientoIds.slice()];
  const niveles = ['fija'];

  for (let i = 1; i < numBloques; i++) {
    const filaAnterior = filas[i - 1];
    const filaAnteAnterior = i >= 2 ? filas[i - 2] : null;
    const { fila, nivel } = generarFilaValida(tratamientoIds, filaAnterior, filaAnteAnterior);
    filas.push(fila);
    niveles.push(nivel);
  }

  return { filas, niveles, conflictos: detectarConflictos(filas) };
}

/**
 * Valida si asignar `nuevoTratamientoId` a la celda (filaIndice, columna)
 * rompe la regla de no-adyacencia vertical o duplica un tratamiento dentro
 * de la misma fila. Devuelve una lista de strings describiendo conflictos
 * (vacía si no hay ninguno).
 */
export function validarEdicionManual(filas, filaIndice, columna, nuevoTratamientoId) {
  const conflictos = [];
  const filaActual = filas[filaIndice];

  if (filaIndice > 0 && filas[filaIndice - 1][columna] === nuevoTratamientoId) {
    conflictos.push('Queda adyacente al mismo tratamiento del bloque anterior.');
  }
  if (filaIndice < filas.length - 1 && filas[filaIndice + 1][columna] === nuevoTratamientoId) {
    conflictos.push('Queda adyacente al mismo tratamiento del bloque siguiente.');
  }
  const duplicado = filaActual.some((t, c) => c !== columna && t === nuevoTratamientoId);
  if (duplicado) {
    conflictos.push('Ese tratamiento ya está presente en este mismo bloque.');
  }
  return conflictos;
}
