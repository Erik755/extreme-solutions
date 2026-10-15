const nav = document.querySelector('.nav');
const menu = document.querySelector('.nav-links');
const toggle = document.querySelector('.menu-toggle');
const mobile = matchMedia('(max-width: 680px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const t = value => window.extremeI18n?.t(value) || value;
const links = [...menu.querySelectorAll('a')];
menu.classList.add('is-enhanced');
toggle.hidden = false;

// Menú móvil: sale desde el botón que lo abre (transform-origin en el disparador) y se cierra
// por el mismo camino. La animación es interrumpible: si se pulsa a mitad, se invierte desde
// el valor en pantalla. Solo se animan transform y opacity (Web Animations API, sin estilos inline).
let menuMotion = null;
function setMenu(open, animated = true) {
  if (!mobile.matches) { menuMotion?.animation.cancel(); menuMotion = null; menu.hidden = false; return; }
  if (menuMotion) {
    if (menuMotion.open !== open) { menuMotion.open = open; if (open) menu.hidden = false; menuMotion.animation.reverse(); }
    return;
  }
  if (!animated || !menu.animate || menu.hidden === !open) { menu.hidden = !open; return; }
  if (open) menu.hidden = false;
  const trigger = toggle.getBoundingClientRect();
  const origin = `${Math.round(trigger.left + trigger.width / 2 - menu.getBoundingClientRect().left)}px 0px`;
  const frames = reduced.matches
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ opacity: 0, transform: 'translateY(-0.5rem) scale(.96)', transformOrigin: origin }, { opacity: 1, transform: 'none', transformOrigin: origin }];
  const animation = menu.animate(frames, { duration: reduced.matches ? 150 : 200, easing: 'cubic-bezier(.23, 1, .32, 1)', direction: open ? 'normal' : 'reverse', fill: 'both' });
  const motion = { animation, open };
  menuMotion = motion;
  animation.onfinish = () => {
    if (menuMotion === motion) menuMotion = null;
    if (!motion.open) menu.hidden = true;
    animation.cancel();
  };
}

function closeMenu(returnFocus = false, animated = true) {
  setMenu(false, animated);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = t('Menú');
  if (returnFocus) toggle.focus();
}
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  setMenu(open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = t(open ? 'Cerrar' : 'Menú');
});
mobile.addEventListener('change', () => closeMenu(false, false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
});
document.addEventListener('click', event => {
  if (!nav.contains(event.target)) closeMenu();
});
links.forEach(link => link.addEventListener('click', () => {
  closeMenu();
  const section = link.hash && document.getElementById(link.hash.slice(1));
  if (!section) return; // Blog y otros enlaces de página mantienen su navegación normal.
  section.setAttribute('tabindex', '-1');
  section.focus({ preventScroll: true });
}));
closeMenu(false, false);
window.addEventListener('extreme:languagechange', () => {
  toggle.textContent = t(toggle.getAttribute('aria-expanded') === 'true' ? 'Cerrar' : 'Menú');
});

