# La Lonja: portada del laboratorio

Web pública en <https://josebadg.github.io/>, servida con GitHub Pages desde `main` (raíz).

La idea: el garaje donde empieza todo. La portada es una lonja con la persiana bajada que sube al desplazar y deja ver lo que hay dentro: los proyectos reales, el equipo, cómo trabajamos y datos en directo.

## Páginas

| Página | URL | Archivos |
| --- | --- | --- |
| Portada (La Lonja) | https://josebadg.github.io/ | `index.html`, `lonja.css`, `lonja.js` |
| miles-drive: página principal | https://josebadg.github.io/miles-drive/ | `miles-drive/index.html`, `estilos.css` |
| miles-drive: política de privacidad | https://josebadg.github.io/miles-drive/privacidad/ | `miles-drive/privacidad/index.html` |
| miles-drive: condiciones del servicio | https://josebadg.github.io/miles-drive/condiciones/ | `miles-drive/condiciones/index.html` |

Las tres páginas de miles-drive son las que pide Google en «Información de la marca» para publicar la pantalla de permisos OAuth. El dominio autorizado es `josebadg.github.io`. **No se mueven ni se cambia lo que dicen.** Si cambian las URL, hay que cambiarlas también en la consola de Google; si no, la app deja de cumplir los requisitos. Su aspecto sí puede seguir al de la portada (`estilos.css` usa la misma paleta).

## La portada por dentro

- **Persiana:** sube con el desplazamiento usando CSS scroll-driven animations. En los navegadores que aún no las tienen, la mueve `lonja.js` con una variable CSS. Sin JavaScript o con «menos movimiento» activado no hay persiana: la lonja aparece abierta. Si el foco del teclado entra en la portada, la persiana se aparta.
- **En directo:** `lonja.js` lee los datos que Pvpc-bridge publica cada noche (`/Pvpc-bridge/datos/<año>.csv` y `actividad.json`) solo cuando el tablero se acerca a la pantalla. No llama a ninguna API externa. Si falla, lo dice y enlaza a la web de Pvpc-bridge.
- **Transiciones entre páginas:** `@view-transition` en los dos CSS, donde el navegador lo admite.
- **Sin dependencias:** ni librerías ni fuentes externas.

## Normas

- Castellano, primero el móvil y accesible (WCAG 2.2 AA). Respetar `prefers-reduced-motion` y `prefers-color-scheme`.
- JavaScript solo como mejora: todo el contenido se lee sin él.
- Sin nombres ni datos personales. El único dato de contacto es el correo del laboratorio.
- Nada inventado: cada proyecto, cifra o historia tiene que existir en un repo público. Nada del canal privado del equipo.
- `.nojekyll` evita que Pages procese el sitio con Jekyll.
