# Extreme Solutions — despliegue

Repositorio: https://github.com/Erik755/extreme-solutions

En el proyecto existente `extreme-solutions` de Vercel:

1. Settings → Git: conectar `Erik755/extreme-solutions`.
2. Root Directory: la raíz del repositorio. `npm run build` genera `dist/` solo con los
   archivos públicos (HTML, CSS, JS y `assets/`) y `vercel.json` publica esa carpeta;
   las funciones se exponen mediante `api/`. Documentación, tests y scripts no se publican.
3. Framework Preset: **Other**. Build Command y Output Directory se leen de
   `vercel.json`; no es necesario configurarlos manualmente.
4. No se requieren variables de entorno: el sitio no procesa pagos ni contiene una
   tarjeta o enlace de demostración de pasarelas de pago.
5. Desplegar la rama que contenga esta actualización.

El build genera las tarjetas desde `data/projects.json`, sin dependencias externas. La única función
de `api/` es `project.js`, que genera las páginas `/proyecto/:slug`.

## Cambios de interfaz

- Navegación fija con sección activa y menú móvil accesible por teclado.
- Filtros Android, Web y Herramientas e IA.
- Entradas suaves al recorrer secciones y transiciones de botones y tarjetas.
- Respeto a movimiento reducido y contenido disponible sin JavaScript.
- Imágenes recuperadas y recursos incrustados extraídos para permitir caché.
- Sección de pagos retirada por completo, junto con su enlace y las referencias de muestra.

## Vista local

Desde `extreme-solutions/`: `npm run build` y `npm run dev`.
Abrir http://127.0.0.1:4174. Incluye páginas dinámicas.

## Catálogo y preferencias

Editar `data/projects.json` para cambiar proyectos, imágenes, enlaces y tecnologías.
El build actualiza la portada y una plantilla de servidor genera `/proyecto/:slug`.
No se duplican páginas HTML a mano. Para publicar cambios de contenido, hacer commit y desplegar.
Esto no es un CMS en tiempo real: no hay base de datos ni panel de administración.

La búsqueda y categoría se guardan en la URL para compartirlas. El idioma y el
tema se guardan en el navegador, sin cuentas ni transferencia de datos personales.
No hay botones de guardar proyectos ni filtro de favoritos. La retirada no borra
los datos de favoritos de versiones anteriores que puedan existir en el navegador.
Si el almacenamiento está bloqueado, las funciones siguen disponibles durante la visita.

Validación: `npm test`.
