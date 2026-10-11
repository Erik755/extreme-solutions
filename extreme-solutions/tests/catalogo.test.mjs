import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const grid = html.match(/<!-- PROJECTS_START -->([\s\S]*?)<!-- PROJECTS_END -->/)[1];
const cards = grid.split('<article ').slice(1);

test('todas las tarjetas del catálogo comparten la misma estructura; MCP y Lentes van primero como destacados', () => {
  assert.equal(cards.length, 9);
  for (const card of cards) {
    assert.match(card, /^class="project( project-featured)?" /, 'clase distinta en: ' + card.slice(0, 120));
    for (const part of ['class="project-media"', 'class="project-body"', 'class="project-type"', '<h3>', 'class="chips"', 'class="project-links"', 'class="project-video" href="/proyecto/']) assert.ok(card.includes(part), part);
  }
  const featured = cards.filter(card => card.startsWith('class="project project-featured"'));
  assert.equal(featured.length, 2);
  assert.ok(cards[0].includes('data-project-id="mcp-dual-llm-guard"') && cards[0].includes('project-featured'));
  assert.ok(cards[1].includes('data-project-id="lentes"') && cards[1].includes('project-featured'));
  for (const card of featured) assert.ok(card.includes('<span class="featured-badge">') && card.includes('<span>Destacado</span>'));
  for (const card of cards.slice(2)) assert.ok(!card.includes('featured'));
});

test('destacados en el héroe y MCP/Lentes en las listas de herramientas y especialidades, en ES y EN', () => {
  const translations = JSON.parse(readFileSync(new URL('../data/translations.json', import.meta.url), 'utf8'));
  const hero = html.slice(html.indexOf('<header id="inicio"'), html.indexOf('</header>'));
  assert.ok(hero.includes('class="hero-featured"') && hero.includes('href="/proyecto/mcp-dual-llm-guard"') && hero.includes('href="/proyecto/lentes"'));
  const tools = html.slice(html.indexOf('class="tool-grid"'), html.indexOf('</section>', html.indexOf('class="tool-grid"')));
  assert.equal(tools.split('class="tool-card"').length - 1, 6);
  for (const fact of ['Python, MCP (Model Context Protocol)', 'Kotlin', 'WorkManager', 'Google Photos Library API', 'Google Identity Services', 'Google Play Billing']) assert.ok(tools.includes(fact), fact);
  for (const badge of ['Python y MCP', 'Seguridad de agentes de IA']) assert.ok(html.includes(`<span>${badge}</span>`), badge);
  const lentes = JSON.parse(readFileSync(new URL('../data/projects.json', import.meta.url), 'utf8')).find(item => item.id === 'lentes');
  assert.match(lentes.type, /Disponible en Google Play/);
  for (const text of ['Productos destacados', 'Destacados', 'Destacado', 'Seguridad para agentes de IA', 'Cámara por carpetas para Android', 'IA y seguridad', 'Agentes LLM protegidos', 'Python y MCP', 'Seguridad de agentes de IA', 'Patrón Dual LLM', lentes.type]) assert.ok(translations[text], text);
  for (const match of tools.matchAll(/<p>([^<]+)<\/p>/g)) assert.ok(translations[match[1]], match[1].slice(0, 60));
});

test('Reporte Servicio Pro: disponible en Google Play con enlace a la ficha y demo', () => {
  const card = cards.find(c => c.includes('data-project-id="reporte-servicio-pro"'));
  assert.ok(card.includes('Producto Android · Disponible en Google Play'));
  assert.ok(card.includes('Disponible en Google Play.'));
  const project = JSON.parse(readFileSync(new URL('../data/projects.json', import.meta.url), 'utf8')).find(item => item.id === 'reporte-servicio-pro');
  assert.equal(project.links[0].url, 'https://play.google.com/store/apps/details?id=com.reporteservicio.pro');
  assert.equal(project.links[0].label, 'Ver en Google Play →');
  assert.equal(project.links[1].url, 'https://youtu.be/Jkbw1u1hXkk?si=lP8OdGsO1P8lORdo');
  assert.equal(project.privacy, 'reporte-servicio-pro');
  const translations = JSON.parse(readFileSync(new URL('../data/translations.json', import.meta.url), 'utf8'));
  for (const text of [project.type, project.description, ...project.links.map(link => link.label)]) assert.ok(translations[text], text);
  const privacy = readFileSync(new URL('../privacidad.html', import.meta.url), 'utf8');
  assert.ok(privacy.includes('Política 3.0 · app 2.0.15'));
  assert.ok(!privacy.includes('Política 3.0 · app 2.0.13'));
});

