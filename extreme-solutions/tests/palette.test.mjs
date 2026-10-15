import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { approvedFiles, withoutApprovedCard, withoutApprovedTranslations, withoutApprovedSitemap, withoutApprovedProjectCode } from './approved-content.mjs';

// Accepted published site before removing its payment demo and adding the four proof-card
// entrances. The phone, apps, photographs and actual app policies remain protected.
const BASELINE = '0e777c2356e90b3c37fde6bc14e046a4fbf1984b';
const CONTROL_BASELINE = BASELINE;
const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(siteRoot, '..');
const prefix = 'extreme-solutions/';
const cssFiles = ['base.css', 'dynamic.css', 'portada.css', 'privacy.css'];
const git = (args, options = {}) => execFileSync('git', args, { cwd: repositoryRoot, ...options });
const read = file => readFileSync(resolve(siteRoot, file), 'utf8');
const baseline = file => git(['show', `${BASELINE}:${prefix}${file}`], { encoding: 'utf8' });
const normalizeEol = value => value.replace(/\r\n/g, '\n');

// Do not erase whitespace in strings, descendant selectors, or URLs: it is meaningful.
function stripComments(source) {
  let result = '', quote = '';
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      result += char;
      if (char === '\\') result += source[++i] ?? '';
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char; result += char;
    } else if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      assert.notEqual(end, -1, 'Comentario CSS sin cerrar');
      i = end + 1; result += ' ';
    } else result += char;
  }
  return result;
}

function canonical(source, selectorMode = false) {
  let result = '', quote = '', pendingSpace = false;
  const tightBefore = selectorMode ? /[,>+~=)\]]/ : /[()[\]{}:;,>+~=/]/;
  const tightAfter = selectorMode ? /[,>+~=(\[]/ : /[([{:;,>+~=/]/;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      result += char;
      if (char === '\\') result += source[++i] ?? '';
      else if (char === quote) quote = '';
      continue;
    }
    if (/\s/.test(char)) { pendingSpace = true; continue; }
    if (tightBefore.test(char)) result = result.trimEnd();
    else if (pendingSpace && result && !tightAfter.test(result.at(-1))) result += ' ';
    pendingSpace = false;
    result += char;
    if (char === '"' || char === "'") quote = char;
  }
  return result.trim();
}

function boundary(source, start, delimiters) {
  let quote = '', round = 0, square = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') round++;
    else if (char === ')') round--;
    else if (char === '[') square++;
    else if (char === ']') square--;
    else if (!round && !square && delimiters.includes(char)) return i;
  }
  return source.length;
}

function matching(source, start, open, close) {
  let depth = 0, quote = '';
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === open) depth++;
    else if (char === close && --depth === 0) return i;
  }
  throw new Error(`CSS sin cerrar: ${open}`);
}

function splitTopLevel(source, delimiter) {
  const parts = [];
  for (let start = 0; start < source.length;) {
    const end = boundary(source, start, delimiter);
    parts.push(source.slice(start, end)); start = end + 1;
  }
  return parts;
}

function parseCss(source) {
  const records = [];
  function rules(css, context = []) {
    for (let start = 0; start < css.length;) {
      while (/\s/.test(css[start] ?? '') && start < css.length) start++;
      if (start === css.length) break;
      const edge = boundary(css, start, '{;');
      const header = css.slice(start, edge).trim();
      const selector = canonical(header, !header.startsWith('@'));
      assert.ok(selector, 'Regla CSS sin selector');
      if (css[edge] === ';') {
        records.push({ context, statement: selector }); start = edge + 1; continue;
      }
      assert.equal(css[edge], '{', `Regla CSS sin bloque: ${selector}`);
      const end = matching(css, edge, '{', '}');
      const body = css.slice(edge + 1, end);
      if (/^@(media|supports|container|layer|document|scope|(?:-webkit-)?keyframes)\b/.test(selector)) {
        rules(body, [...context, selector]);
      } else {
        const declarations = splitTopLevel(body, ';').filter(part => part.trim()).map(part => {
          const colon = boundary(part, 0, ':');
          assert.ok(colon < part.length, `Declaración CSS inválida: ${part}`);
          return { property: part.slice(0, colon).trim(), value: part.slice(colon + 1).trim() };
        });
        records.push({ context, selector, declarations });
      }
      start = end + 1;
    }
  }
  rules(stripComments(source));
  return records;
}

const colorVariables = new Set([
  '--ink', '--ink-2', '--muted', '--paper', '--paper-2', '--line', '--blue', '--cyan',
  '--green', '--amber', '--white', '--warm', '--forest', '--text', '--accent', '--shadow-color',
]);
const colorOnlyProperties = /^(?:color|background-color|(?:border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline|column-rule|text-decoration|text-emphasis|caret|accent|stop|flood|lighting)-color|fill|stroke|-webkit-(?:tap-highlight|text-fill|text-stroke)-color)$/;
const coloredGeometryProperties = /^(?:background(?:-image)?|box-shadow|text-shadow|(?:-webkit-)?(?:filter|backdrop-filter)|border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|outline|column-rule|text-decoration|--shadow)$/;

