# Lente en perspectiva (Charlie, laboratorio)

La malla de la portada vista de lado y en perspectiva, como la escena 0 de `portada/curvatura.js`: un plano de líneas que se hunde en un embudo cuando sube la masa. En el fondo del embudo va la lente que ya teníamos (`../charlie-lente/`): el punto dorado que se abre en anillo de Einstein, la sombra y el anillo de fotones. Sirve para ver la curvatura en 3D, no solo de frente.

Basado en [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT).

## Cómo encaja la lente

- **La malla** son líneas de verdad: tiras de triángulos que el vertex shader engorda en pantalla, como en la portada, no una rejilla pintada con `fwidth()`. Así baja curvada y sin cortes por la pared empinada del embudo. Profundidad `-6·masa / √(1 + r²)`; al final se retuerce alrededor del agujero (arrastre) y cada latido manda una onda desde el fondo.
- **La lente** es la misma de `../charlie-lente/lente.js`, sin rejilla ni estrellas (eso ya lo pone la malla): se importa su `parametros()` sin tocarla y solo se le dice dónde cae en pantalla el fondo del embudo y qué radio tiene ahí (1,6 unidades proyectadas). Se pinta encima con alfa premultiplicado: la sombra tapa la malla y fuera de la lente la malla se ve tal cual. La malla es transparente, así que el fondo se ve a través de la pared de delante.
- **La cámara** mira desde 26° por encima del plano a media altura del embudo, y la imagen se corre (sin girar la cámara) para que el fondo caiga en el centro de la parte libre de la pantalla, la misma que usa la lente. En vertical se aleja para que el embudo llene el ancho.
- **Los tramos** son los de la lente: plano hasta 0,1, embudo de 0,1 a 0,6, anillo cerrado hacia 0,65, sombra de 0,4 a 0,75 y arrastre desde 0,6.

## La página

La de `../charlie-lente-gpu/`, copiada (la original no cambia): «Masa», «Mover reloj», «Pinta con» (WebGPU o WebGL2, la misma imagen), «Detalle», «Medir las dos», «Menos movimiento», «Copiar enlace» y «Ocultar». No lleva «Medir la espera»: eso se estudia en la lente WebGPU. Un fotograma por enlace: `?t=0.85&r=3.2&motor=gpu|gl&mm=1&nivel=0|1|2&ui=0`.

| Nivel | Píxeles por punto | Líneas por lado | Tramos por línea |
|---|---|---|---|
| 2 (escritorio) | hasta 2 | 49 | 320 |
| 1 (móvil) | hasta 1,5 | 49 | 192 |
| 0 (mínimo) | 1 | 33 | 96 |

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
