import test from 'node:test';
import { approvedFiles } from './approved-content.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PREVIOUS = '08d4e73ec87eccd4f02918b39a5ef9b0077b7ac2';
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(site, '..');
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const read = file => readFileSync(resolve(site, file), 'utf8').replace(/\r\n/g, '\n');
const before = file => git(['show', `${PREVIOUS}:extreme-solutions/${file}`]).replace(/\r\n/g, '\n');
const allowed = new Set(['base.css', 'dynamic.css', 'portada.css', 'privacy.css', 'showcase.css', 'hero-phone.css', 'hero-phone.js', 'privacidad.html', 'tests/palette.test.mjs', 'tests/portada-3d.test.mjs', 'tests/headings-motion.test.mjs'].map(file => 'extreme-solutions/' + file).concat([...approvedFiles, 'politica-pro-es.md', 'pnpm-lock.yaml']));

test('títulos y teléfono: todo archivo publicado fuera del alcance mantiene su hash exacto', () => {
  const tree = git(['ls-tree', '-r', '-z', PREVIOUS]).split('\0').filter(Boolean).map(line => {
    const [, hash, path] = line.match(/^\d+ blob ([a-f\d]+)\t(.+)$/s);
    return { hash, path };
  });
  for (const { hash, path } of tree) {
    if (allowed.has(path)) continue;
    assert.ok(existsSync(resolve(repo, path)), path + ' existe');
    assert.equal(git(['hash-object', `--path=${path}`, path]).trim(), hash, path + ' permanece intacto');
  }
  const oldPaths = new Set(tree.map(entry => entry.path));
  for (const path of git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean)) assert.ok(oldPaths.has(path) || allowed.has(path), 'nuevo archivo autorizado: ' + path);
});

test('jerarquía compartida: títulos de página a 48px, marca a 52px y secciones a 36px como máximo', () => {
  const css = read('base.css');
  assert.match(css, /--heading-page-size:\s*clamp\(1\.75rem, 1\.3rem \+ 1\.6vw, 3rem\)/);
  assert.match(css, /--heading-section-size:\s*clamp\(1\.5rem, 1\.15rem \+ 1\.1vw, 2\.25rem\)/);
  assert.match(css, /--heading-brand-size:\s*clamp\(1\.875rem, 1\.35rem \+ 2vw, 3\.25rem\)/);
  assert.match(css, /h1\s*\{[^}]*font-size:\s*var\(--heading-page-size\)/);
  assert.match(css, /h2\s*\{[^}]*font-size:\s*var\(--heading-section-size\)/);
  for (const file of ['dynamic.css', 'portada.css', 'privacy.css', 'showcase.css', 'hero-phone.css']) assert.match(read(file), /(?:h1|h2)\s*\{[^}]*font-size:\s*var\(--heading-(?:page|brand|section)-size\)/, 'títulos con escala compartida en ' + file);
});

test('hero-phone.css cambia únicamente tamaños de h1; apariencia, pantallas y geometría intactas', () => {
  const normalize = css => css.replace(/\.hero h1\s*\{[^}]*\}/g, block => block.replace(/font-size:[^;]*;/g, '')).replace(/\.hero h1\s*\{\s*\}/g, '').split('\n').map(line => line.trim()).filter(Boolean).join('\n');
  assert.equal(normalize(read('hero-phone.css')), normalize(before('hero-phone.css')));
});

test('galería real conserva selección asíncrona, errores y cancelación de cargas exactamente', () => {
  const choose = script => script.match(/  const choose = async index => \{[\s\S]*?  controls\.hidden = false;/)?.[0];
  assert.ok(choose(read('hero-phone.js')));
  assert.equal(choose(read('hero-phone.js')), choose(before('hero-phone.js')));
});

test('móvil: animación visible con pausa, ahorro y movimiento reducido; tacto no bloquea scroll', () => {
  const js = read('hero-phone.js');
  for (const token of ['motionButton.dataset.phoneMotion', 'Pausar movimiento', 'Reanudar movimiento', 'Pause motion', 'Resume motion', 'rig.animate([', 'iterations: Infinity', 'IntersectionObserver', 'stopSway()', 'document.hidden', 'navigator.connection?.saveData', 'reduced.matches', 'userPaused', "window.addEventListener('pointercancel'", "controls.addEventListener('focusout'"]) assert.ok(js.includes(token), token);
  assert.doesNotMatch(js, /preventDefault|touch-action|DeviceOrientation|setInterval|fetch\(/);
  assert.match(js, /pointerdown'[\s\S]*?\{ passive: true \}/);
  assert.match(js, /touch \? 20 : 44/);
  assert.match(js, /touch \? 26 : 56/);
});