// Regex recognizes color literals; the scanner protects quoted strings and complete url().
// Gradient geometry, image paths, shadow offsets/blur and border widths remain in the comparison.
function withoutColors(value, variables = colorVariables) {
  let result = '';
  for (let i = 0; i < value.length;) {
    const char = value[i];
    if (char === '"' || char === "'") {
      const start = i++, quote = char;
      while (i < value.length) {
        if (value[i] === '\\') i += 2;
        else if (value[i++] === quote) break;
      }
      result += value.slice(start, i); continue;
    }
    const hex = value.slice(i).match(/^#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w-])/i);
    if (hex) { i += hex[0].length; continue; }
    const identifier = value.slice(i).match(/^[a-z_-][\w-]*/i);
    if (identifier) {
      const word = identifier[0], next = i + word.length;
      if (value[next] === '(') {
        const end = matching(value, next, '(', ')');
        const whole = value.slice(i, end + 1), name = word.toLowerCase();
        if (['rgb', 'rgba', 'hsl', 'hsla', 'color-mix'].includes(name)) { i = end + 1; continue; }
        if (name === 'url') { result += whole; i = end + 1; continue; }
        if (name === 'var' && variables.has(whole.slice(4, -1).split(',')[0].trim())) { i = end + 1; continue; }
      }
      if (/^(white|black|transparent|currentcolor|inherit|initial|unset|revert|revert-layer)$/i.test(word)) { i = next; continue; }
      result += word; i = next; continue;
    }
    result += char; i++;
  }
  return canonical(result.replace(/!\s*important\b/gi, ''));
}

function variablesFor(records) {
  const variables = new Set(colorVariables);
  for (const record of records) for (const { property, value } of record.declarations ?? []) {
    if (property.startsWith('--') && !withoutColors(value, variables)) variables.add(property);
  }
  return variables;
}

function structure(records, variables) {
  return records.flatMap(record => {
    if (record.statement) return [{ context: record.context, statement: record.statement }];
    const declarations = record.declarations.flatMap(({ property, value }) => {
      const paint = withoutColors(value, variables);
      if (colorOnlyProperties.test(property)) {
        assert.ok(!paint || /^(none|revert-layer)$/.test(paint), `Valor no cromático en ${record.selector}: ${property}: ${value}`);
        return [];
      }
      if (property.startsWith('--') && !paint) return [];
      if (coloredGeometryProperties.test(property)) return paint ? [{ property, value: paint + (/!\s*important\s*$/i.test(value) ? '!important' : '') }] : [];
      return [{ property, value: canonical(value) }];
    });
    return declarations.length ? [{ context: record.context, selector: record.selector, declarations }] : [];
  });
}

function assertColorOnly(before, after, label = 'CSS') {
  const original = parseCss(before), changed = parseCss(after);
  const variables = variablesFor([...original, ...changed]);
  // A new shorthand can reset an existing image/border even when it contains only a color.
  const geometryKeys = new Set(), originalPaintCounts = new Map(), currentPaintCounts = new Map();
  const declarationKey = (record, property) => JSON.stringify([record.context, record.selector, property]);
  for (const [records, counts] of [[original, originalPaintCounts], [changed, currentPaintCounts]]) {
    for (const record of records) for (const { property, value } of record.declarations ?? []) {
      if (!coloredGeometryProperties.test(property)) continue;
      const key = declarationKey(record, property);
      if (withoutColors(value, variables)) {
        if (records === original) geometryKeys.add(key);
      } else counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of currentPaintCounts) if (count > (originalPaintCounts.get(key) ?? 0)) {
    assert.ok(!geometryKeys.has(key), `${label}: un nuevo shorthand de color restablece imagen o geometría existente: ${key}`);
    const property = JSON.parse(key)[2];
    assert.ok(!/^(border|outline|column-rule|text-decoration)/.test(property), `${label}: usa la propiedad -color para no restablecer ${property}`);
  }
  assert.deepEqual(structure(changed, variables), structure(original, variables), `${label}: cambió algo además del color`);
  // New color-only selectors are allowed, but all original selectors/contexts stay in order.
  const key = record => JSON.stringify([record.context, record.selector ?? record.statement]);
  let cursor = 0;
  for (const record of original) {
    while (cursor < changed.length && key(changed[cursor]) !== key(record)) cursor++;
    assert.ok(cursor < changed.length, `${label}: se eliminó, movió o cambió el selector ${record.selector ?? record.statement}`);
    cursor++;
  }
}

test('el guard acepta recoloración/comentarios y detecta cambios de distribución, imágenes y texto', () => {
  const before = ':root { --ink: #123; --shadow: 0 2px 6px rgba(0,0,0,.2); } .a .b { color: #abc; border: 1px solid #000; background: linear-gradient(90deg, #123 0%, rgba(0,0,0,.2) 100%), url("/same.webp") center/cover no-repeat; padding: 2px; content: "A B"; box-shadow: var(--shadow); filter: drop-shadow(0 0 4px #abc); }';
  const changed = before.replaceAll('#123', '#1e3a2f').replaceAll('#abc', 'rgb(31, 30, 28)').replaceAll('#000', '#f7f5f2').replace('rgba(0,0,0,.2)', 'hsla(20, 10%, 20%, .7)');
  assertColorOnly(before, `/* new palette #fff */\n${changed}\n.new { color: #fff; background-color: #1e3a2f; outline-color: #d97706; }`);
  for (const [from, to] of [['padding: 2px', 'padding: 3px'], ['90deg', '120deg'], ['/same.webp', '/other.webp'], ['1px solid', '2px solid'], ['0 2px 6px', '0 2px 9px'], ['0 0 4px', '0 0 8px'], ['.a .b', '.a.b'], ['"A B"', '"AB"']]) {
    assert.throws(() => assertColorOnly(before, changed.replace(from, to)), /cambió algo|selector/);
  }
  assert.throws(() => assertColorOnly(before, `${changed}\n.new { margin: 1px; color: #fff; }`), /cambió algo/);
  assert.throws(() => assertColorOnly('.a[data-x="a"] .b { padding: 1px; }', '.a[data-x="a"].b { padding: 1px; }'), /cambió algo|selector/);
  assert.throws(() => assertColorOnly('.a:is(.b) .c { padding: 1px; }', '.a:is(.b).c { padding: 1px; }'), /cambió algo|selector/);
  assert.throws(() => assertColorOnly('.nav :focus { padding: 1px; }', '.nav:focus { padding: 1px; }'), /cambió algo|selector/);
  assert.throws(() => assertColorOnly('.a [data-x="a"] { padding: 1px; }', '.a[data-x="a"] { padding: 1px; }'), /cambió algo|selector/);
  assert.throws(() => assertColorOnly('.a { background: url("/same.webp"); }', '.a { background: url("/same.webp"); } .a { background: #fff; }'), /restablece imagen/);
  assert.throws(() => assertColorOnly('.a { border: 1px solid #000; }', '.a { border: 1px solid #000; } .a { border: #fff; }'), /restablece imagen/);
});

function scopedCss(source, file) {
  source = normalizeEol(source);
  if (file === 'base.css') return source.replace(/\.pay-note\b/g, '.capability-note')
    .replace(/(img\s*\{\s*display: block;\s*max-width: 100%;)\s*height: auto;/, '$1')
    .replace('color: rgba(139, 203, 177, .18);', 'color: var(--blue);');
  if (file === 'dynamic.css') return source.replace(/\.proof-band\s*\{[^}]*--assemble-duration:[^}]*\}/, '')
    .replace(/(\.footer-legal\s*\{[^}]*opacity:)\s*\.85/, '$1 1');
  if (file === 'showcase.css') return source.replace(/\.blog-page \.blog-shell>\.section-head(?: h1)?\s*\{[^}]*\}/g, '');
  return source;
}

