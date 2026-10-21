# Lente gravitacional: WebGPU frente a WebGL2

Paso 3 de la ruta de Charlie en el laboratorio: la misma lente de `../charlie-lente/`, portada a WebGPU, y una página que mide las dos en el mismo móvil de un toque, en https://josebadg.github.io/lab/charlie-lente-gpu/ (noindex). No toca `/motor/` ni la portada.

Basado en [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT): la idea y las cuentas de `app/src/scenes/spacetime-lens.ts`.

## Cómo se mide

Toca «Medir las dos». Pone las dos al nivel y al tamaño de lienzo que tenga la que se ve, tira 10 cuadros de calentamiento y pinta 120 con cada una, primero WebGL2 y luego WebGPU. En cada cuadro espera a que la GPU acabe (WebGL2 lee un píxel; WebGPU espera a `onSubmittedWorkDone`), así que la cifra es lo que tarda la GPU en pintar un cuadro, no lo que tarda JS en mandarlo. Enseña la mediana y el p90 de cada una, juntas, y cuántas veces va más rápida una que otra (por debajo del 10 % lo da por empate).

Si el navegador no tiene WebGPU (o no da adaptador), lo dice y mide solo WebGL2. Si una se cae a mitad, la página sigue con la otra. Si no hay ninguna, sale un cartel.

## Archivos

- `lente-gpu.js`: la escena en WebGPU, con el mismo contrato que la de WebGL2 (`tramo`, `late`, `iniciar(ctx)` → `pintar`, `medir`, `bajar`, `retirar`, `sincronizar`, `ponerNivel`). El shader es el GLSL portado a WGSL línea a línea; lo que se manda al shader en cada fotograma sale de `parametros()` de `../charlie-lente/lente.js`, que comparten las dos, para que pinten exactamente la misma escena.
- `pagina.js`, `index.html` y `gpu.css`: la página, con un lienzo para cada una (un lienzo no puede tener las dos), el selector «Pinta con», la medición y los controles de la lente de WebGL2. Usa `../charlie-lente/lente.css`.
- `prueba_shader.py`: compara los dos shaders píxel a píxel en siete fotogramas.
- `comparacion.jpg`: WebGL2 a la izquierda, WebGPU a la derecha, en t 0,85.

## Lo que cambia al pasar de GLSL a WGSL

- `@builtin(position)` tiene el origen arriba a la izquierda: no hay que dar la vuelta a y.
- `dFdx`/`dFdy` pasan a `dpdx`/`dpdy`, y WGSL exige llamarlas en flujo uniforme: se calculan antes de cualquier `if` que dependa del píxel.
- `pow()` con base negativa no está definido: los cuadrados van como `x * x` (en las dos, para no cambiar nada).
- Los uniformes van en un solo búfer de 80 bytes (`datosU()`), en el orden del `struct U`.

## Prueba

- `prueba_shader.py` (Chromium sin pantalla, WebGPU con SwiftShader, pintando en una textura): en los siete fotogramas, ningún píxel difiere en más de 7 de 255 en ningún canal; la diferencia media es de 0,6, el ruido de 1/255 que cada uno pone contra los escalones.
- La lente de WebGL2 sale igual que antes de sacar `parametros()`: cuatro capturas en WebKit, idénticas byte a byte con las de `main`.
- La página, sin WebGPU (WebKit a 390 y 320 px, Chromium con WebGPU apagado): carga sin errores, dice que no hay WebGPU, mide solo WebGL2 y no se desborda.
- La página, con WebGPU (Chromium a 1280 y a 390 px): la VM no puede presentar un lienzo WebGPU, así que en la prueba el contexto del lienzo se cambia por una textura del mismo tamaño. Carga, mide las dos, cambia de motor y guarda `motor=` en el enlace, sin errores. Lo único sin probar aquí es la presentación en pantalla: eso, y la cifra buena, salen del móvil.
- axe (WCAG 2.2 AA) sin fallos en WebKit a 390 y 320 px y en Chromium a 1280.

## Enlace a un fotograma

Como la de WebGL2, más `motor=gpu|gl`: `?t=0.85&r=3.2&motor=gpu`. `mm=1` es «menos movimiento», `nivel=0|1|2` fija el nivel y `ui=0` quita los controles. Para scripts: `lente.fotograma(t, r)`, `lente.medirLasDos(n)` y `lente.motores`.
