import { showToast } from './ui.js';

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * Agrega un botón de micrófono al lado de un <input> o <textarea> para
 * dictar el contenido por voz en vez de escribirlo. Si el navegador no
 * soporta reconocimiento de voz (o la página no corre en un contexto
 * seguro: https o localhost), no agrega nada y el campo sigue
 * funcionando normal con el teclado.
 *
 * Usa reconocimiento continuo: un toque para empezar a hablar, el texto
 * se va agregando a medida que se reconoce, y otro toque (o silencio
 * prolongado) para terminar.
 */
export function habilitarDictado(campo) {
  if (!SpeechRecognitionCtor || !window.isSecureContext) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'campo-dictado' + (campo.tagName === 'TEXTAREA' ? ' campo-dictado-multilinea' : '');
  campo.parentNode.insertBefore(wrapper, campo);
  wrapper.appendChild(campo);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-dictado';
  btn.setAttribute('aria-label', 'Dictar por voz');
  btn.title = 'Dictar por voz';
  btn.textContent = '🎤';
  wrapper.appendChild(btn);

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'es-AR';
  recognition.continuous = true;
  recognition.interimResults = true;

  let escuchando = false;
  let baseTexto = '';
  let acumulado = '';

  function marcarEscuchando(activo) {
    escuchando = activo;
    btn.classList.toggle('escuchando', activo);
    btn.textContent = activo ? '⏹' : '🎤';
    btn.title = activo ? 'Detener dictado' : 'Dictar por voz';
  }

  btn.addEventListener('click', () => {
    if (escuchando) {
      recognition.stop();
      return;
    }
    baseTexto = campo.value.trim();
    acumulado = '';
    try {
      recognition.start();
    } catch {
      // ya había una sesión de reconocimiento activa; se ignora.
    }
  });

  recognition.addEventListener('start', () => {
    marcarEscuchando(true);
    showToast('Escuchando... tocá de nuevo para terminar');
  });

  recognition.addEventListener('end', () => marcarEscuchando(false));

  recognition.addEventListener('result', (e) => {
    let interino = '';
    let nuevoFinal = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const texto = e.results[i][0].transcript;
      if (e.results[i].isFinal) nuevoFinal += texto;
      else interino += texto;
    }
    if (nuevoFinal.trim()) {
      acumulado = acumulado ? `${acumulado} ${nuevoFinal.trim()}` : nuevoFinal.trim();
    }
    campo.value = [baseTexto, acumulado, interino.trim()].filter(Boolean).join(' ');
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });

  recognition.addEventListener('error', (e) => {
    marcarEscuchando(false);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      showToast('Para dictar por voz hay que permitir el uso del micrófono', 'error');
    } else if (e.error === 'no-speech') {
      showToast('No se escuchó nada', 'error');
    } else if (e.error === 'network') {
      showToast('El dictado por voz necesita conexión a internet', 'error');
    } else {
      showToast('No se pudo usar el dictado por voz', 'error');
    }
  });
}
