// Página de privacidad: índice activo, buscador y filtros, acordeones animados y enlaces profundos.
(() => {
  const t = value => window.extremeI18n?.t(value) || value;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const policies = [...document.querySelectorAll('details.policy')];
  const tools = document.querySelector('.policy-tools');
  const search = document.querySelector('#policy-search');
  const count = document.querySelector('.policy-count');
  const empty = document.querySelector('.policy-empty');
  let topic = 'all';

  // Acordeones: el contenido entra desde la cabecera y sale por el mismo camino (misma curva
  // invertida). Solo transform y opacity; interrumpible (un segundo clic invierte la animación
  // desde el valor en pantalla). Con movimiento reducido, solo un fundido breve.
  const motions = new WeakMap();
  const isOpen = details => motions.has(details) ? motions.get(details).open : details.open;
  function animate(details, open) {
    const body = details.querySelector('.policy-body');
    const running = motions.get(details);
    if (running) {
      if (running.open !== open) { running.open = open; if (open) details.open = true; running.animation.reverse(); }
      return;
    }
    if (details.open === open) return;
    if (!body.animate) { details.open = open; return; }
    if (open) details.open = true;
    const frames = reduced.matches
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(-0.5rem) scale(.98)' }, { opacity: 1, transform: 'none' }];
    const animation = body.animate(frames, { duration: reduced.matches ? 150 : 220, easing: 'cubic-bezier(.23, 1, .32, 1)', direction: open ? 'normal' : 'reverse', fill: 'both' });
    const motion = { animation, open };
    motions.set(details, motion);
    animation.onfinish = () => {
      if (motions.get(details) === motion) motions.delete(details);
      if (!motion.open) details.open = false;
      animation.cancel();
    };
  }
  policies.forEach(details => details.querySelector('summary').addEventListener('click', event => {
    event.preventDefault();
    const open = !isOpen(details);
    animate(details, open);
    const url = new URL(location.href);
    url.hash = open ? details.id : '';
    history.replaceState(null, '', url);
  }));
  document.querySelectorAll('[data-expand]').forEach(button => button.addEventListener('click', () => {
    const open = button.dataset.expand === 'open';
    policies.filter(details => !details.hidden && isOpen(details) !== open).forEach(details => animate(details, open));
  }));

  // Buscador y filtros por tema.
  function render() {
    const query = normalize(search.value.trim());
    let visible = 0;
    policies.forEach(details => {
      const matchesTopic = topic === 'all' || details.dataset.topics.split(' ').includes(topic);
      const matchesText = !query || normalize(details.textContent).includes(query);
      details.hidden = !(matchesTopic && matchesText);
      if (!details.hidden) visible++;
      if (query && !details.hidden) details.open = true;
    });
    tools.querySelectorAll('[data-topic]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.topic === topic)));
    count.textContent = window.extremeI18n?.language === 'en'
      ? `${visible} of ${policies.length} policies`
      : `${visible} de ${policies.length} políticas`;
    empty.hidden = visible !== 0;
  }
  tools.hidden = false;
  tools.addEventListener('click', event => {
    const button = event.target.closest('[data-topic]');
    if (button) { topic = button.dataset.topic; render(); }
  });
  search.addEventListener('input', render);
  document.querySelector('.policy-clear').addEventListener('click', () => { topic = 'all'; search.value = ''; render(); search.focus(); });
  window.addEventListener('extreme:languagechange', render);
  render();

  // Enlace profundo: /privacidad#lentes abre y muestra esa política.
  const aliases = { 'reporte-de-servicio': 'reporte-de-servicio-danobat', 'reporte-de-servicio-reporter': 'reporte-de-servicio-danobat' };
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id ? document.getElementById(aliases[id] || id) : null;
    if (target?.matches('details.policy')) { target.open = true; target.scrollIntoView({ block: 'start' }); }
  }
  addEventListener('hashchange', openFromHash);
  openFromHash();

  // Índice con la sección activa.
  const links = [...document.querySelectorAll('.privacy-toc a')];
  const sections = links.map(link => document.querySelector(link.hash));
  let scheduled = false;
  function updateToc() {
    let active = sections[0]?.id;
    sections.forEach(section => { if (section.getBoundingClientRect().top <= 160) active = section.id; });
    links.forEach(link => {
      const current = link.hash === '#' + active;
      current ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current');
      if (current && matchMedia('(max-width: 980px)').matches) link.parentElement.parentElement.scrollLeft = link.offsetLeft - 20;
    });
    scheduled = false;
  }
  addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(updateToc); } }, { passive: true });
  updateToc();

  // Entradas suaves al recorrer la página, sin ocultar contenido en CSS.
  if ('IntersectionObserver' in window && !reduced.matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) return;
      target.animate?.([{ opacity: .3, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 450, easing: 'cubic-bezier(.2,.7,.3,1)' });
      observer.unobserve(target);
    }), { threshold: .08 });
    document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
  }
})();
