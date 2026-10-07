import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { projects, projectPage } from '../lib/projects.js';

const site = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, site), 'utf8');
const CDN = /(?:cdn\.|unpkg\.com|jsdelivr|cdnjs|esm\.sh|skypack|googleapis\.com\/ajax|threejs\.org\/build)/i;

test('la portada 3D tiene respaldo estático sin WebGL, sin JS y con reducir movimiento', () => {
  const html = read('index.html');
  assert.match(html, /<div class="hero-stage" aria-hidden="true"><canvas class="hero-canvas"><\/canvas><\/div>/);
  const css = read('portada.css');
  assert.match(css, /\.hero-stage\[data-state="fallback"\]::before\s*\{[^}]*url\("\/assets\/hero-3d-fallback\.webp"\)/);
  assert.match(read('index.html'), /<noscript><style>\.hero-stage::before\{[^}]*hero-3d-fallback\.webp/);
  assert.ok(existsSync(new URL('assets/hero-3d-fallback.webp', site)), 'falta la imagen de respaldo');
  // El canvas solo se muestra cuando la escena ya dibuja; antes opacity 0 + visibility hidden.
  assert.match(css, /\.hero-canvas\s*\{[^}]*opacity:\s*0\s*;/);
  assert.match(css, /\.hero-stage\.is-live \.hero-canvas\s*\{\s*opacity:\s*1/);
  // Mientras carga WebGL el still no puede verse (era el flash static→animate).
  assert.match(css, /\.hero-stage\[data-state="loading"\]::before/);
  assert.match(css, /\[data-state="loading"\]::before[\s\S]*?opacity:\s*0/);
  assert.match(css, /\.hero-stage\.is-live::before/);
  const scene = read('src-3d/hero3d.src.js');
  assert.match(scene, /time\s*=\s*2\.4/, 'arranque mid-idle, no pose en reposo');
  assert.match(scene, /smoothFrames\s*>=\s*4/);
  const loader = read('hero3d-loader.js');
  assert.match(loader, /dataset\.state = 'loading'/, 'ocultar still lo antes posible');
  for (const reason of ['reduced-motion', 'save-data', 'no-webgl', 'error']) assert.ok(loader.includes(`'${reason}'`), `falta el respaldo ${reason}`);
  assert.match(loader, /prefers-reduced-motion: reduce/);
  assert.match(loader, /getContext\('webgl2'\)/);
  assert.match(loader, /import\('\/hero3d\.js'\)/, 'el módulo 3D debe cargarse de forma diferida desde el propio sitio');
});

test('sin CDN: todos los scripts y estilos se sirven desde el propio sitio', () => {
  const pages = [read('index.html'), read('privacidad.html'), ...projects.map(p => projectPage(p)), projectPage(projects[0], 'en')];
  for (const html of pages) {
    for (const [, src] of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) assert.ok(!/^(?:https?:)?\/\//.test(src), `script externo: ${src}`);
    for (const [, href] of html.matchAll(/<link[^>]*rel="(?:stylesheet|modulepreload|preload)"[^>]*href="([^"]+)"/g)) assert.ok(!/^(?:https?:)?\/\//.test(href), `recurso externo: ${href}`);
  }
  const files = readdirSync(site).filter(name => /\.(?:js|css)$/.test(name));
  for (const name of files) {
    const text = read(name);
    assert.ok(!CDN.test(text), `${name} referencia un CDN`);
    assert.ok(!/(?:import\s*\(\s*|from\s*)["'`]https?:/.test(text), `${name} importa módulos remotos`);
    assert.ok(!/@import\s+url\(\s*["']?https?:/.test(text), `${name} importa CSS remoto`);
  }
  // El bundle 3D no usa workers ni blobs (no hace falta ampliar la CSP).
  const bundle = read('hero3d.js');
  assert.ok(!/new Worker|importScripts|createObjectURL/.test(bundle));
});

test('three.js está vendorizado con versión fija y licencia MIT', () => {
  const bundle = read('hero3d.js');
  assert.match(bundle.slice(0, 300), /three\.js 0\.186\.1/);
  assert.match(bundle, /SPDX-License-Identifier: MIT/);
  const license = read('licenses/three-LICENSE.txt');
  assert.match(license, /The MIT License/);
  assert.match(license, /three\.js authors/);
  const pkg = JSON.parse(read('src-3d/package.json'));
  assert.equal(pkg.devDependencies.three, '0.186.1');
});

test('la exportación pública incluye la escena 3D y su licencia, pero no la fuente', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const out = join(mkdtempSync(join(tmpdir(), 'es-3d-')), 'dist');
  execFileSync(process.execPath, [new URL('../scripts/export-public.mjs', import.meta.url).pathname, out]);
  const files = readdirSync(out);
  for (const name of ['hero3d.js', 'hero3d-loader.js', 'tilt.js', 'portada.css', 'licenses']) assert.ok(files.includes(name), `falta ${name}`);
  assert.ok(readdirSync(join(out, 'licenses')).includes('three-LICENSE.txt'));
  assert.ok(readdirSync(join(out, 'assets')).includes('hero-3d-fallback.webp'));
  assert.ok(!files.includes('src-3d'));
});
