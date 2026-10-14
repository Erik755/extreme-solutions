# Genera blog/*.html a partir de los artículos Markdown aprobados (ejecutar a mano).
import re, sys, glob, html, json, os
SITE="https://extreme-solutions-eosin.vercel.app"
src=sys.argv[1]; out=os.path.join(os.path.dirname(__file__),'..','blog')
def inline(t):
    t=html.escape(t,quote=False)
    t=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',t)
    def lk(m):
        u=m.group(2).replace(SITE,'') or '/'
        ext=u.startswith('http')
        return f'<a href="{html.escape(u)}"'+(' target="_blank" rel="noreferrer"' if ext else '')+f'>{m.group(1)}</a>'
    return re.sub(r'\[([^\]]+)\]\(([^)]+)\)',lk,t)
def md(body):
    o=[];lst=None;para=[]
    def flush():
        nonlocal lst
        if para: o.append('<p>'+inline(' '.join(para))+'</p>'); para.clear()
        if lst: o.append(f'</{lst}>'); lst=None
    for line in body.splitlines():
        s=line.strip()
        m=re.match(r'^(#{1,4})\s+(.*)',s); ul=re.match(r'^[-*]\s+(.*)',s); ol=re.match(r'^\d+\.\s+(.*)',s)
        if not s or s=='---': flush(); continue
        if m:
            flush(); n=len(m.group(1))
            if n==1: continue
            o.append(f'<h{n}>{inline(m.group(2))}</h{n}>')
        elif ul or ol:
            k='ul' if ul else 'ol'
            if para: o.append('<p>'+inline(' '.join(para))+'</p>'); para.clear()
            if lst!=k:
                if lst: o.append(f'</{lst}>')
                o.append(f'<{k}>'); lst=k
            o.append('<li>'+inline((ul or ol).group(1))+'</li>')
        else:
            if lst: o.append(f'</{lst}>'); lst=None
            para.append(s)
    flush(); return '\n'.join(o)
def page(title,desc,path,main,typ='article'):
    e=lambda x:html.escape(x)
    ld='' if typ!='article' else '<script type="application/ld+json">'+json.dumps({"@context":"https://schema.org","@type":"BlogPosting","headline":title,"description":desc,"inLanguage":"es-MX","author":{"@type":"Person","name":"Erik Sanchez"},"publisher":{"@type":"Organization","name":"Extreme Solutions"},"mainEntityOfPage":SITE+path},ensure_ascii=False).replace('<','\\u003c')+'</script>'
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index,follow">
  <title>{e(title)} | Extreme Solutions</title>
  <meta name="description" content="{e(desc)}">
  <link rel="canonical" href="{SITE}{path}">
  <meta property="og:type" content="{typ}"><meta property="og:site_name" content="Extreme Solutions"><meta property="og:locale" content="es_MX">
  <meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{SITE}{path}">
  <meta property="og:image" content="{SITE}/assets/lentes-feature.png"><meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/webp" href="/assets/embedded-4.webp">
  <link rel="stylesheet" href="/base.css">
  <link rel="stylesheet" href="/showcase.css">
  {ld}
</head>
<body class="blog-page">
  <nav class="nav" aria-label="Principal"><div class="nav-inner">
    <a class="brand" href="/"><img src="/assets/embedded-4.webp" alt=""><span>Extreme Solutions</span></a>
    <div class="nav-links"><a href="/#apps">Apps</a><a href="/blog">Blog</a><a href="/proyecto/lentes">Lentes</a></div>
  </div></nav>
  <main id="contenido" class="section"><div class="shell blog-shell">
{main}
  </div></main>
  <footer>© 2026 Extreme Solutions by Erik Sanchez. <span class="footer-links"><a href="/">Inicio</a><a href="/blog">Blog</a><a href="/privacidad">Privacidad</a></span></footer>
</body>
</html>
'''
posts=[]
for f in sorted(glob.glob(os.path.join(src,'*.md'))):
    t=open(f,encoding='utf8').read()
    fm,body=re.match(r'^---\n(.*?)\n---\n(.*)$',t,re.S).groups()
    g=lambda k:re.search(rf'^{k}:\s*"?(.*?)"?\s*$',fm,re.M).group(1)
    title,desc,slug=g('title'),g('meta_description'),g('slug')
    posts.append((title,desc,slug))
    main=f'''<article class="blog-article">
<p class="eyebrow"><a href="/blog">Blog</a></p>
<h1>{html.escape(title)}</h1>
{md(body)}
<div class="actions blog-cta"><a class="btn primary" href="https://play.google.com/store/apps/details?id=app.lentes.camaras" target="_blank" rel="noreferrer">Descargar Lentes en Google Play</a><a class="btn" href="/proyecto/lentes">Conocer Lentes</a></div>
</article>'''
    open(os.path.join(out,slug+'.html'),'w',encoding='utf8').write(page(title,desc,'/blog/'+slug,main))
items='\n'.join(f'<article class="project blog-card"><div class="project-body"><h2><a href="/blog/{s}">{html.escape(t)}</a></h2><p>{html.escape(d)}</p><a class="project-video" href="/blog/{s}">Leer artículo →</a></div></article>' for t,d,s in posts)
open(os.path.join(out,'index.html'),'w',encoding='utf8').write(page('Blog: fotos y reportes de trabajo en campo','Guías prácticas para organizar fotos de trabajo por cliente u obra y documentar servicios en campo desde el celular.','/blog',f'<div class="section-head"><div><div class="eyebrow">Blog</div><h1>Guías para trabajo en campo</h1></div></div>\n<div class="actions blog-cta blog-play"><a class="btn primary" href="https://play.google.com/store/apps/details?id=app.lentes.camaras" target="_blank" rel="noreferrer">Descargar Lentes en Google Play</a><a class="btn" href="/proyecto/lentes">Conocer Lentes</a></div>\n<div class="blog-list">{items}</div>','website'))
print('\n'.join(s for _,_,s in posts))
