# Lente gravitacional: WebGPU frente a WebGL2

Paso 3 de la ruta de Charlie en el laboratorio: la misma lente de `../charlie-lente/`, portada a WebGPU, y una página que mide las dos en el mismo móvil de un toque, en https://josebadg.github.io/lab/charlie-lente-gpu/ (noindex). No toca `/motor/` ni la portada.

Basado en [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT): la idea y las cuentas de `app/src/scenes/spacetime-lens.ts`.

## Cómo se mide

Toca «Medir las dos». Pone las dos al nivel y al tamaño de lienzo que tenga la que se ve, tira 10 cuadros de calentamiento y pinta 120 con cada una, primero WebGL2 y luego WebGPU. En cada cuadro espera a que la GPU acabe (WebGL2 lee un píxel; WebGPU espera a `onSubmittedWorkDone`), así que la cifra es lo que tarda la GPU en pintar un cuadro, no lo que tarda JS en mandarlo. La cifra principal de cada una es el tiempo del bloque de 120 cuadros dividido entre 120, con décimas; al lado van la mediana y el p90 por cuadro. Con la cifra principal dice cuántas veces va más rápida una que otra (por debajo del 10 % lo da por empate).

**Por qué el bloque y no la mediana:** WebKit (y por tanto cualquier navegador del iPhone) redondea `performance.now()` al milisegundo, y GitHub Pages no puede mandar las cabeceras que darían más precisión. Si un cuadro tarda 3 o 4 ms, la mediana sale en números enteros y el umbral del 10 % lo decidiría el redondeo. El bloque se cronometra en tramos de 10 cuadros seguidos, sin contar la pausa de un `requestAnimationFrame` que suelta el hilo cada 10; son 12 tramos, así que el redondeo se queda por debajo de 0,1 ms por cuadro. En Chromium, que da fracciones de milisegundo, el bloque y la mediana salen parecidos.

Si el navegador no tiene WebGPU (o no da adaptador), lo dice y mide solo WebGL2. Si una se cae a mitad, la página sigue con la otra. Si no hay ninguna, sale un cartel y «Medir las dos» se apaga.

**Cuánto pesa la espera («Medir la espera»):** en el móvil, WebGPU salió más lenta por una diferencia casi fija (0,62 y 0,59 ms) aunque el total cambiaba, y eso apunta a la espera, no al dibujo. Para comprobarlo, este botón mide en los niveles 0 y 2, con cada una, 120 cuadros con la lente y 120 cuadros vacíos: el mismo lienzo, solo borrado, sin dibujar (`pintarVacio()`), esperando a la GPU igual que antes. El cuadro vacío es casi solo mandar el pase y saber que ha acabado. Luego compara la diferencia WebGPU menos WebGL2 con la lente y en vacío: el veredicto va nivel a nivel. Solo dice «es la espera» si en todos los niveles la diferencia en vacío es casi la misma (del 70 al 130 %, o sea, el dibujo no pasa del 30 %), y «es el dibujo» si en todos casi empatan en vacío (menos del 25 %). Si no, dice «en parte» y da la parte de la espera de cada nivel. Si en vacío se separan más que con la lente (más del 130 %), lo da como ruido de la medida, y si alguna diferencia es de menos de 0,3 ms avisa de que está cerca de lo que distingue el reloj y de que conviene repetirla. Al acabar, las dos vuelven al nivel que tenían. En una pantalla de densidad 1 los niveles 0 y 2 tienen el mismo lienzo, y lo dice.

**Tiempo máximo:** la espera de WebGPU (`sincronizar()`) se rinde si se pierde el dispositivo o si la GPU no contesta en 3 s; un cuadro tarda unos 2 ms en el móvil y unos 40 por software. WebGPU sale entonces «sin dato» con el motivo, se suelta y la página sigue con WebGL2. Antes, si el dispositivo se perdía a mitad, `onSubmittedWorkDone()` podía no volver y la medida se quedaba colgada.

## Archivos

- `lente-gpu.js`: la escena en WebGPU, con el mismo contrato que la de WebGL2 (`tramo`, `late`, `iniciar(ctx)` → `pintar`, `pintarVacio`, `medir`, `bajar`, `retirar`, `sincronizar`, `ponerNivel`). El shader es el GLSL portado a WGSL línea a línea; lo que se manda al shader en cada fotograma sale de `parametros()` de `../charlie-lente/lente.js`, que comparten las dos, para que pinten exactamente la misma escena.
- `pagina.js`, `index.html` y `gpu.css`: la página, con un lienzo para cada una (un lienzo no puede tener las dos), el selector «Pinta con», la medición y los controles de la lente de WebGL2. Usa `../charlie-lente/lente.css`.
- `prueba_shader.py`: compara los dos shaders píxel a píxel en siete fotogramas. Con `--hoja` saca además `hoja.jpg`.
- `hoja.jpg`: la hoja de contacto, 12 momentos pintados en WebGPU con los mismos t y reloj que la de `../charlie-lente/` (las dos difieren de media 0,6 de 255).
- `comparacion.jpg`: WebGL2 a la izquierda, WebGPU a la derecha, en t 0,85.

