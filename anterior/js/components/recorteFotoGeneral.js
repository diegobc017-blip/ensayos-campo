// "Foto general del campo": la persona sube UNA foto aérea/general de todo
// el lote y, ajustando 4 esquinas sobre una cuadrícula que representa los
// bloques y parcelas del diseño, la app recorta automáticamente una foto
// por parcela (usando una transformación afín por celda) y las guarda como
// si se hubieran sacado una por una. No hay GPS ni coordenadas reales del
// lote — el "acomodo" de la cuadrícula a la foto lo hace la persona a mano,
// arrastrando las esquinas hasta que coincidan con los límites del lote en
// la imagen.

import { procesarImagen } from '../utils/imageResize.js';
import { agregarImagen } from '../db/imagenesRepo.js';
import { openModal, showToast } from './ui.js';

const CANVAS_MAX_ANCHO = 420;
const RADIO_MANIJA = 10;
const DIST_TOQUE_MANIJA = 28;

function lerp(p0, p1, t) {
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
}

/** Esquinas (en coordenadas de la imagen original) de la celda [u0,u1]x[v0,v1] de la cuadrícula, por interpolación bilineal de las 4 esquinas exteriores. */
function esquinasCelda(corners, u0, u1, v0, v1) {
  function puntoEn(u, v) {
    const arriba = lerp(corners.tl, corners.tr, u);
    const abajo = lerp(corners.bl, corners.br, u);
    return lerp(arriba, abajo, v);
  }
  return {
    tl: puntoEn(u0, v0), tr: puntoEn(u1, v0),
    bl: puntoEn(u0, v1), br: puntoEn(u1, v1)
  };
}

/**
 * Recorta una celda cuadrilátera de `bitmap` a un canvas de destW×destH,
 * usando una transformación afín (exacta en 3 de las 4 esquinas: TL, TR,
 * BL). Para celdas razonablemente rectangulares (fotos aéreas sin mucha
 * perspectiva) da un resultado visualmente correcto.
 */
