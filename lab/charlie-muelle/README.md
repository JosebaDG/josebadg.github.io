# Muelle en T

Experimento de Charlie en el laboratorio de animación y vídeo (20/10/2026), a petición de Joseba. Las cuatro escenas de `/motor/` con una copia del motor que suaviza el tiempo con un muelle: el T del motor deja de copiar al T del desplazamiento y lo **persigue**. Así un desplazamiento brusco con el dedo ya no se come la explosión del big bang en dos o tres fotogramas.

https://josebadg.github.io/lab/charlie-muelle/ (noindex, como todo el laboratorio). `/motor/` no cambia.

## Cómo comparar en el móvil

- **Interruptor «Muelle: sí / no»** arriba. Al cambiarlo, la URL se actualiza para poder compartir el estado.
- **Presets:** suave, medio (por defecto), firme y con rebote. «Ajustar» abre los deslizadores de rigidez ω y amortiguación ζ, y dice cuánto tarda en asentarse.
- **«Golpe»** hace siempre el mismo gesto: pone la página en T 0,2, espera a que el motor esté quieto y la lleva a T 1 (las cinco nubes) en 4 cuadros, como un dedo muy rápido. Se toca con el muelle y sin él y se compara.
- **Lectura «dedo / motor»:** el T del desplazamiento y el que se pinta. Mientras no coinciden, pone «persiguiendo».

Parámetros de la URL: `?muelle=0|1`, `&preset=suave|medio|firme|rebote`, o `&w=2..30&z=0.3..1.5` a mano (los valores fuera de rango se recortan). `&ui=0` quita el panel (para vídeos) y `&registro=1` guarda el T de cada cuadro (para las pruebas: `motor.registro()`).

## El método

Un muelle amortiguado de masa 1 tira del T del motor `x` hacia el T del desplazamiento:

    x'' = ω² · (objetivo − x) − 2·ζ·ω · x'

- `ω` (rad/s) es la rigidez: `ω = √k`. Cuanto más alta, más pegado al dedo.
- `ζ` es la amortiguación: `ζ = c / (2√k)`. Con `ζ = 1` el amortiguamiento es **crítico**.

| Preset | ω | ζ | Se queda a menos del 2 % de un salto en | Se pasa |
|---|---|---|---|---|
| suave | 6 | 1 | 0,97 s | no |
| medio | 9 | 1 | 0,65 s | no |
| firme | 14 | 1 | 0,43 s | no |
| con rebote | 9 | 0,55 | 0,63 s | 12 % |

**Por qué crítico.** Es el que llega antes sin pasarse. En este motor pasarse significa que el tiempo va hacia atrás: con `ζ < 1` la explosión llega a las nubes, se pasa, vuelve a encogerse un poco y vuelve a abrirse. El preset «con rebote» está para verlo, no para quedarse. Con `ζ > 1` no se pasa, pero tarda más en llegar y no gana nada. (El rebote se asienta antes que el medio porque llega al 2 % pasándose; el pico del 12 % es el problema.)

**Integración.** Euler semiimplícito (`v += a·h; x += v·h`) en pasos fijos de como mucho 1/240 s dentro de cada cuadro. Es estable para todo el rango de los deslizadores y da el mismo resultado con la misma secuencia de cuadros. Cuando la distancia baja de 0,0005 secciones (menos de medio píxel) y la velocidad de 0,005 secciones/s, el muelle se queda quieto exactamente en el objetivo y el motor deja de pedir cuadros. El primer cuadro tras estar quieto usa dt = 1/60 s, y si entre dos cuadros pasan más de 250 ms (otra pestaña, el sistema), salta al objetivo sin perseguirlo. El código está en `muelle.js`, 60 líneas sin dependencias.

**Determinismo.** Cada escena sigue pintando en función de `t`, y el contrato de escena no cambia: lo único que cambia es qué `t` se pinta. El mismo T da siempre el mismo fotograma. Mientras persigue, la misma posición del dedo puede dar un fotograma u otro según cómo se llegó a ella. Al asentarse vuelve a ser la misma de siempre. `ctx.T()` de las escenas y los relevos ven el T del motor. `motor.T()` devuelve el que se pinta y `motor.Tscroll()`, el del desplazamiento.

**Con un empujón (flick).** Si el dedo para dentro del big bang o justo después, el muelle convierte el salto en un movimiento que llega sin pasarse y la explosión se ve entera. Si el empujón sigue con inercia hasta mucho más abajo, el muelle solo retrasa el paso un poco: el objetivo se va lejos y el motor también tiene que ir rápido. Las cifras están abajo. Si hiciera falta proteger también ese caso, el paso siguiente sería un tope de velocidad de T (secciones por segundo) o un imán que pare un momento en el big bang. Ninguno de los dos está hecho.

**Con la pausa.** Salto directo: con la pausa puesta el muelle no actúa y el T del motor es el del desplazamiento, como en `/motor/`. Es lo que se espera de «parar el movimiento» y mantiene la regla de las pruebas por fotogramas («se lleva la página a un T concreto con la pausa puesta»).