function scopedCssRecords(source, file) {
  return parseCss(scopedCss(source, file)).flatMap(record => {
    // This task changes heading typography only. Paint, body text, imagery, card sizes,
    // and all unrelated declarations still participate in the exact comparison.
    const headingSelectors = {
      'base.css': new Set(['h1', 'h2']),
      'dynamic.css': new Set(['.detail-heading h1']),
      'portada.css': new Set(['.hero h1']),
      'privacy.css': new Set(['.privacy-hero h1', '.privacy-section h2']),
      'showcase.css': new Set(['.blog-page .blog-shell>.section-head h1,.blog-article h1', '.blog-article h2']),
    };
    const headingProperties = new Set(['font-size', 'line-height', 'letter-spacing', 'max-width', 'overflow-wrap']);
    if (record.selector === ':root' && file === 'base.css') record = { ...record, declarations: record.declarations.filter(({ property }) => !['--heading-page-size', '--heading-section-size', '--heading-brand-size'].includes(property)) };
    if (headingSelectors[file]?.has(record.selector)) record = { ...record, declarations: record.declarations.filter(({ property }) => !headingProperties.has(property)) };
    if (file === 'showcase.css' && record.selector === '.blog-page>.section') {
      assert.deepEqual(record.declarations, [{ property: 'padding-top', value: 'calc(73px + 2rem)' }], 'solo despeje concreto del menú fijo del Blog');
      return [];
    }
    if (record.declarations && !record.declarations.length) return [];
    if (file !== 'dynamic.css' || !record.selector?.includes('.save-project')) return [record];
    const selectors = splitTopLevel(record.selector, ',').flatMap(selector => {
      if (selector.startsWith(':where(')) return [selector.replace(/,\.save-project\b/g, '')];
      return selector.includes('.save-project') ? [] : [selector];
    });
    return selectors.length ? [{ ...record, selector: selectors.join(',') }] : [];
  });
}

for (const file of cssFiles) test(`${file}: conserva paleta, medidas y estructura excepto el rename y tokens de entrada autorizados`, () => {
  assert.deepEqual(scopedCssRecords(read(file), file), scopedCssRecords(baseline(file), file), 'Ningún cambio de color o geometría fuera del alcance');
});

const tree = git(['ls-tree', '-r', '-z', BASELINE], { encoding: 'utf8' }).split('\0').filter(Boolean).map(entry => {
  const match = entry.match(/^\d+ blob ([a-f\d]+)\t(.+)$/s);
  assert.ok(match, `Entrada Git inesperada: ${entry}`);
  return { hash: match[1], path: match[2] };
});
// Payment-demo cleanup and proof entrances only. Every original app, phone, photograph and
// production file not explicitly owned by this task keeps its exact Git hash.
const allowedFiles = new Set([
  ...cssFiles.map(file => prefix + file),
  prefix + 'index.html', prefix + 'privacidad.html', prefix + 'dynamic.js', prefix + 'data/translations.json', prefix + 'i18n-data.js',
  prefix + 'lib/projects.js', prefix + 'catalog.js',
  prefix + 'showcase.css',
  prefix + 'hero-phone.css', prefix + 'hero-phone.js', prefix + 'tests/headings-motion.test.mjs', prefix + 'tests/portada-3d.test.mjs',
  prefix + 'sitemap.xml',
  prefix + 'tests/palette.test.mjs', prefix + 'tests/pulido.test.mjs', prefix + 'tests/projects.test.mjs',
  'docs/ARCHITECTURE.md', 'docs/VERCEL_READY.md',
  ...approvedFiles,
]);

test('fotos, logos, datos, HTML, scripts y toda producción no autorizada conservan su hash Git', () => {
  const differences = [];
  for (const { hash, path } of tree.filter(entry => !allowedFiles.has(entry.path))) {
    if (!existsSync(resolve(repositoryRoot, path))) { differences.push(`${path}: eliminado`); continue; }
    const actual = git(['hash-object', `--path=${path}`, path], { encoding: 'utf8' }).trim();
    if (actual !== hash) differences.push(`${path}: contenido modificado`);
  }
  const originalPaths = new Set(tree.map(entry => entry.path));
  const currentPaths = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const path of currentPaths) if (!originalPaths.has(path) && !allowedFiles.has(path)) {
    differences.push(`${path}: archivo nuevo fuera del alcance de paleta`);
  }
  assert.deepEqual(differences, [], 'Cambios fuera del alcance de paleta');
});

