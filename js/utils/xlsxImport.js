// Lee un archivo Excel (.xlsx/.xls) o CSV y devuelve su primera hoja como
// una matriz de filas/celdas (array de arrays), lista para
// `filasDesdeHojaExcel` en tablaImport.js. Usa SheetJS empaquetado
// localmente (js/vendor/xlsx/), así que funciona sin internet, igual que
// el resto de la app.

let xlsxPromise = null;
function cargarXLSX() {
  if (!xlsxPromise) {
    xlsxPromise = import('../vendor/xlsx/xlsx.esm.min.mjs');
  }
  return xlsxPromise;
}

/**
 * @param {File} file
 * @returns {Promise<string[][]>} filas de la primera hoja con datos
 */
export async function leerFilasDeArchivo(file) {
  const XLSX = await cargarXLSX();
  const esCSV = /\.(csv|txt)$/i.test(file.name || '');

  let libro;
  if (esCSV) {
    const texto = await file.text();
    libro = XLSX.read(texto, { type: 'string' });
  } else {
    const buffer = await file.arrayBuffer();
    libro = XLSX.read(buffer, { type: 'array' });
  }

  // Toma la primera hoja que tenga contenido.
  let hoja = null;
  for (const nombre of libro.SheetNames) {
    const candidata = libro.Sheets[nombre];
    if (candidata && candidata['!ref']) { hoja = candidata; break; }
  }
  if (!hoja) return [];

  return XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: false });
}