const sections = links.map(link => link.hash && document.getElementById(link.hash.slice(1))).filter(Boolean);
let scheduled = false;
function updateNavigation() {
  nav.classList.toggle('is-scrolled', scrollY > 24);
  let active;
  let nearest = -Infinity;
  sections.forEach(section => {
    const top = section.getBoundingClientRect().top;
    if (top <= nav.offsetHeight + 100 && top > nearest) {
      active = section.id;
      nearest = top;
    }
  });
  links.forEach(link => {
    if (link.hash === '#' + active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  scheduled = false;
}
addEventListener('scroll', () => {
  if (!scheduled) { scheduled = true; requestAnimationFrame(updateNavigation); }
}, { passive: true });
addEventListener('resize', updateNavigation);
updateNavigation();

// Revelado al hacer scroll (mejora progresiva): solo el JS oculta, y solo lo que aún está por debajo
// de la pantalla; si el JS no carga o hay "reducir movimiento", todo queda visible desde el inicio.
if ('IntersectionObserver' in window && !reduced.matches) {
  const cards = '.capability, .tool-card, .project';
  const targets = [...document.querySelectorAll(`.section-head, ${cards}, .method-step, .metric:not(.proof-band .metric), .play-card, .badge-list span`)];
  const cardFrames = [{ opacity: 0, transform: 'perspective(900px) translateY(36px) rotateX(9deg) scale(.96)' }, { opacity: 1, transform: 'none' }];
  const softFrames = [{ opacity: 0, transform: 'translateY(24px) scale(.985)' }, { opacity: 1, transform: 'none' }];
  const reveal = (target, order) => {
    if (target.animate) target.animate(target.matches(cards) ? cardFrames : softFrames, {
      duration: target.matches(cards) ? 760 : 650, delay: Math.min(order, 5) * 90,
      easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards'
    });
    target.classList.remove('reveal-pending');
  };
  // Se dispara cuando el elemento ya entró un 15 % en la pantalla, para que la entrada se vea.
  const observer = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting)
      .sort((x, y) => (x.boundingClientRect.top - y.boundingClientRect.top) || (x.boundingClientRect.left - y.boundingClientRect.left))
      .forEach(({ target }, order) => { observer.unobserve(target); reveal(target, order); });
  }, { threshold: .2, rootMargin: '0px 0px -15% 0px' });
  targets.forEach(target => {
    if (target.getBoundingClientRect().top < innerHeight) return; // ya visible al cargar: sin animación
    target.classList.add('reveal-pending');
    observer.observe(target);
  });
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    observer.disconnect();
    document.querySelectorAll('.reveal-pending').forEach(target => target.classList.remove('reveal-pending'));
    document.getAnimations().forEach(animation => animation.cancel());
  });
}

// Producto completo: cada pieza llega desde un ángulo distinto y se asienta una sola vez.
// No se oculta contenido mientras espera: ante cualquier fallo sigue en su posición real.
(() => {
  const band = document.querySelector('.proof-band');
  const pieces = band ? [...band.querySelectorAll('.metric')] : [];
  if (!pieces.length || !('IntersectionObserver' in window) || reduced.matches || navigator.connection?.saveData) return;

  const style = getComputedStyle(band);
  const seconds = (name, fallback) => (parseFloat(style.getPropertyValue(name)) || fallback) * 1000;
  const timing = {
    duration: seconds('--assemble-duration', .6),
    stagger: seconds('--assemble-stagger', .08),
    easing: style.getPropertyValue('--assemble-ease').trim() || 'cubic-bezier(.23, 1, .32, 1)'
  };
  const origins = [[-36, 32, -4], [28, 48, 3], [-28, 48, -3], [36, 32, 4]];
  const active = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach(({ target }) => {
      observer.unobserve(target);
      if (reduced.matches || navigator.connection?.saveData || !target.animate) return;
      const index = pieces.indexOf(target);
      const [x, y, rotation] = origins[index % origins.length];
      const compact = matchMedia('(max-width: 680px)').matches;
      const distance = compact ? .55 : 1;
      const animation = target.animate([
        { opacity: .15, transform: `translate3d(${x * distance}px, ${y * distance}px, 0) rotate(${rotation * distance}deg) scale(.97)`, offset: 0 },
        { opacity: 1, transform: `translate3d(${-x * .06}px, -2px, 0) rotate(0deg) scale(1)`, offset: .8 },
        { opacity: 1, transform: 'none', offset: 1 }
      ], { duration: timing.duration, delay: (index % (compact ? 2 : 4)) * timing.stagger, easing: timing.easing, fill: 'backwards' });
      active.add(animation);
      animation.onfinish = animation.oncancel = () => active.delete(animation);
    });
  }, { threshold: .18, rootMargin: '0px 0px -8% 0px' });

  const settle = () => {
    observer.disconnect();
    active.forEach(animation => animation.cancel());
    active.clear();
  };
  pieces.forEach(piece => observer.observe(piece));
  band.addEventListener('focusin', settle, { once: true });
  reduced.addEventListener('change', () => { if (reduced.matches) settle(); });
  navigator.connection?.addEventListener?.('change', () => { if (navigator.connection.saveData) settle(); });
  window.addEventListener('beforeprint', settle);
})();
