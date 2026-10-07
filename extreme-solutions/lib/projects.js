import { readFileSync } from 'node:fs';

export const projects = JSON.parse(readFileSync(new URL('../data/projects.json', import.meta.url), 'utf8'));
export const translations = JSON.parse(readFileSync(new URL('../data/translations.json', import.meta.url), 'utf8'));
const reverseTranslations = Object.fromEntries(Object.entries(translations).map(([spanish, english]) => [english, spanish]));
export const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const translate = (value, language = 'es') => language === 'en'
  ? (translations[value] || value)
  : (reverseTranslations[value] || value);

const ids = new Set();
for (const project of projects) {
  if (!/^[a-z0-9-]+$/.test(project.id) || ids.has(project.id)) throw new Error('Invalid or duplicate project id');
  ids.add(project.id);
  if (!['android', 'web', 'tools'].includes(project.category)) throw new Error('Invalid category');
  if (!project.title || !project.description || !Array.isArray(project.tags)) throw new Error('Incomplete project');
  if (!/^\/assets\/[a-zA-Z0-9.-]+$/.test(project.image) && !project.image.startsWith('https://')) throw new Error('Invalid image');
  for (const link of project.links) if (new URL(link.url).protocol !== 'https:') throw new Error('Unsafe project link');
  if (project.privacy !== undefined && !/^[a-z0-9-]+$/.test(project.privacy)) throw new Error('Invalid privacy anchor');
  const cert = project.certification;
  if (cert !== undefined && (!/^[a-f0-9]{16}$/.test(cert.id) || !/^[a-f0-9]{64}$/.test(cert.codeHash) || !/^[a-f0-9]{64}$/.test(cert.signature)
    || !Number.isInteger(cert.score) || cert.score < 0 || cert.score > 100 || new URL(cert.repositoryUrl).protocol !== 'https:' || !Array.isArray(cert.findings))) throw new Error('Invalid certification');
}

// Certificado de verificación independiente (p. ej. M8ven), renderizado en el servidor: HTML y SVG estáticos, sin scripts.
function certificate(cert, tr) {
  const issuer = escape(cert.issuer);
  const title = tr(`Verificado por ${cert.issuer}`);
  return `<section class="cert" aria-labelledby="cert-title">
    <div class="cert-head">
      <svg class="cert-seal" viewBox="0 0 120 120" role="img" aria-label="${escape(tr(`Sello: Verificado por ${cert.issuer}`))}">
        <circle cx="60" cy="60" r="56" fill="none" stroke="#67e8f9" stroke-width="2" stroke-dasharray="3 5"/>
        <circle cx="60" cy="60" r="47" fill="#0e9bb8" fill-opacity=".14" stroke="#38bdf8" stroke-width="3"/>
        <path d="M60 30l22 8v17c0 15-9 26-22 31-13-5-22-16-22-31V38z" fill="#0b1220" stroke="#38bdf8" stroke-width="3" stroke-linejoin="round"/>
        <path d="M50 58l7 7 14-15" fill="none" stroke="#67e8f9" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="60" y="101" text-anchor="middle" font-size="10" font-weight="800" letter-spacing="2" fill="#67e8f9" font-family="system-ui, sans-serif">${issuer.toUpperCase()}</text>
      </svg>
      <div class="cert-title"><p class="eyebrow">${escape(tr('Certificación independiente'))}</p><h2 id="cert-title">${escape(title)}</h2>
      <p class="cert-statement">${escape(tr(`Firmado criptográficamente por ${cert.issuer}; el hash vincula la puntuación con esta versión exacta del código.`))}</p></div>
      <div class="cert-score"><span class="cert-score-value">${cert.score}</span><span class="cert-score-max">/100</span><span class="cert-score-label">${escape(tr('Puntuación de confianza'))}</span></div>
    </div>
    <dl class="cert-fields">
      <div><dt>${escape(tr('ID de verificación'))}</dt><dd><code>${escape(cert.id)}</code></dd></div>
      <div><dt>${escape(tr('Repositorio'))}</dt><dd><a href="${escape(cert.repositoryUrl)}" target="_blank" rel="noopener noreferrer">${escape(cert.repository)}</a></dd></div>
      <div><dt>${escape(tr('Verificado'))}</dt><dd><time datetime="${escape(cert.verifiedAt)}">${escape(tr(cert.verified))}</time></dd></div>
      <div class="cert-wide"><dt>${escape(tr('Hash del código (SHA-256)'))}</dt><dd><code class="cert-hash">${escape(cert.codeHash)}</code></dd></div>
      <div class="cert-wide"><dt>${escape(tr('Firma HMAC'))}</dt><dd><code class="cert-hash">${escape(cert.signature)}</code></dd></div>
    </dl>
    <h3>${escape(tr('Hallazgos clave'))}</h3>
    <ul class="cert-findings">${cert.findings.map(item => `<li>${escape(tr(item))}</li>`).join('')}</ul>
  </section>`;
}


