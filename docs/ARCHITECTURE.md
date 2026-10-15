# Evolución del portafolio

## Evaluación de la propuesta del PDF (28 septiembre 2026)

La propuesta acierta al separar datos y presentación, crear rutas de proyectos y
recordar preferencias. No es necesario migrar una landing a Next.js para obtener
esas capacidades. Tampoco SSR garantiza por sí solo mejor rendimiento, y una base
de datos en tiempo real no es un requisito de una interfaz dinámica.

Se mantiene HTML/CSS/JavaScript más una función Node de Vercel para las páginas de proyecto.
`data/projects.json` es la fuente de proyectos. El build genera las tarjetas con una
plantilla compartida; `/proyecto/:slug` devuelve HTML desde una función de servidor.
Las rutas inexistentes devuelven 404. El contenido funciona también sin JavaScript.

La búsqueda y categoría son compartibles mediante URL. Favoritos y tema son
preferencias locales del navegador, con tolerancia a almacenamiento bloqueado.
Los textos de los proyectos se escapan antes de generar HTML y los enlaces del
catálogo se limitan a HTTPS.

## Límites y siguientes decisiones

- El catálogo es versionado: actualizar JSON y desplegar. No hay CMS ni sincronización
  en tiempo real. Si se necesita edición por personas sin Git, elegir un CMS o Firebase
  con autenticación y reglas de acceso antes de implementarlo.
- No hay cuentas de usuario ni función de guardar proyectos como favoritos.
- No se añade una API de IA: faltan un caso de uso, proveedor y límites de gasto.
- No hay integración de Checkout ni webhook de pagos. El 14 de octubre de 2026 también
  se retiró la antigua tarjeta de demostración, sus enlaces y referencias del sitio.
- La skill instalada `skillspool-find-skill` descubre habilidades en Skills Pool;
  no proporciona permisos de GitHub ni migra aplicaciones. Su repositorio contiene
  documentación, no un instalador de código ejecutable. La habilidad que el PDF
  llama `github-skill-generator` no incluye un archivo instalable en el documento.

Referencia de rutas: https://vercel.com/docs/routing/rewrites
Referencia de funciones: https://vercel.com/docs/functions/runtimes/node-js