test('refinamiento de controles: conserva también la escena menta y todos los recursos del sitio publicado', () => {
  const allowed = allowedFiles;
  const original = git(['ls-tree', '-r', '-z', CONTROL_BASELINE], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const differences = [];
  for (const entry of original) {
    const [, hash, path] = entry.match(/^\d+ blob ([a-f\d]+)\t(.+)$/s) ?? [];
    assert.ok(path, `Entrada Git inesperada: ${entry}`);
    if (allowed.has(path)) continue;
    if (!existsSync(resolve(repositoryRoot, path))) { differences.push(`${path}: eliminado`); continue; }
    const actual = git(['hash-object', `--path=${path}`, path], { encoding: 'utf8' }).trim();
    if (actual !== hash) differences.push(`${path}: contenido modificado`);
  }
  assert.deepEqual(differences, [], 'El teléfono solo reemplaza el encabezado; escena de respaldo, capturas, logos y resto del sitio permanecen intactos');
  for (const file of cssFiles) {
    const before = git(['show', `${CONTROL_BASELINE}:${prefix}${file}`], { encoding: 'utf8' });
    assert.deepEqual(scopedCssRecords(read(file), file), scopedCssRecords(before, file), file);
  }
});

function section(html, id) {
  return normalizeEol(html).match(new RegExp(`<section id="${id}"(?=[\\s>])[\\s\\S]*?<\\/section>`))?.[0];
}

function withoutPaymentDemo(html) {
  return withoutApprovedCard(normalizeEol(html))
    .replace(/^[\t ]*<a href="#pagos">Pagos<\/a>[\t ]*\n?/m, '')
    .replace(/^[\t ]*<section class="section section-compact" id="pagos"[\s\S]*?<\/section>[\t ]*\n?/m, '')
    .replace(/class="pay-note"/g, 'class="capability-note"')
    .replace(/<button class="save-project"[^>]*>[\s\S]*?<\/button>/g, '')
    .replace(/<button id="saved-only"[^>]*>[\s\S]*?<\/button>/g, '')
    .replace(/^[\t ]*<p class="catalog-hint">Guarda los proyectos que te interesan en este navegador\.<\/p>[\t ]*\n?/m, '')
    .replace('>Más información</a>', '>Privacidad del distintivo de LinkedIn</a>')
    .replace(/\n[\t ]*<\/div>/g, '\n</div>')
    .replace(/\n[\t ]*\n+/g, '\n');
}

test('solo se elimina el módulo y enlace de pagos; Apps, Experiencia, teléfono y todo el resto de index son idénticos', () => {
  assert.ok(section(read('index.html'), 'apps'), 'la sección Apps existe');
  for (const id of ['apps', 'experiencia']) assert.equal(withoutPaymentDemo(section(read('index.html'), id)), withoutPaymentDemo(section(baseline('index.html'), id)), `mismo contenido completo de ${id}, excepto botones/filtro de guardado autorizados`);
  assert.match(read('index.html'), /<main id="contenido" tabindex="-1">\s*<section id="apps"(?=[\s>])/, 'Apps inmediatamente después de abrir main');
  const current = normalizeEol(read('index.html'));
  const afterApps = current.slice(current.indexOf(section(current, 'apps')) + section(current, 'apps').length);
  assert.match(afterApps, /^\s*<section id="experiencia"(?=[\s>])/, 'Experiencia inmediatamente después de Apps');
  assert.equal(withoutPaymentDemo(read('index.html')), withoutPaymentDemo(baseline('index.html')), 'solo retiro exacto del bloque/nav de pagos y rename de nota AnotaLab');
});

test('solo desaparece el subtítulo del fundador y se agrega WhatsApp al grupo de acciones del encabezado', () => {
  const html = read('index.html');
  const header = html.match(/<header id="inicio" class="hero">[\s\S]*?<\/header>/)?.[0];
  assert.ok(header, 'encabezado existente');
  assert.doesNotMatch(header, /class="founder-line"|by Erik Sanchez/);
  assert.match(header, /<div class="hero-actions">[\s\S]*?<a class="[^"]*\bhero-whatsapp\b[^"]*"[^>]*href="https:\/\/wa\.me\/5214422858759"/);
  assert.equal([...html.matchAll(/href="https:\/\/wa\.me\/5214422858759"/g)].length, 1, 'una sola acción WhatsApp nueva');
});

test('la entrada de métricas solo agrega los cuatro tokens/clip locales y conserva el resto de estilos', () => {
  for (const file of [...cssFiles, 'showcase.css']) assert.deepEqual(scopedCssRecords(read(file), file), scopedCssRecords(baseline(file), file), file);
  const band = parseCss(read('dynamic.css')).filter(record => record.selector === '.proof-band');
  assert.equal(band.length, 1);
  assert.deepEqual(band[0].declarations, [
    { property: '--assemble-duration', value: '.6s' }, { property: '--assemble-stagger', value: '.08s' },
    { property: '--assemble-ease', value: 'var(--ease-out)' }, { property: 'overflow', value: 'clip' },
  ]);
  const blog = parseCss(read('showcase.css')).filter(record => record.selector?.startsWith('.blog-page .blog-shell>.section-head'));
  assert.equal(blog.length, 3, 'índice y artículo comparten tamaño de título, conservando sus márgenes');
  assert.deepEqual(blog[0].declarations, [{ property: 'grid-template-columns', value: 'minmax(0,1fr)' }, { property: 'margin-bottom', value: '1.5rem' }]);
  assert.deepEqual(blog[1].declarations, [
    { property: 'max-width', value: '100%' }, { property: 'font-size', value: 'var(--heading-page-size)' },
    { property: 'line-height', value: '1.14' }, { property: 'letter-spacing', value: '-.025em' },
  ]);
  assert.deepEqual(blog[2].declarations, [{ property: 'margin', value: '.4rem 0 0' }]);
});

test('privacidad solo retira los avisos del módulo de muestra y sus tres referencias a proveedores; políticas de apps exactas', () => {
  const cleanup = html => normalizeEol(html)
    .replace(/<li><span>Pagos: el módulo de pagos del sitio[\s\S]*?<\/li>/g, '')
    .replace(/<li><span>Módulo de pagos de muestra:[\s\S]*?<\/li>/g, '')
    .replace('Google, LinkedIn o Stripe', 'Google o LinkedIn')
    .replace('LinkedIn, Stripe y otros sitios', 'LinkedIn y otros sitios')
    .replace('Marcas de terceros: Stripe, PayPal, Mercado Pago, Google', 'Marcas de terceros: Google')
    .replace('el idioma, el tema, los proyectos favoritos y tu decisión', 'el idioma, el tema y tu decisión');
  assert.equal(cleanup(read('privacidad.html')), cleanup(baseline('privacidad.html')));
  const policies = html => normalizeEol(html).slice(normalizeEol(html).indexOf('<section id="proyectos"'), normalizeEol(html).indexOf('<section id="otros-proyectos"'));
  assert.equal(policies(read('privacidad.html')), policies(baseline('privacidad.html')), 'compras, precios y avisos de cada app no se modifican');
  assert.doesNotMatch(read('privacidad.html'), /Stripe|PayPal|Mercado Pago|módulo de pagos/i);
});

test('traducciones solo eliminan diez claves de pago de muestra y actualizan tres referencias; i18n generado exacto', () => {
  const previous = JSON.parse(baseline('data/translations.json'));
  const expected = { ...previous };
  let removed = 0, replaced = 0;
  for (const [key, value] of Object.entries(previous)) {
    if (!/Stripe|PayPal|Mercado Pago/.test(key) && !['Pagos', 'Integración de pasarelas de pago', 'Pasarelas y capacidades', 'Realizar pago'].includes(key) && !/^Pagos: el módulo de pagos del sitio/.test(key)) continue;
    delete expected[key];
    const nextKey = key.replace('Google, LinkedIn o Stripe', 'Google o LinkedIn').replace('LinkedIn, Stripe y otros sitios', 'LinkedIn y otros sitios').replace('Marcas de terceros: Stripe, PayPal, Mercado Pago, Google', 'Marcas de terceros: Google');
    if (nextKey !== key) {
      expected[nextKey] = value.replace('Google, LinkedIn or Stripe', 'Google or LinkedIn').replace('LinkedIn, Stripe and other', 'LinkedIn and other').replace('Third-party trademarks: Stripe, PayPal, Mercado Pago, Google', 'Third-party trademarks: Google');
      replaced++;
    } else removed++;
  }
  assert.equal(removed, 10); assert.equal(replaced, 3);
  delete expected['Más información'];
  expected['Privacidad del distintivo de LinkedIn'] = 'LinkedIn badge privacy';
  for (const key of ['Mis favoritos', 'Guarda los proyectos que te interesan en este navegador.', 'Guardar', 'Guardado', 'Quitar de favoritos', 'favoritos']) delete expected[key];
  for (const [key, value] of Object.entries(previous).filter(([key]) => key.startsWith('Preferencias locales:') && key.includes('proyectos favoritos'))) {
    delete expected[key];
    expected[key.replace('el idioma, el tema y los proyectos favoritos', 'el idioma y el tema').replace('el idioma, el tema, los proyectos favoritos y tu decisión', 'el idioma, el tema y tu decisión')] = value.replace('language, theme and favorite projects', 'language and theme').replace('language, theme, favorite projects and your LinkedIn choice', 'language, theme and your LinkedIn choice');
  }
  const translations = JSON.parse(read('data/translations.json'));
  assert.deepEqual(withoutApprovedTranslations(translations), expected, 'todas las traducciones no relacionadas permanecen intactas');
  assert.equal(normalizeEol(read('i18n-data.js')), `window.EXTREME_TRANSLATIONS = ${JSON.stringify(translations, null, 2)};\n`);
});

test('dynamic.js solo corrige hashes/orden del nav, excluye métricas del reveal genérico y añade acomodo dedicado', () => {
  let expected = normalizeEol(baseline('dynamic.js'))
    .replace('const section = document.querySelector(link.hash);', "const section = link.hash && document.getElementById(link.hash.slice(1));\n  if (!section) return; // Blog y otros enlaces de página mantienen su navegación normal.")
    .replace('const sections = links.map(link => document.querySelector(link.hash));', 'const sections = links.map(link => link.hash && document.getElementById(link.hash.slice(1))).filter(Boolean);')
    .replace('  let active;\n  sections.forEach(section => {\n    if (section.getBoundingClientRect().top <= nav.offsetHeight + 100) active = section.id;\n  });', '  let active;\n  let nearest = -Infinity;\n  sections.forEach(section => {\n    const top = section.getBoundingClientRect().top;\n    if (top <= nav.offsetHeight + 100 && top > nearest) {\n      active = section.id;\n      nearest = top;\n    }\n  });')
    .replace('.method-step, .metric, .play-card', '.method-step, .metric:not(.proof-band .metric), .play-card');
  const current = normalizeEol(read('dynamic.js'));
  const marker = '// Producto completo: cada pieza llega desde un ángulo distinto y se asienta una sola vez.';
  assert.equal(current.slice(0, current.indexOf(marker)).trimEnd(), expected.trimEnd(), 'todo el comportamiento original ajeno al nuevo acomodo se conserva');
  const assembly = current.slice(current.indexOf(marker));
  for (const feature of ["band.querySelectorAll('.metric')", 'observer.unobserve(target)', "band.addEventListener('focusin'", "window.addEventListener('beforeprint'", "navigator.connection?.saveData", 'animation.cancel()']) assert.ok(assembly.includes(feature), feature);
  assert.doesNotMatch(assembly, /setInterval|fetch\(|innerHTML|display:\s*none|opacity:\s*0[,\s}]/);
});

test('lib/projects.js solo retira el botón Guardar; páginas de detalle, datos, textos e imágenes intactos', () => {
  const cleanup = source => normalizeEol(source).replace(/<button class="save-project"[^>]*>[\s\S]*?<\/button>/g, '');
  assert.equal(cleanup(withoutApprovedProjectCode(read('lib/projects.js'))), cleanup(baseline('lib/projects.js')));
  assert.doesNotMatch(read('catalog.js'), /extreme-saved|localStorage|savedOnly|onlySaved|data-save|favorite/i);
});

function colorOnlyScene(source) {
  let result = '';
  for (let i = 0; i < source.length;) {
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i + 2); i = end < 0 ? source.length : end; continue;
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      assert.notEqual(end, -1, 'Comentario 3D sin cerrar'); i = end + 2; result += ' '; continue;
    }
    const quote = source[i];
    if (quote === '"' || quote === "'" || quote === '`') {
      const start = ++i;
      while (i < source.length && source[i] !== quote) i += source[i] === '\\' ? 2 : 1;
      const value = source.slice(start, i);
      const literal = /^(?:#(?:[a-f\d]{8}|[a-f\d]{6}|[a-f\d]{4}|[a-f\d]{3})|(?:rgb|rgba|hsl|hsla)\([^)]*\))$/i.test(value);
      result += quote + (literal ? 'COLOR' : value) + quote; i++; continue;
    }
    const hexadecimal = source.slice(i).match(/^0x[a-f\d]{6}\b/i);
    if (hexadecimal) { result += 'COLOR'; i += hexadecimal[0].length; continue; }
    result += source[i++];
  }
  return normalizeEol(result).split('\n').map(line => line.trim()).filter(Boolean).join('\n');
}