## Que se entienda (Miles)

Probada en un móvil, la imagen gustó mucho, pero no se entendía qué había que mirar ni qué hacía cada mando. Con la regla del laboratorio (cada mando con una frase y lo que se aprende, visible):

- Una línea «Qué ves» cambia con la masa, con los mismos tramos que `parametros()`: espacio plano (menos de 0,1), la masa curva el espacio (hasta 0,4), anillo de Einstein (hasta 0,65) y agujero negro.
- Cada mando lleva debajo qué cambia y qué hay que mirar. «Pinta con» dice que las dos pintan la misma imagen a propósito.
- «Qué probar primero», plegado: cinco pasos, de masa 0 a «Medir las dos».
- El resultado sale también en llano: cuánto tarda cada una por cuadro, qué parte usa de los 8,3 ms que da una pantalla de 120 Hz (16,7 a 60 Hz) y por qué aquí WebGPU no gana. Las cifras de antes siguen debajo.
- El panel ocupa como mucho la mitad de abajo y se desplaza por dentro; en pantallas de 900 px o más va a la derecha. La lente se coloca en la parte libre. Con el panel oculto, o con `ui=0`, vuelve al sitio de siempre (0,42 del alto), así que las hojas y las capturas no cambian.

La cifra en un móvil con WebGPU (nivel 1, 660 × 1146 px): WebGL2 1,68 ms y WebGPU 2,30 ms en la primera medida; 2,08 y 2,67 en la segunda. WebGL2 sale entre 1,3 y 1,4 veces más rápida y las dos usan menos de un tercio del margen a 120 Hz.

## Lo que cambia al pasar de GLSL a WGSL

- `@builtin(position)` tiene el origen arriba a la izquierda: no hay que dar la vuelta a y.
- `dFdx`/`dFdy` pasan a `dpdx`/`dpdy`, y WGSL exige llamarlas en flujo uniforme: se calculan antes de cualquier `if` que dependa del píxel.
- `pow()` con base negativa no está definido: los cuadrados van como `x * x` (en las dos, para no cambiar nada).
- Los uniformes van en un solo búfer de 80 bytes (`datosU()`), en el orden del `struct U`.

## Prueba

- `prueba_shader.py` (Chromium sin pantalla, WebGPU con SwiftShader, pintando en una textura): en los siete fotogramas, ningún píxel difiere en más de 7 de 255 en ningún canal; la diferencia media es de 0,6, el ruido de 1/255 que cada uno pone contra los escalones.
- La lente de WebGL2 sale igual que antes de sacar `parametros()`: cuatro capturas en WebKit, idénticas byte a byte con las de `main`.
- La página, sin WebGPU (WebKit a 390 y 320 px, Chromium con WebGPU apagado): carga sin errores, dice que no hay WebGPU, mide solo WebGL2 y no se desborda.
- La página, con WebGPU (Chromium a 1280 y a 390 px): el equipo de pruebas no puede presentar un lienzo WebGPU, así que en la prueba el contexto del lienzo se cambia por una textura del mismo tamaño. Carga, mide las dos, cambia de motor y guarda `motor=` en el enlace, sin errores. Lo único sin probar aquí es la presentación en pantalla: eso, y la cifra buena, salen del móvil.
- Tiempo máximo (Chromium con WebGPU por software y el lienzo en una textura, a 1280 y a 390 px): si `onSubmittedWorkDone()` deja de volver a mitad, la medida acaba en unos 7 s con WebGPU «sin dato: la GPU no ha contestado en 3 s» y sigue con WebGL2; si el dispositivo se destruye a mitad, acaba con «sin dato: se ha perdido la GPU» y sigue con WebGL2. Sin fallo, las cifras salen como antes.
- Cuadros vacíos (WebKit a 390 y 320, también con menos movimiento; Chromium a 1280 sin WebGPU y con WebGPU por software en textura a 1280 × 1 y 390 × 3): «Medir la espera» termina, vuelve al nivel de antes, «Medir las dos» sigue funcionando después y no hay errores ni desbordes. En el equipo de pruebas el cuadro vacío de WebGL2 tarda unos 0,15 ms y el de WebGPU por software unos 2,4; esa cifra no vale para el móvil, que es donde hay que medirlo. La lente de WebGL2 sale igual que en `main` (captura idéntica byte a byte en WebKit).
- axe (WCAG 2.2 AA) sin fallos en WebKit a 390 y 320 px y en Chromium a 1280.

## Enlace a un fotograma

Como la de WebGL2, más `motor=gpu|gl`: `?t=0.85&r=3.2&motor=gpu`. `mm=1` es «menos movimiento», `nivel=0|1|2` fija el nivel y `ui=0` quita los controles. Para scripts: `lente.fotograma(t, r)`, `lente.medirLasDos(n)`, `lente.medirEspera(n)` y `lente.motores`.