test('Plataforma web operativa conserva su texto y su enlace a /proyecto/ltv-maestro', () => {
  const ltv = cards.find(card => card.includes('data-project-id="ltv-maestro"'));
  assert.ok(ltv.includes('<span class="project-type">Plataforma web operativa</span>'));
  assert.ok(ltv.includes('href="/proyecto/ltv-maestro"'));
});

test('MCP Dual LLM Guard: tarjeta de IA con imagen local, enlaces a GitHub y M8ven, y textos en ambos idiomas', () => {
  const guard = cards.find(card => card.includes('data-project-id="mcp-dual-llm-guard"'));
  assert.ok(guard && guard.includes('data-category="tools"') && guard.includes('href="/proyecto/mcp-dual-llm-guard"'));
  assert.ok(guard.includes('src="/assets/mcp-dual-llm-guard.svg"'));
  assert.ok(readFileSync(new URL('../assets/mcp-dual-llm-guard.svg', import.meta.url), 'utf8').startsWith('<svg'));
  const project = JSON.parse(readFileSync(new URL('../data/projects.json', import.meta.url), 'utf8')).find(item => item.id === 'mcp-dual-llm-guard');
  assert.deepEqual(project.links.map(link => link.url), ['https://github.com/Erik755/mcp-dual-llm-guard', 'https://m8ven.ai/mcp/erik755-mcp-dual-llm-guard-m0uqf4']);
  assert.ok(guard.includes('<span class="chip">Verificado por M8ven · 75/100</span>'));
  const translations = JSON.parse(readFileSync(new URL('../data/translations.json', import.meta.url), 'utf8'));
  for (const text of [project.type, project.description, project.alt, 'Verificado por M8ven · 75/100', ...project.links.map(link => link.label), project.certification.verified, ...project.certification.findings]) assert.ok(translations[text], text);
});

test('MCP Dual LLM Guard: el certificado de M8ven se muestra en la página de detalle (ES y EN) sin scripts', async () => {
  const { projects, projectPage } = await import('../lib/projects.js');
  const project = projects.find(item => item.id === 'mcp-dual-llm-guard');
  const es = projectPage(project, 'es');
  const en = projectPage(project, 'en');
  const facts = ['75', '/100', 'a5dad922de9566da', 'Erik755/mcp-dual-llm-guard', 'f39121b5de101ecd20cf6b2607f96678106031052aaac716a3a54dea94b0c504', 'e0477484f17a44ba1bc7504df4d3342955b0cee6342b1bbd22e8b34418ebc830'];
  for (const html of [es, en]) {
    assert.ok(html.includes('class="cert"'));
    for (const fact of facts) assert.ok(html.includes(fact), fact);
    assert.ok(!html.includes('/verified/verify'));
    assert.ok(!/<script>(?!<\/script>)|\sstyle="|\son[a-z]+="/i.test(html.split('<body')[1]), 'sin scripts, estilos ni manejadores en línea (CSP)');
  }
  for (const part of ['Verificado por M8ven', 'Puntuación de confianza', '1 oct 2026, 8:12 p. m. (CST)', 'Firmado criptográficamente por M8ven; el hash vincula la puntuación con esta versión exacta del código.', 'Análisis estático: sin exfiltración de credenciales, sin acceso a archivos sensibles, sin ofuscación', 'Código abierto con licencia y README', 'Ver ficha en M8ven →']) assert.ok(es.includes(part), part);
  for (const part of ['Verified by M8ven', 'Trust Score', 'Oct 1, 2026, 8:12 PM (CST)', 'Cryptographically signed by M8ven; the hash binds the score to this exact code version.', 'Static analysis: no credential exfiltration, no sensitive file access, no obfuscation', 'Open source with license and README', 'View M8ven report →', 'Verification ID', 'Code hash (SHA-256)', 'HMAC signature', 'Key findings']) assert.ok(en.includes(part), part);
  assert.ok(!projectPage(projects.find(item => item.id === 'ltv-maestro')).includes('class="cert"'));
});