function recortarAfin(bitmap, celda, destW, destH) {
  const canvas = document.createElement('canvas');
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext('2d');
  const { tl, tr, bl } = celda;
  const dx1 = tr.x - tl.x, dy1 = tr.y - tl.y;
  const dx2 = bl.x - tl.x, dy2 = bl.y - tl.y;
  const determinante = dx1 * dy2 - dy1 * dx2;
  if (!determinante) return canvas;
  const a = (destW * dy2) / determinante;
  const c = -(dx2 * destW) / determinante;
  const e = -a * tl.x - c * tl.y;
  const b = -(destH * dy1) / determinante;
  const d = (dx1 * destH) / determinante;
  const f = -b * tl.x - d * tl.y;
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(bitmap, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/**
 * @param {{ensayo:object, bloques:object[], celdasPorBloque:Map, tratamientosPorId:Map, onGuardado:()=>Promise<void>}} opciones
 */
export function abrirRecorteFotoGeneral({ ensayo, bloques, celdasPorBloque, tratamientosPorId, onGuardado }) {
  const filas = bloques.map(b => celdasPorBloque.get(b.id) || []);
  const numFilas = filas.length;
  const numCols = Math.max(...filas.map(f => f.length), 1);

  openModal((box, close) => pintarPaso1(box, close));

  function pintarPaso1(box, close) {
    box.innerHTML = `
      <h3>Foto general del campo</h3>
      <p class="field-hint">Subí una foto aérea o general de todo el lote (sacada desde arriba o desde un punto alto). Después vas a ajustar una cuadrícula sobre la foto para que la app recorte sola la foto de cada una de las ${numFilas * numCols} parcelas (${numFilas} bloque(s) × ${numCols} parcela(s)).</p>
      <input type="file" id="foto-general-input" accept="image/*" hidden>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-elegir-foto" type="button">📷 Elegir foto</button>
      </div>
      <div class="btn-row">
        <button class="btn" id="btn-cerrar-paso1" type="button">Cancelar</button>
      </div>
    `;
    box.querySelector('#btn-elegir-foto').addEventListener('click', () => box.querySelector('#foto-general-input').click());
    box.querySelector('#btn-cerrar-paso1').addEventListener('click', close);
    box.querySelector('#foto-general-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      box.innerHTML = '<p class="field-hint">Cargando foto...</p>';
      try {
        const bitmap = await createImageBitmap(file);
        pintarPaso2(box, close, bitmap);
      } catch (err) {
        console.error(err);
        showToast('No se pudo abrir la foto', 'error');
        pintarPaso1(box, close);
      }
    });
  }

  function pintarPaso2(box, close, bitmap) {
    const dispW = Math.min(CANVAS_MAX_ANCHO, bitmap.width);
    const dispH = Math.round(bitmap.height * (dispW / bitmap.width));

    box.innerHTML = `
      <h3>Ajustá la cuadrícula</h3>
      <p class="field-hint">Arrastrá los 4 puntos verdes hasta las esquinas del área con las parcelas. Las líneas muestran cómo se va a recortar cada una — no cambia el diseño ni el orden de los tratamientos, es solo para ubicar el recorte en la foto.</p>
      <div style="display:flex;justify-content:center">
        <canvas id="canvas-ajuste" width="${dispW}" height="${dispH}" style="touch-action:none;max-width:100%;border-radius:8px"></canvas>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-continuar" type="button">Vista previa de los recortes</button>
        <button class="btn" id="btn-cancelar-paso2" type="button">Cancelar</button>
      </div>
    `;

    const canvas = box.querySelector('#canvas-ajuste');
    const ctx = canvas.getContext('2d');

    const inset = 0.12;
    const corners = {
      tl: { x: bitmap.width * inset, y: bitmap.height * inset },
      tr: { x: bitmap.width * (1 - inset), y: bitmap.height * inset },
      bl: { x: bitmap.width * inset, y: bitmap.height * (1 - inset) },
      br: { x: bitmap.width * (1 - inset), y: bitmap.height * (1 - inset) }
    };

    const aPantalla = (p) => ({ x: p.x * (dispW / bitmap.width), y: p.y * (dispH / bitmap.height) });
    const aImagen = (p) => ({ x: p.x * (bitmap.width / dispW), y: p.y * (bitmap.height / dispH) });

    function dibujar() {
      ctx.clearRect(0, 0, dispW, dispH);
      ctx.drawImage(bitmap, 0, 0, dispW, dispH);
      ctx.strokeStyle = '#2e7d32';
      ctx.lineWidth = 2;
      for (let r = 0; r <= numFilas; r++) {
        const v = r / numFilas;
        const izq = aPantalla(lerp(corners.tl, corners.bl, v));
        const der = aPantalla(lerp(corners.tr, corners.br, v));
        ctx.beginPath(); ctx.moveTo(izq.x, izq.y); ctx.lineTo(der.x, der.y); ctx.stroke();
      }
      for (let c = 0; c <= numCols; c++) {
        const u = c / numCols;
        const arr = aPantalla(lerp(corners.tl, corners.tr, u));
        const aba = aPantalla(lerp(corners.bl, corners.br, u));
        ctx.beginPath(); ctx.moveTo(arr.x, arr.y); ctx.lineTo(aba.x, aba.y); ctx.stroke();
      }
      ctx.fillStyle = '#2e7d32';
      Object.values(corners).forEach(p => {
        const s = aPantalla(p);
        ctx.beginPath(); ctx.arc(s.x, s.y, RADIO_MANIJA, 0, Math.PI * 2); ctx.fill();
      });
    }
    dibujar();

    let arrastrando = null;
    function posDesdeEvento(e) {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      return { x: cx * (canvas.width / rect.width), y: cy * (canvas.height / rect.height) };
    }
    function esquinaCercana(pos) {
      let mejor = null, mejorD = Infinity;
      for (const k of Object.keys(corners)) {
        const s = aPantalla(corners[k]);
        const d = Math.hypot(s.x - pos.x, s.y - pos.y);
        if (d < DIST_TOQUE_MANIJA && d < mejorD) { mejor = k; mejorD = d; }
      }
      return mejor;
    }
    function onDown(e) {
      const pos = posDesdeEvento(e);
      arrastrando = esquinaCercana(pos);
      if (arrastrando) e.preventDefault();
    }
    function onMove(e) {
      if (!arrastrando) return;
      e.preventDefault();
      corners[arrastrando] = aImagen(posDesdeEvento(e));
      dibujar();
    }
    function onUp() { arrastrando = null; }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    box.querySelector('#btn-cancelar-paso2').addEventListener('click', () => {
      window.removeEventListener('pointerup', onUp);
      close();
    });
    box.querySelector('#btn-continuar').addEventListener('click', () => {
      window.removeEventListener('pointerup', onUp);
      pintarPaso3(box, close, bitmap, corners);
    });
  }

  function pintarPaso3(box, close, bitmap, corners) {
    box.innerHTML = '<p class="field-hint">Generando los recortes...</p>';
    const destW = 480, destH = 360;

    const recortes = [];
    for (let r = 0; r < numFilas; r++) {
      for (let c = 0; c < filas[r].length; c++) {
        const celda = filas[r][c];
        const cuad = esquinasCelda(corners, c / numCols, (c + 1) / numCols, r / numFilas, (r + 1) / numFilas);
        recortes.push({ celda, bloqueId: bloques[r].id, canvas: recortarAfin(bitmap, cuad, destW, destH) });
      }
    }

    box.innerHTML = `
      <h3>Revisá los recortes</h3>
      <p class="field-hint">Se va a guardar una foto para cada una de las ${recortes.length} parcelas. Si alguna no quedó bien encuadrada, volvé a ajustar la cuadrícula.</p>
      <div id="grilla-preview" style="display:grid;grid-template-columns:repeat(${numCols},1fr);gap:4px"></div>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-guardar-recortes" type="button">Guardar estas fotos</button>
        <button class="btn" id="btn-volver-ajuste" type="button">Volver a ajustar</button>
        <button class="btn" id="btn-cancelar-paso3" type="button">Cancelar</button>
      </div>
    `;
    const grilla = box.querySelector('#grilla-preview');
    recortes.forEach(({ celda, canvas }) => {
      const t = tratamientosPorId.get(celda.tratamientoId);
      const wrap = document.createElement('div');
      wrap.style.textAlign = 'center';
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/jpeg', 0.7);
      img.style.width = '100%';
      img.style.borderRadius = '6px';
      wrap.appendChild(img);
      const etiqueta = document.createElement('div');
      etiqueta.className = 'field-hint';
      etiqueta.textContent = `${t ? t.codigo : '?'} · pos.${celda.posicion + 1}`;
      wrap.appendChild(etiqueta);
      grilla.appendChild(wrap);
    });

    box.querySelector('#btn-volver-ajuste').addEventListener('click', () => pintarPaso2(box, close, bitmap));
    box.querySelector('#btn-cancelar-paso3').addEventListener('click', close);
    box.querySelector('#btn-guardar-recortes').addEventListener('click', async () => {
      const btnGuardar = box.querySelector('#btn-guardar-recortes');
      btnGuardar.disabled = true;
      btnGuardar.textContent = 'Guardando...';
      try {
        for (const { celda, bloqueId, canvas } of recortes) {
          const blobRecorte = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
          const { blob, thumbnailBlob } = await procesarImagen(blobRecorte);
          await agregarImagen({
            ensayoId: ensayo.id,
            bloqueId,
            celdaId: celda.id,
            etapa: 'recorte-foto-general',
            blob,
            thumbnailBlob,
            nombreArchivo: 'recorte-foto-general.jpg'
          });
        }
        showToast(`${recortes.length} foto(s) agregada(s), una por parcela`);
        close();
        await onGuardado();
      } catch (err) {
        console.error(err);
        showToast('Hubo un problema guardando las fotos', 'error');
        btnGuardar.disabled = false;
        btnGuardar.textContent = 'Guardar estas fotos';
      }
    });
  }
}