test('fuente 3D: solo colores; geometría, luces, materiales, cámara, movimiento y lógica idénticos', () => {
  assert.equal(colorOnlyScene(read('src-3d/hero3d.src.js')), colorOnlyScene(baseline('src-3d/hero3d.src.js')));
  const fixture = 'const BRAND = { mint: 0xddefe6 };\nconst color = "rgba(53,107,88,.4)";\nconst speed = .12;\nconst camera = new PerspectiveCamera(34, 1, .1, 60);';
  assert.equal(colorOnlyScene(fixture), colorOnlyScene(fixture.replace('0xddefe6', '0x8bcbb1').replace('rgba(53,107,88,.4)', '#356b58')));
  assert.notEqual(colorOnlyScene(fixture), colorOnlyScene(fixture.replace('speed = .12', 'speed = .15')));
  assert.notEqual(colorOnlyScene(fixture), colorOnlyScene(fixture.replace('(34, 1, .1, 60)', '(35, 1, .1, 60)')));
});

test('bundle 3D generado corresponde exactamente a la fuente y configuración protegidas', async () => {
  const require3d = createRequire(resolve(siteRoot, 'src-3d/package.json'));
  const { build } = require3d('esbuild');
  const three = JSON.parse(readFileSync(resolve(siteRoot, 'src-3d/node_modules/three/package.json'), 'utf8'));
  const generated = await build({
    entryPoints: [resolve(siteRoot, 'src-3d/hero3d.src.js')], outfile: resolve(siteRoot, 'hero3d.js'),
    bundle: true, format: 'esm', minify: true, target: ['es2020'], legalComments: 'eof', write: false,
    banner: { js: `/*! Extreme Solutions · escena 3D de la portada. Incluye three.js ${three.version} (https://threejs.org), licencia MIT: /licenses/three-LICENSE.txt */` },
  });
  assert.equal(normalizeEol(generated.outputFiles[0].text), normalizeEol(read('hero3d.js')), 'Reconstruir hero3d.js desde la fuente recoloreada');
});

function webpSize(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4), start = offset + 8;
    assert.ok(start + size <= buffer.length, 'Chunk WebP truncado');
    if (kind === 'VP8X') return [buffer.readUIntLE(start + 4, 3) + 1, buffer.readUIntLE(start + 7, 3) + 1];
    if (kind === 'VP8 ') {
      assert.equal(buffer.subarray(start + 3, start + 6).toString('hex'), '9d012a');
      return [buffer.readUInt16LE(start + 6) & 0x3fff, buffer.readUInt16LE(start + 8) & 0x3fff];
    }
    if (kind === 'VP8L') {
      assert.equal(buffer[start], 0x2f);
      const bits = buffer.readUInt32LE(start + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    offset = start + size + (size % 2);
  }
  assert.fail('WebP sin dimensiones');
}

test('solo el still generado puede recolorearse; conserva formato WebP y dimensiones', () => {
  const original = git(['show', `${BASELINE}:${prefix}assets/hero-3d-fallback.webp`]);
  const current = readFileSync(resolve(siteRoot, 'assets/hero-3d-fallback.webp'));
  assert.deepEqual(webpSize(current), webpSize(original));
});

