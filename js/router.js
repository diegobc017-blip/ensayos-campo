const rutas = [];

function compilarPatron(patron) {
  const nombres = [];
  const regexStr = patron
    .split('/')
    .map(seg => {
      if (seg.startsWith(':')) {
        nombres.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp('^' + regexStr + '$'), nombres };
}

export function ruta(patron, handler) {
  rutas.push({ ...compilarPatron(patron), handler });
}

export function navegar(hash) {
  if (location.hash === hash) {
    resolverRuta();
  } else {
    location.hash = hash;
  }
}

function resolverRuta() {
  const path = (location.hash || '#/').slice(1) || '/';
  for (const r of rutas) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.nombres.forEach((nombre, i) => { params[nombre] = decodeURIComponent(m[i + 1]); });
      r.handler(params);
      return;
    }
  }
  console.warn('Ruta no encontrada:', path);
}

export function iniciarRouter() {
  window.addEventListener('hashchange', resolverRuta);
  resolverRuta();
}