**Con «reducir movimiento».** Salto directo siempre, aunque la URL pida muelle: el interruptor se desactiva y el panel lo dice. Si la preferencia cambia con la página abierta, el motor lo nota en el siguiente cuadro.

**El reloj del latido no cambia.** Solo avanza cuando hay una escena con latido activa y sin pausa (`enMarcha`), igual que en `/motor/`. El muelle pide cuadros mientras persigue, pero no toca el reloj. La prueba comprueba que, durante el gesto, el reloj avanza exactamente lo mismo que el tiempo, con muelle y sin él.

**El coste.** El texto se mueve con el dedo (es el desplazamiento nativo) y el fondo llega hasta 0,7 s después con el preset medio. En la escena de curvatura, el pozo puede ir un momento por detrás del título.

## Cifras (prueba_muelle.py, WebKit y Chromium)

Cuadros de 1/60 s con el T del motor dentro de la explosión (T 0,42 a 1). Entre paréntesis, el núcleo, del 5 % al 95 % de la explosión: el muelle se acerca a T 1 despacio, y ese final casi no se ve. Los dos navegadores dan lo mismo con un cuadro arriba o abajo: el rAF falso de Playwright va de 16 en 16 ms y el gesto cae en una fase u otra.

| Modo | Golpe (T 0,2 → 1 en 4 cuadros) | Alcanza al dedo | Flick con inercia (6000 px/s, τ 0,325 s) |
|---|---|---|---|
| sin muelle | 2 (2) | al momento | 7–8 (5–6) |
| suave | 86 (43) | 1,1 s | 14 (12) |
| medio | 63–64 (29) | 0,73 s | 11 (11) |
| firme | 42–43 (18–19) | 0,47 s | 10 (8) |

Sin muelle, el golpe enseña la explosión en 2 fotogramas, unos 33 ms. Con el medio la enseña en unos 0,5 s de núcleo y llega a las nubes en 0,73 s.

## Archivos

- `index.html`, `muelle.css`, `panel.js`: la página y el panel. Las escenas, los carteles, la marca y `motor.css` se cargan de `/motor/`, sin copiarlos.
- `motor.js`: copia de `motor/motor.js` con el muelle. Lo añadido va marcado con «MUELLE». Sin muelle (`muelle: null`) se comporta igual que el de `/motor/`.
- `muelle.js`: el muelle y los presets.
- `prueba_muelle.py`: la prueba automática.
- `video.py` y `clips/`: el vídeo lado a lado.

### Diferencias con motor/motor.js

1. `crearMotor` acepta `muelle` (`{ w, z }` o `null`), `registro` y `alCuadro`.
2. En cada cuadro: `objetivo = T()` y `t` sale del muelle, o es el objetivo cuando va directo (sin muelle, con «reducir movimiento», con la pausa o con la pestaña oculta).
3. `ctx.T` de las escenas devuelve el T del motor.
4. Mientras el muelle no está quieto, se pide el cuadro siguiente. El reloj sigue con su regla.
5. La API añade `Tscroll`, `muelle` (`activo`, `directo`, `w`, `z`, `quieto`, `activar()`, `ajustar()`), `registro()` y `vaciarRegistro()`.

Si se llevara a `/motor/`, son estos cinco cambios con el muelle apagado por defecto. `exportar.py` y el visor tienen que seguir fijando T exacto: el visor no usa el motor, y `exportar.py` debería grabar con el muelle apagado o con la pausa puesta, porque el muelle va directo en los dos casos.

## Prueba automática

    python3 lab/charlie-muelle/prueba_muelle.py                    # WebKit y Chromium
    AXE=/ruta/axe.min.js python3 lab/charlie-muelle/prueba_muelle.py --json resultado.json

Sirve la raíz del repo en local y usa el reloj falso de Playwright: `performance.now`, `Date` y `requestAnimationFrame` avanzan solo cuando la prueba lo pide, a 60 cuadros por segundo. Así las cifras no dependen de la máquina. Mide el golpe y el flick con cada modo y comprueba varias cosas:

- sin muelle, con «reducir movimiento» y con la pausa, el T del motor es el del desplazamiento en todos los cuadros;
- con muelle, el big bang dura más que sin él;
- el reloj del latido sigue al tiempo;
- la página carga sin errores ni desbordes en WebKit (390 × 844 y 320 × 640) y Chromium (1280 × 800 y 390 × 844);
- el interruptor apaga el muelle y lo deja en la URL;
- con `AXE`, no hay fallos de WCAG 2.2 AA.

Sale con código 1 si algo falla. Chromium usa SwiftShader para que el big bang cargue sin GPU.

## Vídeo

`clips/muelle-golpe.mp4` y `clips/muelle-poster.jpg` muestran el golpe lado a lado, sin muelle a la izquierda y con el medio a la derecha. Primero va a velocidad real y después se repite el tramo a 1/4. Se rehace con `python3 lab/charlie-muelle/video.py [--preset suave]`: no graba la pantalla, sino que fotografía cada cuadro de 1/60 s con el reloj falso, como `lab/charlie-video/exportar.py`. Solo va en MP4.

## Créditos

El motor sale de [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT). El muelle críticamente amortiguado es física de manual: no hay código de terceros.