function color(value, variables = {}, seen = new Set()) {
  value = value.trim().replace(/!\s*important\s*$/i, '').toLowerCase();
  if (value.startsWith('var(')) {
    const [name, fallback] = splitTopLevel(value.slice(4, -1), ',');
    assert.ok(!seen.has(name), `Variable circular: ${name}`);
    return color(variables[name] ?? fallback ?? assert.fail(`Variable desconocida: ${name}`), variables, new Set([...seen, name]));
  }
  if (value.startsWith('color-mix(')) {
    const [space, ...parts] = splitTopLevel(value.slice(10, -1), ',');
    assert.equal(space.trim(), 'in srgb', 'El cálculo admite mezclas sRGB');
    assert.equal(parts.length, 2);
    const colors = parts.map(part => {
      const match = part.trim().match(/^(.*?)(?:\s+(\d+(?:\.\d+)?)%)?$/);
      return { rgba: color(match[1], variables, seen), weight: match[2] === undefined ? null : Number(match[2]) / 100 };
    });
    const w0 = colors[0].weight ?? (colors[1].weight === null ? .5 : 1 - colors[1].weight);
    const w1 = colors[1].weight ?? 1 - w0;
    const total = w0 + w1, a = (colors[0].rgba[3] * w0 + colors[1].rgba[3] * w1) / total;
    return [0, 1, 2].map(i => a ? (colors[0].rgba[i] * colors[0].rgba[3] * w0 + colors[1].rgba[i] * colors[1].rgba[3] * w1) / (total * a) : 0).concat(a * Math.min(total, 1));
  }
  if (/^#[a-f\d]{3,8}$/.test(value)) {
    let hex = value.slice(1);
    assert.ok([3, 4, 6, 8].includes(hex.length), `Hex inválido: ${value}`);
    if (hex.length < 5) hex = [...hex].map(char => char + char).join('');
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1);
  }
  const rgb = value.match(/^rgba?\((.*)\)$/);
  if (rgb) {
    const parts = rgb[1].trim().split(/[\s,\/]+/);
    assert.ok(parts.length === 3 || parts.length === 4, `RGB inválido: ${value}`);
    return parts.slice(0, 3).map(part => parseFloat(part) * (part.endsWith('%') ? 2.55 : 1)).concat(parts[3] === undefined ? 1 : parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1));
  }
  if (value === 'transparent') return [0, 0, 0, 0];
  if (value === 'white') return [255, 255, 255, 1];
  if (value === 'black') return [0, 0, 0, 1];
  throw new Error(`Color no admitido por el cálculo: ${value}`);
}

