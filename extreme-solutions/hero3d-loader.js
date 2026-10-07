// Carga de la escena 3D de la portada. Este script es async: en cuanto llega decide si habrá escena
// y, solo entonces, precarga el módulo (modulepreload); el módulo se ejecuta tras el primer pintado,
// así no compite con FCP/LCP. Sin WebGL 2, con "reducir movimiento" o con ahorro de datos se queda
// la imagen estática y no se descarga nada.
(() => {
  const reason = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced-motion'
    : navigator.connection?.saveData ? 'save-data'
    : !('WebGL2RenderingContext' in window) ? 'no-webgl' : '';
  if (!reason) {
    const preload = document.createElement('link');
    preload.rel = 'modulepreload';
    preload.href = '/hero3d.js';
    document.head.append(preload);
    // Ocultar el still YA (antes de FCP/DOMContentLoaded si el stage existe): evita el flash
    // del fotograma congelado mientras llega el módulo WebGL.
    const hideStill = () => {
      const stage = document.querySelector('.hero-stage');
      if (stage && !stage.dataset.state) stage.dataset.state = 'loading';
    };
    hideStill();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideStill, { once: true });
  }
  const hasWebGL2 = () => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return false;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return true;
    } catch { return false; }
  };
  const init = () => {
    const stage = document.querySelector('.hero-stage');
    if (!stage) return;
    const fallback = why => { stage.dataset.state = 'fallback'; stage.dataset.reason = why; };
    if (reason) return fallback(reason);
    stage.dataset.state = 'loading';
    const start = () => {
      // El sondeo de WebGL espera a la GPU: se hace con la página ya pintada.
      if (!hasWebGL2()) return fallback('no-webgl');
      import('/hero3d.js')
        .then(module => module.mount(stage))
        .catch(() => { stage.classList.remove('is-live'); fallback('error'); });
    };
    // Tras el primer pintado con contenido (o, como tope, 1.5 s).
    let started = false;
    const go = () => { if (!started) { started = true; setTimeout(start, 0); } };
    try {
      const observer = new PerformanceObserver(list => {
        if (list.getEntriesByName('first-contentful-paint').length) { observer.disconnect(); go(); }
      });
      observer.observe({ type: 'paint', buffered: true });
    } catch { /* sin Paint Timing: se usa el tope */ }
    setTimeout(go, 1500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
