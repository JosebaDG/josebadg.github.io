# Explosión del punto (experimento de Miles)

Experimento del [Laboratorio de animación y vídeo](../README.md), en `/lab/explosion/`: la explosión geométrica de un punto, con controles en directo. Nació el 18/10/2026 como página de experimentos para la portada (entonces en `/lab/`). No es la portada.

Los enlaces compartidos antiguos (`/lab/#s=…`) siguen funcionando: `/lab/` los reenvía aquí con el mismo `#`.

- **Reloj:** todo lo que se dibuja es función de `t` (0 a 1) y de una semilla. `t` sale del desplazamiento, del modo automático o del deslizador de abajo.
- **Estado en la URL:** cada control va en el `#` del enlace. «Compartir» guarda también el momento (`t`) y deja el modo fijo, para que quien lo abra vea el mismo fotograma.
- **Recetas:** Big bang, Cinco, Cristal, Supernova, Espiral, Red y Lonja (con la persiana).
- **Accesibilidad:** con `prefers-reduced-motion` arranca en modo fijo, sin fogonazo y sin animación automática. El lienzo es decorativo (`aria-hidden`) y el texto va en el HTML.
- **Micro vídeos:** `?video=1` oculta la interfaz y expone `labRender(t)`, que devuelve el fotograma exacto de ese `t`. Así se renderizan vídeos fotograma a fotograma con un navegador sin pantalla.

Parámetros del enlace: `s` semilla, `n` fragmentos, `f` forma (tetra, octa, ico, cubo, tri, aguja), `d` reparto (esfera, espiral, anillos, red), `k` simetría, `ca` caos, `ci` uno se hace cinco, `p` colores del equipo, `g` giro, `r` alcance, `ta` tamaño, `z` zoom, `h` hilos, `b` brillo, `gr` grano, `cf`/`ce`/`bg` colores, `pe` persiana, `m` modo (scroll, auto, fijo), `t` momento, `v` velocidad.

Código: `src/lab.js`, empaquetado con esbuild en `lab.min.js` junto a three.js 0.186.1 (MIT). El método (el desplazamiento como reloj y cada fotograma como función de `t`) se inspira en [pdoom-video](https://github.com/mexicat/pdoom-video) (MIT); no copia su código.

```
npm i three@0.186.1 esbuild
npx esbuild src/lab.js --bundle --minify --format=esm --target=es2020 --legal-comments=eof --outfile=lab.min.js
```