function over(foreground, background) {
  const a = foreground[3] + background[3] * (1 - foreground[3]);
  return [0, 1, 2].map(i => (foreground[i] * foreground[3] + background[i] * background[3] * (1 - foreground[3])) / a).concat(a);
}
const luminance = rgba => rgba.slice(0, 3).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
function contrast(foreground, background) {
  assert.equal(background[3], 1, 'El fondo debe quedar opaco para medir contraste');
  const values = [luminance(over(foreground, background)), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
function minimum(foreground, background, threshold, label) {
  const ratio = contrast(foreground, background);
  assert.ok(ratio >= threshold, `${label}: ${ratio.toFixed(3)}:1 < ${threshold}:1`);
}

function declarationsFor(records, selector) {
  const result = {};
  for (const record of records) if (!record.context.length && record.selector && splitTopLevel(record.selector, ',').map(part => canonical(part, true)).includes(canonical(selector, true))) {
    for (const { property, value } of record.declarations) result[property] = value;
  }
  return result;
}
const allCssRecords = cssFiles.flatMap(file => parseCss(read(file)));
const lightVariables = declarationsFor(allCssRecords, ':root');
const darkVariables = { ...lightVariables, ...declarationsFor(allCssRecords, 'html[data-theme="dark"]') };

test('contraste reforzado en números de pasos y texto legal; imágenes mantienen proporción adaptable', () => {
  const steps = declarationsFor(allCssRecords, '.step-number');
  minimum(color(steps.color, lightVariables), color('#fffdfa'), 4.5, 'pasos claros');
  minimum(color(steps.color, darkVariables), color('#23302a'), 4.5, 'pasos oscuros');
  const legal = declarationsFor(allCssRecords, '.footer-legal');
  assert.equal(legal.opacity, '1', 'no se atenúa el texto legal pequeño');
  minimum(color('#625e57'), color('#fffdfa'), 4.5, 'pie legal claro');
  minimum(color('#c6c1b6'), color('#23302a'), 4.5, 'pie legal oscuro');
  const images = declarationsFor(allCssRecords, 'img');
  assert.equal(images['max-width'], '100%');
  assert.equal(images.height, 'auto');
});

test('SEO público existente se conserva: robots, quince URL canónicas y sin CORS comodín', () => {
  assert.equal(normalizeEol(read('robots.txt')), normalizeEol(baseline('robots.txt')));
  assert.match(read('robots.txt'), /Sitemap: https:\/\/extreme-solutions-eosin\.vercel\.app\/sitemap\.xml/);
  const expected = normalizeEol(baseline('sitemap.xml'))
    .replace('<loc>https://extreme-solutions-eosin.vercel.app/</loc><lastmod>2026-10-11</lastmod>', '<loc>https://extreme-solutions-eosin.vercel.app/</loc><lastmod>2026-10-14</lastmod>')
    .replace('<loc>https://extreme-solutions-eosin.vercel.app/privacidad</loc><lastmod>2026-10-10</lastmod>', '<loc>https://extreme-solutions-eosin.vercel.app/privacidad</loc><lastmod>2026-10-14</lastmod>')
    .replace('<loc>https://extreme-solutions-eosin.vercel.app/blog</loc><lastmod>2026-10-13</lastmod>', '<loc>https://extreme-solutions-eosin.vercel.app/blog</loc><lastmod>2026-10-14</lastmod>');
  assert.equal(withoutApprovedSitemap(normalizeEol(read('sitemap.xml'))), expected);
  assert.equal([...expected.matchAll(/<loc>/g)].length, 15);
  const config = JSON.parse(readFileSync(resolve(repositoryRoot, 'vercel.json'), 'utf8'));
  assert.ok(config.headers.flatMap(rule => rule.headers).every(header => header.key.toLowerCase() !== 'access-control-allow-origin' || header.value !== '*'));
});

test('identidades claras y oscuras corresponden a la nueva paleta menta', () => {
  for (const [token, expected] of Object.entries({ '--paper': '#f7f5f2', '--white': '#fffdfa', '--ink': '#1f1e1c', '--blue': '#356b58', '--amber': '#d97706' })) {
    assert.deepEqual(color(lightVariables[token], lightVariables), color(expected), token);
  }
  for (const [token, expected] of Object.entries({ '--paper': '#17201c', '--blue': '#b9e2d1' })) {
    assert.deepEqual(color(darkVariables[token], darkVariables), color(expected), `oscuro: ${token}`);
  }
  const cards = declarationsFor(allCssRecords, 'html[data-theme="dark"] :is(.capability, .tool-card, .method-step, .project, .play-card, .image-panel, footer)');
  assert.deepEqual(color(cards.background, darkVariables), color('#23302a'), 'Superficie de tarjetas oscuras');
  assert.ok([...cssFiles, 'src-3d/hero3d.src.js'].some(file => /#8bcbb1\b|0x8bcbb1\b|rgba?\(\s*139\s*,\s*203\s*,\s*177\s*[,)]/i.test(read(file))), 'El detalle menta está presente en estilos o escena 3D');
});

test('texto, texto secundario y enlaces tienen contraste 4.5:1 en temas claro y oscuro', () => {
  for (const [theme, variables] of [['claro', lightVariables], ['oscuro', darkVariables]]) {
    for (const surface of ['--paper', '--paper-2']) for (const foreground of ['--ink', '--ink-2', '--muted', '--blue']) {
      minimum(color(variables[foreground], variables), color(variables[surface], variables), 4.5, `${theme}: ${foreground} sobre ${surface}`);
    }
  }
  minimum(color(lightVariables['--muted'], lightVariables), color('#f7f5f2'), 4.5, 'Texto secundario sobre blanco cálido');
  minimum(color('#356b58'), color('#ddefe6'), 4.5, 'Texto verde sobre hero menta');
});

function solidPaint(value, variables) {
  const paints = value.match(/#[a-f\d]{3,8}\b|rgba?\([^)]*\)|var\([^)]*\)/gi);
  assert.ok(paints?.length, `Falta color base en ${value}`);
  return color(paints.at(-1), variables);
}

test('hero menta y sus textos, sin blanco invisible sobre la portada clara', () => {
  const hero = declarationsFor(allCssRecords, '.hero');
  const background = solidPaint(hero['background-color'] ?? hero.background, lightVariables);
  assert.deepEqual(background, color('#ddefe6'), 'La portada usa el fondo menta acordado');
  const heroVariables = { ...lightVariables, ...hero };
  minimum(color(hero.color, heroVariables), background, 4.5, 'Texto principal del hero');
  for (const selector of ['.hero-copy', '.founder-line', '.hero-featured-label']) {
    const style = { ...declarationsFor(allCssRecords, selector), ...declarationsFor(allCssRecords, `.hero ${selector}`) };
    minimum(color(style.color ?? hero.color, heroVariables), background, 4.5, selector);
  }
});

test('los textos derivados de paneles y tarjetas oscuras conservan contraste', () => {
  const focusVariables = { ...lightVariables, ...declarationsFor(allCssRecords, '#enfoque') };
  const panel = declarationsFor(allCssRecords, '#enfoque');
  const green = solidPaint(panel['background-color'] ?? panel.background, focusVariables);
  // Check the actual panel base and each existing translucent card gradient endpoint.
  const cardBackground = declarationsFor(allCssRecords, '#enfoque .capability').background;
  const overlays = cardBackground.match(/rgba?\([^)]*\)/g) ?? [];
  const surfaces = [green, ...overlays.map(value => over(color(value, focusVariables), green))];
  for (const foreground of ['--ink', '--ink-2', '--muted']) for (const surface of surfaces) {
    minimum(color(focusVariables[foreground], focusVariables), surface, 4.5, `Panel de enfoque: ${foreground}`);
  }
  const cards = declarationsFor(allCssRecords, 'html[data-theme="dark"] :is(.capability, .tool-card, .method-step, .project, .play-card, .image-panel, footer)');
  for (const token of ['--ink', '--ink-2', '--muted', '--blue']) {
    minimum(color(darkVariables[token], darkVariables), color(cards['background-color'] ?? cards.background, darkVariables), 4.5, `Tarjeta oscura: ${token}`);
  }
});

function paintEndpoints(value, variables, underlays = [color('#000'), color('#fff')]) {
  const paints = value.match(/#[a-f\d]{3,8}\b|rgba?\([^)]*\)|var\([^)]*\)/gi);
  assert.ok(paints?.length, `No se puede medir fondo: ${value}`);
  return paints.flatMap(value => underlays.map(background => over(color(value, variables), background)));
}

test('navegación legible sobre menta, tanto en claro como oscuro', () => {
  const nav = declarationsFor(allCssRecords, '.nav');
  for (const [theme, variables] of [['claro', lightVariables], ['oscuro', darkVariables]]) {
    const darkControls = theme === 'oscuro' ? declarationsFor(allCssRecords, 'html[data-theme="dark"] :is(.brand, .brand span, .nav-links, .menu-toggle, .theme-toggle, .language-toggle)') : {};
    const backgrounds = paintEndpoints(nav['background-color'] ?? nav.background, variables, [color(variables['--paper'], variables), color('#ddefe6')]);
    for (const selector of ['.brand', '.brand span', '.nav-links', '.menu-toggle', '.theme-toggle', '.language-toggle']) {
      const control = { ...declarationsFor(allCssRecords, selector), ...darkControls };
      for (const background of backgrounds) minimum(color(control.color, variables), background, 4.5, `${theme}: ${selector}`);
    }
    const hover = declarationsFor(allCssRecords, '.nav-links a:hover');
    for (const background of backgrounds) minimum(color(hover.color, variables), background, 4.5, `${theme}: enlace de navegación hover`);
  }
});

test('cierres, privacidad y bandas sobre foto conservan texto pequeño legible en ambos temas', () => {
  const sections = [
    { parent: '.closing', children: ['.closing p', '.closing .eyebrow'] },
    { parent: '.proof-band', children: ['.proof-band .eyebrow'] },
    { parent: '.privacy-hero', children: ['.privacy-back', '.privacy-back:hover', '.privacy-lead', '.privacy-hero .eyebrow'] },
    { parent: '.privacy-contact', children: ['.privacy-contact h2', '.privacy-contact p', '.privacy-contact .eyebrow'] },
  ];
  for (const [theme, variables] of [['claro', lightVariables], ['oscuro', darkVariables]]) for (const section of sections) {
    const parent = { ...declarationsFor(allCssRecords, section.parent), ...(theme === 'oscuro' ? declarationsFor(allCssRecords, `html[data-theme="dark"] ${section.parent}`) : {}) };
    const surfaces = paintEndpoints(parent['background-color'] ?? parent.background, variables);
    for (const selector of [section.parent, ...section.children]) {
      const child = { ...declarationsFor(allCssRecords, selector), ...(theme === 'oscuro' ? declarationsFor(allCssRecords, `html[data-theme="dark"] ${selector}`) : {}) };
      const foreground = child.color ?? parent.color;
      assert.ok(foreground, `${theme}: falta color o herencia conocida para ${selector}`);
      for (const surface of surfaces) minimum(color(foreground, variables), surface, 4.5, `${theme}: ${selector}`);
    }
    const toc = declarationsFor(allCssRecords, '.privacy-toc');
    const tocBackground = color(toc.background ?? variables['--paper'], variables);
    const tocLink = declarationsFor(allCssRecords, '.privacy-toc a');
    minimum(color(tocLink.color, variables), tocBackground, 4.5, `${theme}: índice de privacidad`);
    const active = { ...declarationsFor(allCssRecords, '.privacy-toc a[aria-current]'), ...(theme === 'oscuro' ? declarationsFor(allCssRecords, 'html[data-theme="dark"] .privacy-toc a[aria-current]') : {}) };
    minimum(color(active.color ?? tocLink.color, variables), active.background ? color(active.background, variables) : tocBackground, 4.5, `${theme}: índice activo de privacidad`);
    const mobileRecords = allCssRecords.filter(record => record.context.some(context => /max-width/.test(context))).map(record => ({ ...record, context: [] }));
    const mobileToc = { ...toc, ...declarationsFor(mobileRecords, '.privacy-toc') };
    const mobileLink = { ...tocLink, ...declarationsFor(mobileRecords, '.privacy-toc a') };
    const mobileActive = { ...active, ...declarationsFor(mobileRecords, '.privacy-toc a[aria-current]'), ...(theme === 'oscuro' ? declarationsFor(mobileRecords, 'html[data-theme="dark"] .privacy-toc a[aria-current]') : {}) };
    // The mobile index is translucent above the privacy body's paper surface, not an opaque paint.
    const mobileBackground = over(color(mobileToc.background ?? variables['--paper'], variables), color(variables['--paper'], variables));
    minimum(color(mobileLink.color, variables), mobileBackground, 4.5, `${theme}: índice móvil de privacidad`);
    minimum(color(mobileActive.color, variables), color(mobileActive.background, variables), 4.5, `${theme}: índice móvil activo de privacidad`);
  }
});

test('badge Destacado es legible sobre imágenes claras/oscuras y en contraste aumentado', () => {
  const base = declarationsFor(allCssRecords, '.featured-badge');
  const states = [base];
  for (const record of allCssRecords) if (record.selector === '.featured-badge' && record.context.some(context => /prefers-(?:contrast|reduced-transparency)/.test(context))) {
    states.push({ ...base, ...Object.fromEntries(record.declarations.map(({ property, value }) => [property, value])) });
  }
  for (const state of states) for (const background of paintEndpoints(state['background-color'] ?? state.background, lightVariables)) {
    minimum(color(state.color, lightVariables), background, 4.5, 'Badge Destacado');
  }
});

test('el botón principal es verde sereno, distinguible y legible en reposo y hover', () => {
  const baseButton = { ...declarationsFor(allCssRecords, '.btn'), ...declarationsFor(allCssRecords, '.btn.primary') };
  for (const [theme, variables] of [['claro', lightVariables], ['oscuro', darkVariables]]) {
    const button = theme === 'oscuro' ? { ...baseButton, ...declarationsFor(allCssRecords, 'html[data-theme="dark"] .btn.primary') } : baseButton;
    const fill = button['background-color'] ?? button.background;
    assert.deepEqual(color(fill, variables), color('#4f7868'), `${theme}: relleno del botón principal`);
    assert.deepEqual(color(button.color, variables), color('#fffdfa'), `${theme}: texto del botón principal`);
    minimum(color(button.color, variables), color(fill, variables), 4.5, `${theme}: botón principal`);
    const hover = { ...button, ...declarationsFor(allCssRecords, '.btn.primary:hover'), ...(theme === 'oscuro' ? declarationsFor(allCssRecords, 'html[data-theme="dark"] .btn.primary:hover') : {}) };
    const hoverFill = hover['background-color'] ?? hover.background;
    assert.deepEqual(color(hoverFill, variables), color('#426757'), `${theme}: variación de hover`);
    minimum(color(hover.color, variables), color(hoverFill, variables), 4.5, `${theme}: botón principal hover`);
  }
  minimum(color('#356b58'), color('#f7f5f2'), 3, 'Verde de foco sobre blanco cálido');
  const focus = declarationsFor(allCssRecords, ':focus-visible');
  const focusColors = (focus['outline-color'] ?? focus.outline).match(/#[a-f\d]{3,8}\b|rgba?\([^)]*\)|var\([^)]*\)/gi);
  assert.ok(focusColors?.length, 'El foco global conserva un color explícito');
  minimum(color(focusColors.at(-1), lightVariables), color(lightVariables['--paper'], lightVariables), 3, 'Foco global sobre claro');
  const darkFocus = {
    ...focus,
    ...declarationsFor(allCssRecords, 'html[data-theme="dark"] :focus-visible'),
    ...declarationsFor(allCssRecords, ':where(html[data-theme="dark"]) :focus-visible'),
  };
  const darkFocusColors = (darkFocus['outline-color'] ?? darkFocus.outline).match(/#[a-f\d]{3,8}\b|rgba?\([^)]*\)|var\([^)]*\)/gi);
  for (const surface of ['--paper', '--paper-2']) minimum(color(darkFocusColors.at(-1), darkVariables), color(darkVariables[surface], darkVariables), 3, `Foco global oscuro sobre ${surface}`);
  // Amber remains available for legacy semantic details, never for primary actions or small text.
  assert.ok(contrast(color('#d97706'), color('#f7f5f2')) < 3);
});

test('todos los pozos de imágenes usan la misma familia menta sin alterar las capturas', () => {
  const lightSelectors = [
    '.project-media', '.project-media:has(img.phone-shot)', '.project-featured .project-media',
    ...['control-gastos-pro', 'evidencia-visual', 'formatos-pdf-excel', 'reporte-servicio-pro', 'museum-of-you', 'mcp-dual-llm-guard'].map(id => `.project[data-project-id="${id}"] .project-media`),
    '.detail-media',
  ];
  for (const selector of lightSelectors) {
    const style = declarationsFor(allCssRecords, selector);
    assert.deepEqual(solidPaint(style['background-color'] ?? style.background, lightVariables), color('#e2eee7'), `Claro: ${selector}`);
  }
  const darkSelectors = [
    'html[data-theme="dark"] .project-media',
    ...['control-gastos-pro', 'evidencia-visual', 'formatos-pdf-excel', 'reporte-servicio-pro', 'museum-of-you', 'mcp-dual-llm-guard'].map(id => `html[data-theme="dark"] .project[data-project-id="${id}"] .project-media`),
    'html[data-theme="dark"] .detail-media',
    'html[data-theme="dark"] .detail-media:has(.detail-image[src$=".svg"])',
  ];
  for (const selector of darkSelectors) {
    const style = declarationsFor(allCssRecords, selector);
    assert.deepEqual(solidPaint(style['background-color'] ?? style.background, darkVariables), color('#2b3e34'), `Oscuro: ${selector}`);
  }
  const featured = declarationsFor(allCssRecords, '.projects > .project.project-featured');
  assert.deepEqual(color(featured['border-color'], lightVariables), color('rgba(53,107,88,.42)'), 'Borde destacado sin naranja');
});
