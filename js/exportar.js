// exportar.js — generación de archivos en el propio equipo, sin internet:
// ZIP, Word (.docx), Excel (.xlsx, con SheetJS local), CSV, GeoJSON + estilo QGIS y KML.

/* ---------------- ZIP (con compresión si el navegador la soporta) ---------------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const enc = new TextEncoder();
async function deflar(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try { const cs = new CompressionStream('deflate-raw'); const out = new Response(new Blob([u8]).stream().pipeThrough(cs)); return new Uint8Array(await out.arrayBuffer()); } catch (e) { return null; }
}
export async function crearZip(archivos) { // [{nombre, datos: string | Uint8Array}]
  const partes = [], central = []; let off = 0; const d = new Date();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const a of archivos) {
    const nom = enc.encode(a.nombre), datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos, crc = crc32(datos);
    const comp = await deflar(datos), usa = comp && comp.length < datos.length, cuerpo = usa ? comp : datos, met = usa ? 8 : 0;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, met, true); h.setUint16(10, hora, true); h.setUint16(12, dia, true);
    h.setUint32(14, crc, true); h.setUint32(18, cuerpo.length, true); h.setUint32(22, datos.length, true); h.setUint16(26, nom.length, true); h.setUint16(28, 0, true);
    partes.push(new Uint8Array(h.buffer), nom, cuerpo);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, met, true); c.setUint16(12, hora, true); c.setUint16(14, dia, true);
    c.setUint32(16, crc, true); c.setUint32(20, cuerpo.length, true); c.setUint32(24, datos.length, true); c.setUint16(28, nom.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nom); off += 30 + nom.length + cuerpo.length;
  }
  const tam = central.reduce((s, x) => s + x.length, 0), fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true); fin.setUint32(12, tam, true); fin.setUint32(16, off, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], {type: 'application/zip'});
}

/* ---------------- Word (.docx) ---------------- */
const x = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const run = (t, o = {}) => `<w:r>${o.b || o.i || o.sz || o.color ? `<w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
const runs = c => (Array.isArray(c) ? c : [c]).map(p => typeof p === 'string' ? run(p) : run(p.t, p)).join('');
const par = (c, {estilo, jc, antes, despues} = {}) => `<w:p>${estilo || jc || antes != null || despues != null ? `<w:pPr>${estilo ? `<w:pStyle w:val="${estilo}"/>` : ''}${antes != null || despues != null ? `<w:spacing w:before="${antes ?? 0}" w:after="${despues ?? 120}"/>` : ''}${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr>` : ''}${runs(c)}</w:p>`;
function tabla(cab, filas, {anchos, num = []} = {}) {
  const n = cab.length, w = anchos || Array(n).fill(Math.floor(9000 / n));
  const celda = (t, i, h) => `<w:tc><w:tcPr><w:tcW w:w="${w[i]}" w:type="dxa"/>${h ? '<w:shd w:val="clear" w:color="auto" w:fill="E3EDE6"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${num.includes(i) && !h ? '<w:jc w:val="right"/>' : ''}</w:pPr>${h ? run(t, {b: true, sz: 18}) : runs(typeof t === 'object' && t !== null && !Array.isArray(t) ? t : String(t ?? ''))}</w:p></w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="B8C4BC"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>
    <w:tblGrid>${w.map(v => `<w:gridCol w:w="${v}"/>`).join('')}</w:tblGrid>
    <w:tr><w:trPr><w:tblHeader/></w:trPr>${cab.map((c, i) => celda(c, i, true)).join('')}</w:tr>${filas.map(f => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${f.map((c, i) => celda(c, i, false)).join('')}</w:tr>`).join('')}</w:tbl>${par('', {despues: 80})}`;
}
function imagen(rid, id, anchoCm, altoCm) {
  const cx = Math.round(anchoCm * 360000), cy = Math.round(altoCm * 360000);
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Grafico ${id}"/>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
    <pic:nvPicPr><pic:cNvPr id="${id}" name="grafico${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
    <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
// bloques: {h1|h2|h3: texto} | {p: texto o [{t,b,i}]} | {tabla: {cab, filas, anchos, num}} | {img: Uint8Array png, ancho, alto (cm)} | {salto: true}
export async function crearDocx(bloques, {titulo = 'Informe', autor = ''} = {}) {
  const imgs = []; let body = '';
  for (const b of bloques) {
    if (b.h1) body += par(b.h1, {estilo: 'Heading1'}); else if (b.h2) body += par(b.h2, {estilo: 'Heading2'}); else if (b.h3) body += par(b.h3, {estilo: 'Heading3'});
    else if (b.titulo) body += par(b.titulo, {estilo: 'Title'});
    else if (b.p != null) body += par(b.p, {jc: b.jc}); else if (b.nota) body += par([{t: b.nota, i: true, sz: 18, color: '5D6B62'}]);
    else if (b.tabla) body += tabla(b.tabla.cab, b.tabla.filas, b.tabla);
    else if (b.img) { imgs.push({d: b.img, ext: b.jpg ? 'jpeg' : 'png'}); body += imagen('rImg' + imgs.length, imgs.length, b.ancho || 15, b.alto || 7.5); }
    else if (b.salto) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1200" w:bottom="1300" w:left="1300" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:lang w:val="es-PY"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="1F6B52"/><w:sz w:val="36"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F6B52"/><w:sz w:val="28"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="140" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="5D6B62"/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rEst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imgs.map((_, i) => `<Relationship Id="rImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/grafico${i + 1}.${imgs[i].ext}"/>`).join('')}</Relationships>`;
  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const raiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(titulo)}</dc:title><dc:creator>${x(autor)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${ahora}</dcterms:created></cp:coreProperties>`;
  const zip = await crearZip([{nombre: '[Content_Types].xml', datos: tipos}, {nombre: '_rels/.rels', datos: raiz}, {nombre: 'docProps/core.xml', datos: core}, {nombre: 'word/document.xml', datos: doc},
    {nombre: 'word/styles.xml', datos: estilos}, {nombre: 'word/_rels/document.xml.rels', datos: rels}, ...imgs.map((im, i) => ({nombre: `word/media/grafico${i + 1}.${im.ext}`, datos: im.d}))]);
  return new Blob([zip], {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

/* ---------------- Excel ---------------- */
let XL = null;
export async function crearXlsx(hojas) { // [{nombre, filas: [[...]], anchos?: [n]}]
  XL = XL || await import('./vendor/xlsx/xlsx.esm.min.mjs');
  const wb = XL.utils.book_new();
  hojas.forEach(h => { const ws = XL.utils.aoa_to_sheet(h.filas); ws['!cols'] = (h.anchos || h.filas[0]?.map((_, i) => Math.min(48, Math.max(8, ...h.filas.slice(0, 200).map(f => String(f[i] ?? '').length + 2))))).map(w => ({wch: w}));
    XL.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ')); });
  const out = XL.write(wb, {bookType: 'xlsx', type: 'array', compression: true});
  return new Blob([out], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

/* ---------------- CSV (separador ; y coma decimal opcional, con BOM para Excel) ---------------- */
export function crearCsv(filas, {sep = ';', coma = false} = {}) {
  const c = v => { if (v == null) return ''; let t = typeof v === 'number' ? (coma ? String(v).replace('.', ',') : String(v)) : String(v); return /[";\n\r]/.test(t) || t.includes(sep) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return '﻿' + filas.map(f => f.map(c).join(sep)).join('\r\n');
}

/* ---------------- Mapas: GeoJSON + estilo QGIS (.qml) y KML ---------------- */
export function crearGeojson(nombre, features) { return JSON.stringify({type: 'FeatureCollection', name: nombre, crs: {type: 'name', properties: {name: 'urn:ogc:def:crs:OGC:1.3:CRS84'}}, features}); }
export function crearQml(campo, categorias) { // categorías: [{valor, etiqueta, color}]
  const sym = (i, c) => `<symbol type="fill" name="${i}" alpha="0.75" clip_to_extent="1" force_rhr="0"><layer class="SimpleFill" enabled="1" pass="0" locked="0"><Option type="Map"><Option name="color" type="QString" value="${c}"/><Option name="outline_color" type="QString" value="35,35,35,255"/><Option name="outline_width" type="QString" value="0.3"/><Option name="style" type="QString" value="solid"/></Option></layer></symbol>`;
  const rgb = h => { const n = parseInt(h.slice(1), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255},255`; };
  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'><qgis version="3.28" styleCategories="Symbology|Labeling"><renderer-v2 type="categorizedSymbol" attr="${campo}" enableorderby="0" symbollevels="0" forceraster="0">
  <categories>${categorias.map((c, i) => `<category value="${x(c.valor)}" label="${x(c.etiqueta)}" symbol="${i}" render="true"/>`).join('')}</categories>
  <symbols>${categorias.map((c, i) => sym(i, rgb(c.color))).join('')}</symbols></renderer-v2>
  <labeling type="simple"><settings calloutType="simple"><text-style fieldName="concat(&quot;parcela&quot;, '\\n', &quot;trat&quot;)" isExpression="1" fontSize="8" textColor="20,20,20,255" fontWeight="75"><text-buffer bufferDraw="1" bufferSize="0.8" bufferColor="255,255,255,255"/></text-style><placement placement="1"/></settings></labeling></qgis>`;
}
export function crearKml(nombre, plac) { // plac: [{nombre, desc, anillo: [[lon,lat],...], color '#rrggbb'}]
  const kc = h => 'b4' + h.slice(5, 7) + h.slice(3, 5) + h.slice(1, 3);
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x(nombre)}</name>
  ${[...new Set(plac.map(p => p.color))].map(c => `<Style id="c${c.slice(1)}"><LineStyle><color>ff333333</color><width>1</width></LineStyle><PolyStyle><color>${kc(c)}</color></PolyStyle></Style>`).join('')}
  ${plac.map(p => `<Placemark><name>${x(p.nombre)}</name><description><![CDATA[${p.desc}]]></description><styleUrl>#c${p.color.slice(1)}</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${p.anillo.map(([lo, la]) => `${lo.toFixed(8)},${la.toFixed(8)},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`).join('')}
  </Document></kml>`;
}
/* Polígonos de parcelas a partir de una esquina GPS, el rumbo y las medidas */
export function poligonosCroquis(parcelas, g) { // g: {lat, lon, rumbo, ancho, largo, sepP, calle}
  const r = g.rumbo * Math.PI / 180, mLat = 111320, mLon = 111320 * Math.cos(g.lat * Math.PI / 180);
  const pt = (xm, ym) => { const e = xm * Math.sin(r) + ym * Math.sin(r + Math.PI / 2), n = xm * Math.cos(r) + ym * Math.cos(r + Math.PI / 2); return [g.lon + e / mLon, g.lat + n / mLat]; };
  return Object.fromEntries(parcelas.map(p => { const c = (p.parcela % 100) - 1, b = p.bloque - 1, x0 = c * (g.ancho + (g.sepP || 0)), y0 = b * (g.largo + (g.calle || 0));
    return [p.parcela, [pt(x0, y0), pt(x0 + g.ancho, y0), pt(x0 + g.ancho, y0 + g.largo), pt(x0, y0 + g.largo), pt(x0, y0)]]; }));
}

/* ---------------- Gráfico de barras como PNG (para el Word) ---------------- */
export async function graficoBarras({titulo, unidad, barras}) { // barras: [{etiqueta, valor, color, letra}]
  const W = 1200, H = 560, m = {l: 110, r: 30, t: 70, b: 70}, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const hi = Math.max(...barras.map(b => b.valor), 0) * 1.15 || 1, ys = v => m.t + (H - m.t - m.b) * (1 - v / hi), bw = (W - m.l - m.r) / barras.length;
  g.font = 'bold 30px Calibri, Arial, sans-serif'; g.fillStyle = '#18221c'; g.fillText(titulo, m.l, 42);
  g.font = '22px Calibri, Arial, sans-serif'; g.textAlign = 'right'; g.fillStyle = '#5d6b62'; g.strokeStyle = '#d9e0da'; g.lineWidth = 2;
  for (let k = 0; k <= 4; k++) { const v = hi * k / 4, y = ys(v); g.beginPath(); g.moveTo(m.l, y); g.lineTo(W - m.r, y); g.stroke(); g.fillText(v >= 100 ? Math.round(v).toLocaleString('es-PY') : v.toFixed(v >= 10 ? 1 : 2).replace('.', ','), m.l - 12, y + 8); }
  g.save(); g.translate(28, (m.t + H - m.b) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText(unidad || '', 0, 0); g.restore();
  barras.forEach((b, i) => { const x0 = m.l + i * bw + bw * .18, w = bw * .64, y = ys(b.valor); g.fillStyle = b.color; g.beginPath(); g.roundRect ? g.roundRect(x0, y, w, ys(0) - y, [6, 6, 0, 0]) : g.rect(x0, y, w, ys(0) - y); g.fill();
    g.textAlign = 'center'; g.fillStyle = '#18221c'; g.font = 'bold 26px Calibri, Arial, sans-serif'; if (b.letra) g.fillText(b.letra, x0 + w / 2, y - 10);
    g.font = '22px Calibri, Arial, sans-serif'; g.fillStyle = '#5d6b62'; g.fillText(b.etiqueta, x0 + w / 2, H - m.b + 32); });
  const blob = await new Promise(ok => c.toBlob(ok, 'image/png')); return new Uint8Array(await blob.arrayBuffer());
}
