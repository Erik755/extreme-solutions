// Capturas auténticas: cambia solo la imagen del escaparate, nunca la aplicación.
(() => {
  const figure = document.querySelector('.hero-phone');
  if (!figure) return;
  const rig = figure.querySelector('.hero-phone-rig');
  const header = figure.closest('#inicio');
  const screen = figure.querySelector('.hero-phone-screen');
  const slides = [...figure.querySelectorAll('[data-phone-slide]')];
  const controls = figure.querySelector('[data-phone-controls]');
  const buttons = [...controls.querySelectorAll('[data-phone-view]')];
  const caption = figure.querySelector('[data-phone-caption]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const precise = matchMedia('(hover: hover) and (pointer: fine)');
  const stage = figure.querySelector('.hero-phone-stage');
  const motionButton = document.createElement('button');
  motionButton.type = 'button';
  motionButton.dataset.phoneMotion = '';
  motionButton.hidden = true;
  controls.append(motionButton);
  let selected = 0;
  let request = 0;
  let frame = 0;
  let sway = null;
  let visible = false;
  let userPaused = false;
  let touchPointer = null;
  const copy = {
    es: {
      label: 'Capturas reales de Reporte Servicio Pro', subtitle: 'Android · Capturas reales de la app', controls: 'Cambiar captura del teléfono', whatsapp: 'Escríbenos por WhatsApp',
      views: ['Reporte', 'Evidencia', 'Excel'],
      descriptions: ['Tu servicio, documentado desde el teléfono.', 'Fotos y anotaciones para explicar cada hallazgo.', 'Un reporte real, listo para compartir.'],
      alts: ['Formulario de Reporte Servicio Pro con datos de demostración', 'Editor de evidencia con una fotografía industrial anotada', 'Ejemplo real de un reporte exportado a Excel'],
      error: 'No se pudo cargar esta captura. Puedes consultar la ficha de la app.',
      pause: 'Pausar movimiento', resume: 'Reanudar movimiento'
    },
    en: {
      label: 'Real screenshots of Reporte Servicio Pro', subtitle: 'Android · Real app screenshots', controls: 'Change the phone screenshot', whatsapp: 'Message us on WhatsApp',
      views: ['Report', 'Evidence', 'Excel'],
      descriptions: ['Your service, documented from your phone.', 'Photos and annotations to explain every finding.', 'A real report, ready to share.'],
      alts: ['Reporte Servicio Pro form with demonstration data', 'Evidence editor with an annotated industrial photograph', 'Real example of a report exported to Excel'],
      error: 'This screenshot could not be loaded. You can visit the app details.',
      pause: 'Pause motion', resume: 'Resume motion'
    }
  };
  const dictionary = () => copy[document.documentElement.lang === 'en' ? 'en' : 'es'];
  const syncMotionButton = () => {
    motionButton.hidden = precise.matches || reduced.matches || Boolean(navigator.connection?.saveData) || typeof rig.animate !== 'function' || typeof IntersectionObserver !== 'function';
    motionButton.textContent = dictionary()[userPaused ? 'resume' : 'pause'];
    motionButton.dataset.phonePaused = String(userPaused);
  };
  const syncLanguage = () => {
    const text = dictionary();
    figure.setAttribute('aria-label', text.label);
    controls.setAttribute('aria-label', text.controls);
    figure.querySelector('[data-phone-label="subtitle"]').textContent = text.subtitle;
    const whatsappLabel = header.querySelector('[data-phone-label="whatsapp"]');
    if (whatsappLabel) whatsappLabel.textContent = text.whatsapp;
    buttons.forEach((button, index) => { button.textContent = text.views[index]; });
    slides.forEach((slide, index) => { slide.alt = text.alts[index]; });
    caption.textContent = text.descriptions[selected];
    syncMotionButton();
  };
  const choose = async index => {
    if (!slides[index]) return;
    const pending = ++request;
    if (index === selected) {
      screen.removeAttribute('aria-busy');
      caption.textContent = dictionary().descriptions[selected];
      return;
    }
    const next = slides[index];
    screen.setAttribute('aria-busy', 'true');
    next.loading = 'eager';
    try {
      await next.decode();
      if (pending !== request) return;
      selected = index;
      slides.forEach((slide, position) => { slide.hidden = position !== index; });
      buttons.forEach((button, position) => { button.setAttribute('aria-pressed', String(position === index)); });
      caption.textContent = dictionary().descriptions[index];
    } catch {
      if (pending === request) caption.textContent = dictionary().error;
    } finally {
      if (pending === request) screen.removeAttribute('aria-busy');
    }
  };
  buttons.forEach(button => button.addEventListener('click', () => choose(Number(button.dataset.phoneView))));
  controls.hidden = false;
  syncLanguage();
  window.addEventListener('extreme:languagechange', syncLanguage);

  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    rig.style.removeProperty('--phone-x');
    rig.style.removeProperty('--phone-y');
  };
  const stopSway = () => {
    if (sway) sway.cancel();
    sway = null;
  };
  const allowed = () => !reduced.matches && !navigator.connection?.saveData && !document.hidden;
  const syncMotion = () => {
    syncMotionButton();
    const usingControls = controls.contains(document.activeElement) && document.activeElement !== motionButton;
    if (!allowed() || precise.matches || !visible || userPaused || usingControls || touchPointer !== null || typeof rig.animate !== 'function') {
      stopSway();
      if (touchPointer === null || !allowed()) reset();
      return;
    }
    if (sway) return;
    reset();
    // La animación nativa se cancela fuera de pantalla; no hay un bucle JS en segundo plano.
    sway = rig.animate([
      { transform: 'rotateX(6deg) rotateY(-10deg) rotateZ(30deg)' },
      { transform: 'rotateX(10deg) rotateY(-4deg) rotateZ(32deg)' },
      { transform: 'rotateX(6deg) rotateY(-10deg) rotateZ(30deg)' },
      { transform: 'rotateX(2deg) rotateY(-16deg) rotateZ(28deg)' },
      { transform: 'rotateX(6deg) rotateY(-10deg) rotateZ(30deg)' }
    ], { duration: 6000, iterations: Infinity, easing: 'ease-in-out' });
  };
  motionButton.addEventListener('click', () => {
    userPaused = !userPaused;
    syncMotion();
  });
  stage.addEventListener('pointerdown', event => {
    if (!allowed() || userPaused || event.pointerType !== 'touch' || event.isPrimary === false) return;
    touchPointer = event.pointerId;
    stopSway();
    reset();
  }, { passive: true });
  header.addEventListener('pointermove', event => {
    if (!allowed()) return;
    const touch = event.pointerType === 'touch';
    if (touch && userPaused) return;
    if (touch ? touchPointer !== event.pointerId : !precise.matches) return;
    const bounds = (touch ? stage : header).getBoundingClientRect();
    const x = Math.max(-.5, Math.min(.5, (event.clientX - bounds.left) / bounds.width - .5));
    const y = Math.max(-.5, Math.min(.5, (event.clientY - bounds.top) / bounds.height - .5));
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      rig.style.setProperty('--phone-x', `${(6 - y * (touch ? 20 : 44)).toFixed(2)}deg`);
      rig.style.setProperty('--phone-y', `${(-10 + x * (touch ? 26 : 56)).toFixed(2)}deg`);
      frame = 0;
    });
  }, { passive: true });
  const releaseTouch = event => {
    if (event.pointerId !== touchPointer) return;
    touchPointer = null;
    reset();
    syncMotion();
  };
  window.addEventListener('pointerup', releaseTouch, { passive: true });
  window.addEventListener('pointercancel', releaseTouch, { passive: true });
  header.addEventListener('pointerleave', reset, { passive: true });
  header.addEventListener('focusin', () => { reset(); syncMotion(); });
  controls.addEventListener('focusout', () => queueMicrotask(syncMotion));
  const preferenceChanged = () => { touchPointer = null; reset(); syncMotion(); };
  reduced.addEventListener('change', preferenceChanged);
  precise.addEventListener('change', preferenceChanged);
  navigator.connection?.addEventListener?.('change', preferenceChanged);
  document.addEventListener('visibilitychange', preferenceChanged);
  window.addEventListener('pagehide', () => { touchPointer = null; stopSway(); reset(); });
  window.addEventListener('pageshow', syncMotion);
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .2;
      if (!visible) touchPointer = null;
      syncMotion();
    }, { threshold: .2 }).observe(stage);
  }
})();
