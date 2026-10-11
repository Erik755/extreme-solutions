import test from 'node:test';
import assert from 'node:assert/strict';
import { projects, card, projectPage, translate } from '../lib/projects.js';
import handler from '../api/project.js';

test('all catalog projects have server-rendered details and escaped content', () => {
  for (const project of projects) {
    assert.ok(card(project).includes(`/proyecto/${project.id}`));
    assert.ok(projectPage(project).includes(project.title));
  }
  const malicious = { ...projects[0], title: '<script>alert(1)</script>' };
  assert.ok(!projectPage(malicious).includes('<script>alert(1)</script>'));
});

test('project details are fully available in English', () => {
  for (const project of projects) {
    const html = projectPage(project, 'en');
    assert.ok(html.includes('<html lang="en">'));
    assert.ok(html.includes(translate(project.title, 'en')));
    assert.ok(html.includes(translate(project.description, 'en')));
    assert.ok(html.includes('Technologies and capabilities'));
    assert.ok(html.includes('/?lang=en#experiencia'));
    assert.ok(!html.includes('Tecnologías y capacidades'));
  }
  assert.ok(projectPage(undefined, 'en').includes('Project not found'));
});

function request(method, slug, lang) {
  const result = { headers: {} };
  handler({ method, query: { slug, lang } }, {
    setHeader: (key, value) => { result.headers[key] = value; },
    status(code) { result.status = code; return this; },
    end(body) { result.body = body; }
  });
  return result;
}
test('project endpoint: 200, 404, HEAD, and unsupported method', () => {
  assert.equal(request('GET', projects[0].id).status, 200);
  assert.equal(request('GET', '../../secrets').status, 404);
  assert.equal(request('GET', 'missing').status, 404);
  assert.equal(request('HEAD', projects[0].id).body, undefined);
  assert.equal(request('POST', projects[0].id).status, 405);
  assert.ok(request('GET', projects[0].id, 'en').body.includes('<html lang="en">'));
});

test('public export excludes internal docs, tests, scripts and config', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const out = join(mkdtempSync(join(tmpdir(), 'es-export-')), 'dist');
  execFileSync(process.execPath, [new URL('../scripts/export-public.mjs', import.meta.url).pathname, out]);
  const files = readdirSync(out);
  assert.ok(files.includes('index.html') && files.includes('base.css') && files.includes('i18n-data.js') && files.includes('assets'));
  assert.ok(files.includes('privacidad.html') && files.includes('privacy.js') && files.includes('privacy.css'));
  for (const hidden of ['package.json', 'vercel.json', 'tests', 'scripts', 'lib', 'data', 'api', 'VERCEL_READY.md', 'ARCHITECTURE.md', 'STRIPE_SETUP.md', 'stripe-test.html']) {
    assert.ok(!files.includes(hidden), `${hidden} must not be public`);
  }
  assert.ok(files.every(name => !name.endsWith('.md')));
});

test('privacy page is public, fully translated and linked from project pages', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../privacidad.html', import.meta.url), 'utf8');
  const translations = JSON.parse(readFileSync(new URL('../data/translations.json', import.meta.url), 'utf8'));
  const sameInBothLanguages = new Set(['Extreme Solutions', 'Reporte Servicio Pro', 'Reporte de Servicio', 'Reporte de servicio Danobat', 'extreme-solutions-eosin.vercel.app', 'Control de Gastos Pro',
    'The Museum of You', 'LTV Maestro · La Tercera Vuelta', 'Contactos', 'sanchezerik836@gmail.com',
    'com.reporteservicio.pro', 'com.reporteservicio.reporter', 'app.lentes.camaras', '© 2026 Extreme Solutions · Erik Sanchez']);
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').split('<body')[1];
  const texts = [...body.matchAll(/>([^<>]+)</g)].map(match => match[1].trim()).filter(text => /\p{L}/u.test(text));
  const decode = text => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const untranslated = texts.map(decode).filter(text => !translations[text] && !sameInBothLanguages.has(text) && !text.startsWith('erik755.github.io/'));
  assert.deepEqual(untranslated, []);
  for (const attribute of [...html.matchAll(/(?:placeholder|aria-label|content)="([^"]+)"/g)].map(match => match[1])) {
    if (/\p{L}{3,}/u.test(attribute) && !/width=|index,follow|UTF-8/.test(attribute) && attribute !== 'Extreme Solutions') assert.ok(translations[attribute], attribute);
  }
  assert.ok(!/<script>(?!<\/script>)|\sstyle="|\son[a-z]+="/i.test(html), 'no inline scripts, styles or handlers (CSP)');
  for (const project of projects.filter(item => item.privacy)) {
    assert.ok(html.includes(`id="${project.privacy}"`), `privacy anchor for ${project.id}`);
    assert.ok(projectPage(project).includes(`/privacidad#${project.privacy}`));
    assert.ok(projectPage(project, 'en').includes(`/privacidad?lang=en#${project.privacy}`));
  }
});

test('privacy center includes the LFPDPPP notice, full app notices and legal notice', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../privacidad.html', import.meta.url), 'utf8');
  for (const id of ['aviso', 'aviso-legal', 'museum', 'reporte-de-servicio-danobat', 'sitio-web']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('com.reporteservicio.reporter'));
  assert.ok(html.includes('Derechos ARCO') && html.includes('Secretaría Anticorrupción y Buen Gobierno'));
  for (const url of ['https://www.cloudflare.com/privacypolicy/', 'https://ai.google.dev/gemini-api/terms', 'https://groq.com/privacy-policy', 'https://www.linkedin.com/legal/cookie-policy']) assert.ok(html.includes(url), url);
  for (const link of html.match(/<a [^>]*target="_blank"[^>]*>/g)) assert.ok(link.includes('rel="noopener noreferrer"'), link);
});

test('home page loads LinkedIn only after consent and states the payment module is a sample', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('<script src="https://platform.linkedin.com'), 'no static LinkedIn script');
  assert.ok(html.includes('data-linkedin-consent') && html.includes('/linkedin-consent.js'));
  assert.ok(html.includes('no procesa pagos') && html.includes('/privacidad#aviso-legal'));
  assert.ok(!/<script>(?!<\/script>)|\sstyle="|\son[a-z]+="/i.test(html), 'no inline scripts, styles or handlers (CSP)');
});

test('Lentes: insignia de Google Play, canonical, Open Graph y JSON-LD válidos', () => {
  const lentes = projects.find(p => p.id === 'lentes');
  for (const lang of ['es', 'en']) {
    const html = projectPage(lentes, lang);
    assert.ok(html.includes('href="https://play.google.com/store/apps/details?id=app.lentes.camaras"'));
    assert.ok(html.includes(`/assets/google-play-badge-${lang}.png`));
    assert.ok(html.includes('rel="canonical"') && html.includes('og:image') && html.includes('twitter:card'));
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    assert.equal(blocks[0]['@type'], 'SoftwareApplication');
    assert.equal(blocks[0].offers.price, '0');
    assert.ok(!('aggregateRating' in blocks[0]));
    assert.equal(blocks[1]['@type'], 'FAQPage');
    assert.equal(blocks[1].mainEntity.length, 4);
  }
  assert.ok(!projectPage(projects.find(p => p.id === 'reporte-servicio-pro')).includes('rel="canonical"'));
});
