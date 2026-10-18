# Big bang en 3D (capa 3 de «Un punto»)

Escena three.js del big bang: el punto que respira explota en cinco nubes y, al final, el cielo se recoge en el punto de «singularity·». La fuente es `bigbang.js`; la web carga el compilado `../bigbang.min.js`.

## Cómo se compila

```
cd prototipo/3d
npm ci
npm run build
```

Versiones fijadas en `package.json` y `package-lock.json`: three 0.186.1 y esbuild 0.28.2. El resultado lleva three.js dentro, así que la web no pide nada a ningún CDN. Si se toca `bigbang.js`, hay que volver a compilar y subir `../bigbang.min.js` en el mismo commit.

## Cuándo se carga

`punto.js` lo pide con `import()` al primer desplazamiento o cuando el navegador queda libre tras cargar la página. No se descarga con `prefers-reduced-motion`, con ahorro de datos ni sin WebGPU o WebGL 2. Si falla, sigue el canvas 2D.

## Qué dibuja cada capa

| Tramo | Quién dibuja |
|---|---|
| Escena 0 → 1: punto → cinco nubes | 3D |
| Escena 1 → 2: cinco nubes → hilos | el 3D se funde con el 2D en el primer tercio |
| Escenas 2 y 3: hilos y columnas del precio | 2D |
| Escena 4 → 5: cielo → punto final | 3D, que entra en el primer tercio |

Las nubes salen en los mismos sitios que los cinco puntos del 2D (`posicionesCinco()`), así que el fundido no salta. Si el logotipo marca su punto con `data-punto-final`, la vuelta acaba ahí; si no, en el centro.

## Decisiones y porqués

- **El movimiento va en el vertex shader, no en un compute shader.** Cada partícula lleva su semilla y la GPU calcula su posición con TSL a partir de unos pocos valores del scroll. Descartado: compute con buffers de almacenamiento. Es más potente, pero en la reserva WebGL 2 va peor, y aquí no hace falta física.
- **three.js compilado con esbuild en un solo archivo.** Descartado: copiar `three.webgpu.js` y `three.core.js` tal cual, que son 3,7 MB sin minificar. Compilado pesa 881 KB, unos 249 KB comprimido, y solo se baja después de la apertura.
- **Colores de los tokens `--c-*`.** Si aún no están en el CSS, usa los de `punto.js`. Así cada color vive en un solo sitio.
- **Sin botón de pausa:** el movimiento que no viene del scroll (respirar y girar) se para solo 5 s después del último gesto, que es lo que pide WCAG 2.2.2. Descartado: un botón de pausa, que añade interfaz a una apertura que solo tiene negro y un punto.
- **Presupuesto:** 20 000 partículas en móvil y 100 000 en escritorio (12 000 y 50 000 en equipos con menos de 8 núcleos). Si baja de 30 fps dos veces seguidas en ventanas de 1,5 s, va con la mitad. Por debajo de 4 000 se retira y queda el 2D.

## Pendiente

- La escena del relieve de Nava de Ordunte, que queda para cuando haya biblia de estilo y guion.
- Los hilos y las columnas del precio en 3D. Ahora son del 2D.

three.js es MIT (Copyright 2010-2026 Three.js Authors). La licencia va al final de `../bigbang.min.js`.
