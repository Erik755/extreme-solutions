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
  let selected = 0;
  let request = 0;
  let frame = 0;
  const copy = {
    es: {
      label: 'Capturas reales de Reporte Servicio Pro', subtitle: 'Android · Capturas reales de la app', controls: 'Cambiar captura del teléfono', whatsapp: 'Escríbenos por WhatsApp',
      views: ['Reporte', 'Evidencia', 'Excel'],
      descriptions: ['Tu servicio, documentado desde el teléfono.', 'Fotos y anotaciones para explicar cada hallazgo.', 'Un reporte real, listo para compartir.'],
      alts: ['Formulario de Reporte Servicio Pro con datos de demostración', 'Editor de evidencia con una fotografía industrial anotada', 'Ejemplo real de un reporte exportado a Excel'],
      error: 'No se pudo cargar esta captura. Puedes consultar la ficha de la app.'
    },
    en: {
      label: 'Real screenshots of Reporte Servicio Pro', subtitle: 'Android · Real app screenshots', controls: 'Change the phone screenshot', whatsapp: 'Message us on WhatsApp',
      views: ['Report', 'Evidence', 'Excel'],
      descriptions: ['Your service, documented from your phone.', 'Photos and annotations to explain every finding.', 'A real report, ready to share.'],
      alts: ['Reporte Servicio Pro form with demonstration data', 'Evidence editor with an annotated industrial photograph', 'Real example of a report exported to Excel'],
      error: 'This screenshot could not be loaded. You can visit the app details.'
    }
  };
  const dictionary = () => copy[document.documentElement.lang === 'en' ? 'en' : 'es'];
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
  header.addEventListener('pointermove', event => {
    if (reduced.matches || !precise.matches || navigator.connection?.saveData || event.pointerType === 'touch') return;
    const bounds = header.getBoundingClientRect();
    const x = Math.max(-.5, Math.min(.5, (event.clientX - bounds.left) / bounds.width - .5));
    const y = Math.max(-.5, Math.min(.5, (event.clientY - bounds.top) / bounds.height - .5));
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      rig.style.setProperty('--phone-x', `${(6 - y * 44).toFixed(2)}deg`);
      rig.style.setProperty('--phone-y', `${(-10 + x * 56).toFixed(2)}deg`);
      frame = 0;
    });
  }, { passive: true });
  header.addEventListener('pointerleave', reset, { passive: true });
  header.addEventListener('focusin', reset);
  reduced.addEventListener('change', reset);
  precise.addEventListener('change', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
})();
