import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const html = read('index.html');

test('las dos imágenes redundantes sobre la demo de pagos ya no están (ni su clave i18n)', () => {
  assert.ok(!html.includes('image-grid'));
  assert.ok(!html.includes('embedded-11.webp') && !html.includes('embedded-12.jpeg'));
  assert.ok(!read('data/translations.json').includes('Visuales del perfil de desarrollador'));
  assert.ok(!read('i18n-data.js').includes('Visuales del perfil de desarrollador'));
  // La demo de pagos conserva su etiqueta, su aviso y su botón.
  for (const part of ['id="pagos"', 'class="demo-badge">Demostración<', 'id="pay-note"', '>Realizar pago<']) assert.ok(html.includes(part), part);
});

test('la escena 3D se precarga desde el propio sitio y solo cuando habrá escena', () => {
  assert.ok(!/<link rel="modulepreload"/.test(html), 'la precarga la decide el cargador (no en el HTML)');
  assert.match(html, /<script src="\/hero3d-loader\.js" async><\/script>/);
  assert.match(html, /<link rel="preload" as="image" href="\/assets\/hero-3d-fallback\.webp"/);
  const loader = read('hero3d-loader.js');
  assert.match(loader, /preload\.rel = 'modulepreload'/);
  assert.match(loader, /preload\.href = '\/hero3d\.js'/);
  assert.match(loader, /first-contentful-paint/, 'el módulo se ejecuta tras el primer pintado');
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

test('capturas de teléfono del catálogo se muestran completas (contain, sin cover)', () => {
  const css = read('base.css');
  const page = read('index.html');
  assert.match(css, /\.project-media img\.phone-shot\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /data-project-id="evidencia-visual"[^\n]*\.project-media/);
  assert.match(css, /data-project-id="formatos-pdf-excel"[^\n]*\.project-media/);
  assert.match(css, /data-project-id="control-gastos-pro"[^\n]*\.project-media/);
  assert.match(css, /aspect-ratio:\s*9\s*\/\s*20/);
  for (const id of ['evidencia-visual', 'formatos-pdf-excel', 'control-gastos-pro']) {
    assert.match(page, new RegExp(`data-project-id="${id}"[\\s\\S]*?class="phone-shot"`), id);
  }
});