const PHONE_SHOT_IDS = new Set(['evidencia-visual', 'formatos-pdf-excel', 'control-gastos-pro', 'reporte-servicio-pro', 'museum-of-you']);
function mediaClass(project) {
  if (project.id === 'ltv-maestro') return ' class="ltv-media"';
  if (PHONE_SHOT_IDS.has(project.id)) return ' class="phone-shot"';
  return '';
}
function detailMediaClass(project) {
  if (project.id === 'ltv-maestro') return ' detail-image--logo';
  if (PHONE_SHOT_IDS.has(project.id)) return ' detail-image--phone';
  return '';
}

export function card(project) {
  return `<article class="project${project.featured ? ' project-featured' : ''}" data-category="${project.category}" data-project-id="${project.id}">
    <div class="project-media">${project.featured ? '<span class="featured-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg><span>Destacado</span></span>' : ''}<img loading="lazy" decoding="async" src="${escape(project.image)}" alt="${escape(project.alt)}"${mediaClass(project)}></div>
    <div class="project-body"><span class="project-type">${escape(project.type)}</span>
    <h3>${escape(project.title)}</h3><p>${escape(project.description)}</p>
    <div class="chips">${project.tags.map(tag => `<span class="chip">${escape(tag)}</span>`).join('')}</div>
    <div class="project-links"><a class="project-video" href="/proyecto/${project.id}">Explorar proyecto →</a>
    <button class="save-project" type="button" data-save="${project.id}" aria-pressed="false" aria-label="Guardar ${escape(project.title)}" hidden>Guardar</button></div></div></article>`;
}

export function projectPage(project, requestedLanguage = 'es') {
  const language = requestedLanguage === 'en' ? 'en' : 'es';
  const tr = value => translate(value, language);
  const title = tr(project ? project.title : 'Proyecto no encontrado');
  const languageQuery = language === 'en' ? '?lang=en' : '';
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escape(title)} | Extreme Solutions</title><meta name="description" content="${escape(tr(project?.description || 'Consulta los proyectos de Extreme Solutions.'))}">
    ${project ? '' : '<meta name="robots" content="noindex">'}
    <link rel="icon" type="image/png" href="/assets/embedded-1.png"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/dynamic.css"><script src="/i18n-data.js"></script><script src="/i18n.js"></script><script src="/preferences.js"></script></head>
    <body><a class="skip-link" href="#contenido">${escape(tr('Saltar al contenido'))}</a>
    <nav class="nav is-scrolled" aria-label="${escape(tr('Principal'))}"><div class="nav-inner"><a class="brand" href="/${languageQuery}"><span>Extreme Solutions</span></a><div class="detail-preferences"><button class="language-toggle" type="button" hidden>${escape(tr('Cambiar idioma'))}</button><button class="theme-toggle" type="button" hidden>${escape(tr('Cambiar tema'))}</button></div></div></nav>
    <main class="detail-page shell" id="contenido"><a href="/${languageQuery}#experiencia">${escape(tr('← Todos los proyectos'))}</a>
    <div class="detail-heading"><p class="eyebrow">${escape(tr(project?.type || 'Error 404'))}</p><h1>${escape(title)}</h1></div>
    ${project ? `<div class="detail-layout"><div><p class="lead">${escape(tr(project.description))}</p><h2>${escape(tr('Tecnologías y capacidades'))}</h2><div class="chips">${project.tags.map(tag => `<span class="chip">${escape(tr(tag))}</span>`).join('')}</div>
    <div class="detail-actions">${project.links.map(link => `<a class="btn dark" href="${escape(link.url)}" target="_blank" rel="noreferrer">${escape(tr(link.label))}</a>`).join('')}${project.privacy ? `<a class="btn light" href="/privacidad${languageQuery}#${project.privacy}">${escape(tr('Política de privacidad'))}</a>` : ''}</div></div>
    <div class="detail-media"><img class="detail-image${detailMediaClass(project)}" src="${escape(project.image)}" alt="${escape(tr(project.alt))}"></div></div>${project.certification ? certificate(project.certification, tr) : ''}` : `<p>${escape(tr('Este proyecto no existe. Vuelve al catálogo para explorar las soluciones disponibles.'))}</p>`}
    </main><footer><span>© 2026 Extreme Solutions · Erik Sanchez</span> <span class="footer-links"><a href="/privacidad${languageQuery}">${escape(tr('Privacidad'))}</a><a href="/privacidad${languageQuery}#aviso-legal">${escape(tr('Aviso legal'))}</a></span> <span class="footer-legal">${escape(tr('Sitio informativo, sin garantías. Las marcas de terceros pertenecen a sus titulares.'))}</span></footer></body></html>`;
}
