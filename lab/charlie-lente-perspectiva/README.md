# Lente en perspectiva (Charlie, laboratorio)

La malla de la portada vista de lado y en perspectiva, como la escena 0 de `portada/curvatura.js`: un plano de líneas que se hunde en un embudo cuando sube la masa. En el fondo del embudo está el agujero, visto con la misma cámara inclinada que la malla: el punto dorado que se abre en anillo de Einstein, la sombra y el disco caliente, que se ve como una elipse aplastada con su parte de atrás curvada por encima de la sombra, como en Interstellar. Sirve para ver la curvatura en 3D, no solo de frente.

Basado en [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT).

## Cómo encaja la lente

- **La malla** son líneas de verdad: tiras de triángulos que el vertex shader engorda en pantalla, como en la portada, no una rejilla pintada con `fwidth()`. Así baja curvada y sin cortes por la pared empinada del embudo. Profundidad `-9,6·hondo / √(1 + r²)` (un 60 % más honda que la portada), donde `hondo` es la curva propia del embudo, que crece desde 0,1 hasta 1; al final se retuerce alrededor del agujero (arrastre) y cada latido manda una onda desde el fondo.
- **El agujero** se ve con la cámara de la malla: cada píxel lanza un rayo desde la cámara y, si pasa cerca, se sigue paso a paso con la curvatura de Schwarzschild escrita como fuerza (a = −1,5 · rs · h² · p / |p|⁵, que da las órbitas de la luz exactas). El disco está en el plano horizontal del agujero, de 3 a 9 radios de Schwarzschild; al cruzarlo, el rayo suma su luz. Si cae dentro, es sombra; al salir, mira si llega al punto dorado, que está 7 unidades detrás. Así salen sin pintarlos aparte el disco aplastado, su parte de atrás curvada por encima de la sombra (y una copia fina por debajo) y la sombra. El punto dorado y su anillo de Einstein se calculan con la lente fina en una coordenada vertical aplastada por la inclinación con la que se ve el plano del agujero, así que el anillo sale tumbado como el disco. La sombra y el anillo de fotones siguen siendo redondos. Las curvas de los tramos se copian de `../charlie-lente/lente.js` (de allí solo se importa `latido()`) y la lente 2D no cambia.
- **El agujero va en la garganta del embudo**, a la altura en la que la malla tiene el mismo radio que la sombra (1,0 unidades con la masa a 1). La lente se pinta primero, sobre negro, y la malla se suma encima. La malla no se pinta donde la tapa la sombra (lo que queda detrás del agujero) ni dentro del agujero: las líneas de detrás mueren en el borde de la sombra y las de la pared de delante pasan por delante de su mitad de abajo y mueren en la garganta.
- **La cámara** mira desde 26° por encima del plano, siempre al mismo punto (media altura del embudo a fondo): no baja con la masa, así que el embudo se ve hundirse en la pantalla. La imagen se corre (sin girar la cámara) para que un punto algo más arriba del agujero a fondo (el 55 % de su hondura en vertical, el 75 % en horizontal) caiga en el centro de la parte libre de la pantalla, la misma que usa la lente: con poca masa la malla no queda pegada arriba y a fondo el agujero baja algo por debajo del centro. En vertical se aleja para que el embudo llene el ancho y, con el panel oculto, el agujero baja a la mitad de la pantalla para que la mitad de abajo no quede vacía.
- **Los tramos** son los de la lente, salvo la hondura: plano hasta 0,1, el embudo se hunde de 0,1 a 1, la curvatura del agujero crece de 0,1 a 0,6, anillo cerrado hacia 0,65, sombra de 0,4 a 0,75 y arrastre desde 0,6.

## La página

La de `../charlie-lente-gpu/`, copiada (la original no cambia): «Masa», «Mover reloj», «Pinta con» (WebGPU o WebGL2, la misma imagen), «Detalle», «Medir las dos», «Medir la espera» (con la frase nivel a nivel del PR #37), «Menos movimiento», «Copiar enlace» y «Ocultar». Un fotograma por enlace: `?t=0.85&r=3.2&motor=gpu|gl&mm=1&nivel=0|1|2&ui=0`.

| Nivel | Píxeles por punto | Líneas por lado | Tramos por línea | Pasos por rayo |
|---|---|---|---|---|
| 2 (escritorio) | hasta 2 | 49 | 320 | hasta 128 |
| 1 (móvil) | hasta 1,5 | 49 | 192 | hasta 96 |
| 0 (mínimo) | 1 | 33 | 96 | hasta 64 |

Solo se siguen paso a paso los rayos que pasan a menos de unas 5 unidades del agujero; los demás van rectos.

Con el nivel en «Automático», si el reloj en marcha va por debajo de 30 cuadros por segundo baja un nivel. «Menos movimiento» (o la preferencia del sistema) quita el giro, el latido y la onda, y el reloj deja de contar. Sin JavaScript se ve `cartel.jpg` (la escena a 0,85) con un aviso.

## Archivos

- `comun.js`: cámara, malla, parámetros y los shaders en GLSL y WGSL (los mismos cálculos).
- `escena-gl.js` y `escena-gpu.js`: la escena en WebGL2 y en WebGPU, con la misma interfaz. La de WebGL2 cumple el contrato del motor y está en el visor como «perspectiva», así que la prueba el workflow «Escenas» con `determinismo.py`.
- `pagina.js`, `index.html`, `perspectiva.css`: la página (usa `lente.css` y `gpu.css` sin cambiarlos).
- `comparar.py`: compara WebGL2 y WebGPU píxel a píxel (Chromium con WebGPU por software).
- `hoja.py`: saca `hoja.jpg` (12 momentos, WebKit 390 × 844, nivel 1) y `poster.jpg`.

## Pruebas (en local)

- **WebGL2 contra WebGPU**, píxel a píxel en Chromium con WebGPU por software y el lienzo en una textura que se puede leer, a 640 × 400 con t = 0; 0,35; 0,6; 0,85 y 1: la diferencia media no llega a 0,001 sobre 255, la máxima es de 5 y ningún píxel se aparta más de 8. Es la misma imagen.
- **Determinismo** (`lab/charlie-visor/determinismo.py --escena perspectiva`, 12 fotogramas): idéntico en Chromium y en WebKit.
- **Anchos** 320, 390 y 1280, en WebKit y en Chromium: sin desborde, ni antes ni después de medir. axe (WCAG 2.2 AA) sin fallos. Sin errores en consola.
- **«Pinta con»** cambia de motor y vuelve; **«Medir las dos»** termina en WebKit (solo WebGL2) y en Chromium con las dos.
- **Menos movimiento**: la imagen no depende del reloj; sin él, sí. Con la preferencia del sistema, la casilla sale marcada.
- **Tope de DPR**: a 390 con pantalla ×3, el lienzo sale a 1,5 (nivel 1). **Baja de nivel**: en Chromium sin GPU, con el reloj en marcha, pasa de 2 a 0 y lo dice.
- **Sin JavaScript**: se ve el cartel con el aviso, sin desborde.
