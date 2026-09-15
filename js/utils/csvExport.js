function escaparCelda(valor) {
  const s = valor == null ? '' : String(valor);
  if (/[",\n;]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function filasACSV(encabezados, filas) {
  const lineas = [encabezados.map(escaparCelda).join(',')];
  for (const fila of filas) {
    lineas.push(fila.map(escaparCelda).join(','));
  }
  return lineas.join('\r\n');
}

export function descargarCSV(nombreArchivo, encabezados, filas) {
  const csv = '﻿' + filasACSV(encabezados, filas);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
