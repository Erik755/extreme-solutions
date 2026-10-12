import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Baseline agreed for the color-only change. Git's clean filters handle CRLF on Windows.
const BASELINE = 'd349b36a30b85c405276bfb5f9359ab24e767164';
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

for (const file of cssFiles) test(`${file}: misma estructura, imágenes, medidas y tipografía; solo cambia color`, () => {
  assertColorOnly(baseline(file), read(file), file);
});

const tree = git(['ls-tree', '-r', '-z', BASELINE], { encoding: 'utf8' }).split('\0').filter(Boolean).map(entry => {
  const match = entry.match(/^\d+ blob ([a-f\d]+)\t(.+)$/s);
  assert.ok(match, `Entrada Git inesperada: ${entry}`);
  return { hash: match[1], path: match[2] };
});
// These three test-only edits are explicitly allowed: existing color assertions and Windows URL paths.
// They are not production content; all other baseline files remain protected.
const allowedFiles = new Set([
  ...cssFiles.map(file => prefix + file), prefix + 'lib/projects.js',
  prefix + 'tests/pulido.test.mjs', prefix + 'tests/portada-3d.test.mjs', prefix + 'tests/projects.test.mjs',
]);

test('todos los activos, datos, JS, 3D, HTML y demás archivos existentes conservan su hash Git', () => {
  const differences = [];
  for (const { hash, path } of tree.filter(entry => !allowedFiles.has(entry.path))) {
    if (!existsSync(resolve(repositoryRoot, path))) { differences.push(`${path}: eliminado`); continue; }
    const actual = git(['hash-object', `--path=${path}`, path], { encoding: 'utf8' }).trim();
    if (actual !== hash) differences.push(`${path}: contenido modificado`);
  }
  const originalPaths = new Set(tree.map(entry => entry.path));
  const currentPaths = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const path of currentPaths) if (!originalPaths.has(path) && path !== prefix + 'tests/palette.test.mjs') {
    differences.push(`${path}: archivo nuevo fuera del alcance de paleta`);
  }
  assert.deepEqual(differences, [], 'Cambios fuera del alcance de paleta');
});

test('index.html y privacidad.html permanecen idénticos al commit base', () => {
  for (const file of ['index.html', 'privacidad.html']) assert.equal(normalizeEol(read(file)), normalizeEol(baseline(file)), file);
});

test('lib/projects.js solo permite hex de fill/stroke en SVG, sin cambiar lógica, textos ni geometría', () => {
  const mask = source => normalizeEol(source).replace(/(<svg\b[\s\S]*?<\/svg>)/g, svg => svg.replace(/\b(fill|stroke)=(['"])#(?:[a-f\d]{8}|[a-f\d]{6}|[a-f\d]{4}|[a-f\d]{3})\2/gi, '$1=$2COLOR$2'));
  assert.equal(mask(read('lib/projects.js')), mask(baseline('lib/projects.js')));
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

test('las cuatro identidades de color raíz corresponden a la paleta acordada', () => {
  for (const [token, expected] of Object.entries({ '--paper': '#f7f5f2', '--ink': '#1f1e1c', '--green': '#1e3a2f', '--amber': '#d97706' })) {
    assert.deepEqual(color(lightVariables[token], lightVariables), color(expected), token);
  }
});

test('texto, texto secundario y enlaces tienen contraste 4.5:1 en temas claro y oscuro', () => {
  for (const [theme, variables] of [['claro', lightVariables], ['oscuro', darkVariables]]) {
    for (const surface of ['--paper', '--paper-2']) for (const foreground of ['--ink', '--ink-2', '--muted', '--blue']) {
      minimum(color(variables[foreground], variables), color(variables[surface], variables), 4.5, `${theme}: ${foreground} sobre ${surface}`);
    }
  }
  minimum(color(lightVariables['--muted'], lightVariables), color('#f7f5f2'), 4.5, 'Texto secundario sobre blanco cálido');
  minimum(color('#f7f5f2'), color('#1e3a2f'), 4.5, 'Blanco cálido sobre verde');
});

test('los textos derivados de paneles verdes y tarjetas oscuras conservan contraste', () => {
  const focusVariables = { ...lightVariables, ...declarationsFor(allCssRecords, '#enfoque') };
  const green = color('#1e3a2f');
  // Check both the green base and the brightest end of the existing translucent card gradient.
  const cardBackground = declarationsFor(allCssRecords, '#enfoque .capability').background;
  const overlays = cardBackground.match(/rgba?\([^)]*\)/g) ?? [];
  const surfaces = [green, ...overlays.map(value => over(color(value, focusVariables), green))];
  for (const foreground of ['--ink', '--ink-2', '--muted']) for (const surface of surfaces) {
    minimum(color(focusVariables[foreground], focusVariables), surface, 4.5, `Panel verde: ${foreground}`);
  }
  const cards = declarationsFor(allCssRecords, 'html[data-theme="dark"] :is(.capability, .tool-card, .method-step, .project, .play-card, .image-panel, footer)');
  for (const token of ['--ink', '--ink-2', '--muted', '--blue']) {
    minimum(color(darkVariables[token], darkVariables), color(cards['background-color'] ?? cards.background, darkVariables), 4.5, `Tarjeta oscura: ${token}`);
  }
});

test('el botón principal ámbar usa texto oscuro; el verde da un foco legible sobre claro', () => {
  const baseButton = { ...declarationsFor(allCssRecords, '.btn'), ...declarationsFor(allCssRecords, '.btn.primary') };
  for (const [theme, variables] of [['claro', lightVariables], ['oscuro', darkVariables]]) {
    const button = theme === 'oscuro' ? { ...baseButton, ...declarationsFor(allCssRecords, 'html[data-theme="dark"] .btn.primary') } : baseButton;
    const fill = button['background-color'] ?? button.background;
    assert.deepEqual(color(fill, variables), color('#d97706'), `${theme}: relleno del botón principal`);
    assert.deepEqual(color(button.color, variables), color('#1f1e1c'), `${theme}: texto del botón principal`);
    minimum(color(button.color, variables), color(fill, variables), 4.5, `${theme}: botón principal`);
  }
  minimum(color('#1e3a2f'), color('#f7f5f2'), 3, 'Verde de foco sobre blanco cálido');
  const focus = declarationsFor(allCssRecords, ':focus-visible');
  const focusColors = (focus['outline-color'] ?? focus.outline).match(/#[a-f\d]{3,8}\b|rgba?\([^)]*\)|var\([^)]*\)/gi);
  assert.ok(focusColors?.length, 'El foco global conserva un color explícito');
  minimum(color(focusColors.at(-1), lightVariables), color(lightVariables['--paper'], lightVariables), 3, 'Foco global sobre claro');
  // Amber is intentionally unsuitable for small text on warm white. Do not round 2.928 up to 3.
  assert.ok(contrast(color('#d97706'), color('#f7f5f2')) < 3);
});
