# The Singularity · portada del laboratorio

Web pública en <https://josebadg.github.io/>, servida con GitHub Pages desde `main` (raíz).

## Páginas

| Página | URL |
| --- | --- |
| Portada: The Singularity | https://josebadg.github.io/ |
| Vista previa (pruebas, sin indexar) | https://josebadg.github.io/preview/singularity/ |
| Laboratorio visual (sin indexar) | https://josebadg.github.io/lab/ |
| miles-drive: página principal | https://josebadg.github.io/miles-drive/ |
| miles-drive: política de privacidad | https://josebadg.github.io/miles-drive/privacidad/ |
| miles-drive: condiciones del servicio | https://josebadg.github.io/miles-drive/condiciones/ |

Las URL de miles-drive están registradas fuera de este repo. No se cambian sin actualizar ese registro a la vez.

## Normas

- La portada vive en `index.html` y `portada/`: el scroll es el reloj (método pdoom). `portada/curvatura.js` pinta la escena 0 (el espacio-tiempo curvado hacia el punto, WebGL sin dependencias); `portada/bigbang.min.js` es la capa 3D de Charlie, que se carga después; `portada/punto.js` lleva el reloj y el respaldo 2D. Con «reducir movimiento», fotograma fijo; sin JS o sin WebGL, el cartel `portada/curvatura-cartel.jpg`.
- Logotipo: símbolo A «Pozo» + «THE SINGULARITY» en dorado, con la fuente Archivo (OFL) en `portada/fuentes/`. Piezas y reglas en `portada/marca/LEEME.md`.
- Primero se prueba en `/preview/singularity/` y luego se copia a `portada/`. Castellano, responsive y accesible (WCAG 2.2 AA).
- miles-drive sigue siendo HTML y CSS con un único script, `miles-drive/contacto.js`, que muestra el correo de contacto al pulsar un botón. La portada enlaza su privacidad y sus condiciones.
- Sin nombres ni datos personales. El correo de contacto no se escribe en claro en ningún archivo: se usa el bloque `data-contacto` con `contacto.js`.
- Los textos sobre miles-drive son genéricos: sin proveedores, permisos concretos ni detalles técnicos.
- `.nojekyll` evita que Pages procese el sitio con Jekyll.
