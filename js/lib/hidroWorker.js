// Worker: analiza el papel hidrosensible sin trabar la pantalla.
import {analizar, imagenFiltrada} from './hidro.js';
self.onmessage = e => {
  const {id, img, pxmm, op} = e.data;
  try {
    const r = analizar(img, pxmm, op), f = imagenFiltrada(r);
    const g = new Float32Array(r.gotas.length * 6);
    r.gotas.forEach((x, i) => g.set([x.x, x.y, x.s, x.d, x.c, (x.borde ? 1 : 0) + (x.n > 1 ? 2 : 0)], i * 6));
    self.postMessage({id, st: r.st, diag: r.diag, gotas: g, filt: f.data, mask: r.mask, W: r.W, H: r.H}, [g.buffer, f.data.buffer, r.mask.buffer]);
  } catch (err) { self.postMessage({id, error: String(err?.message || err)}); }
};
