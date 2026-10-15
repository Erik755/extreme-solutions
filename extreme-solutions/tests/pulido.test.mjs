import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const html = read('index.html');

test('no regresan las imágenes redundantes ni el módulo/enlace de pagos eliminado', () => {
  assert.ok(!html.includes('image-grid'));
  assert.ok(!html.includes('embedded-11.webp') && !html.includes('embedded-12.jpeg'));
  assert.ok(!read('data/translations.json').includes('Visuales del perfil de desarrollador'));
  assert.ok(!read('i18n-data.js').includes('Visuales del perfil de desarrollador'));
  for (const part of ['id="pagos"', 'href="#pagos"', 'class="pay-note"', 'pay-link', '>Realizar pago<', 'stripe.com']) assert.ok(!html.includes(part), part);
  assert.ok(html.includes('class="capability-note">Uso libre para capacitación personal.'));
});

test('el teléfono precarga su captura original sin descargar WebGL ni la escena anterior', () => {
  assert.ok(!/<link rel="modulepreload"/.test(html), 'el teléfono no requiere un módulo 3D');
  assert.match(html, /<script src="\/hero-phone\.js" defer><\/script>/);
  assert.match(html, /<link rel="preload" as="image" href="\/assets\/embedded-6\.webp"/);
  assert.doesNotMatch(html, /hero3d-loader\.js|hero-3d-fallback\.webp/);
  assert.doesNotMatch(read('hero-phone.js'), /modulepreload|hero3d\.js|WebGL/);
});

test('el revelado al hacer scroll es mejora progresiva', () => {
  const css = read('dynamic.css') + read('base.css') + read('portada.css');
  // Ninguna regla oculta tarjetas por sí sola: solo .reveal-pending, que pone el JS.
  assert.ok(!/(^|[}\s,])\.(capability|tool-card|project)\s*\{[^}]*opacity:\s*0[;\s}]/m.test(css));
  assert.match(read('dynamic.css'), /prefers-reduced-motion: reduce\) \{ \.reveal-pending \{ opacity: 1 !important/);
  const js = read('dynamic.js');
  assert.match(js, /rootMargin: '0px 0px -15% 0px'/);
  assert.match(js, /!reduced\.matches/);
});

test('catálogo: marco premium en todas las tarjetas + phone-shot contain + detalle', () => {
  const css = read('base.css') + read('dynamic.css') + read('portada.css');
  const page = read('index.html');
  const projects = read('lib/projects.js');
  assert.match(css, /\.project-media\s*\{[^}]*height:\s*14\.5rem/s);
  assert.match(css, /\.project-media\s*\{[^}]*min-height:\s*12rem/s);
  assert.match(css, /\.project-media img\s*\{[^}]*border-radius:\s*14px/s);
  assert.match(css, /\.project-media img\s*\{[^}]*background:\s*(?:#[a-f\d]{3,8}|var\(--[\w-]+\))/si);
  assert.match(css, /\.project-media img\.phone-shot\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.project-media:has\(img\.phone-shot\)\s*\{[^}]*height:\s*28rem/s);
  assert.match(css, /\.project-media:has\(img\.phone-shot\)\s*\{[^}]*min-height:\s*22rem/s);
  assert.match(css, /\.project-media img\.phone-shot\s*\{[^}]*border-radius:\s*18px/s);
  assert.doesNotMatch(css, /aspect-ratio:\s*9\s*\/\s*20/);
  assert.doesNotMatch(css, /\.project-media:has\(img\.phone-shot\)\s*\{[^}]*aspect-ratio:\s*9\s*\/\s*16/s);
  assert.match(css, /\.project::after/);
  assert.match(css, /\.detail-media\s*\{/);
  assert.match(css, /\.detail-image--phone/);
  assert.match(projects, /reporte-servicio-pro/);
  assert.match(projects, /detail-media/);
  assert.match(css, /--paper:\s*#F7F5F2\b/i);
  assert.match(css, /--blue:\s*#356B58\b/i);
  assert.match(css, /--white:\s*#FFFDFA\b/i);
  for (const id of ['evidencia-visual', 'formatos-pdf-excel', 'control-gastos-pro', 'reporte-servicio-pro', 'museum-of-you']) {
    assert.match(page, new RegExp(`data-project-id="${id}"[\\s\\S]*?class="phone-shot"`), id);
  }
});

test('privacidad: tarjetas con elevación y foco accesible', () => {
  const css = read('privacy.css') + read('dynamic.css');
  assert.match(css, /\.privacy-card::after/);
  assert.match(css, /\.privacy-toc a:focus-visible/);
  assert.match(css, /\.privacy-back:focus-visible/);
  assert.match(css, /border-radius:\s*var\(--radius-card,\s*16px\)/);
  assert.match(css, /\.footer-links/);
});
