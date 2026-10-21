# Vídeos y hojas de contacto del motor

Experimento de Charlie en el laboratorio de animación y vídeo: https://josebadg.github.io/lab/charlie-video/ (noindex).

Saca de cada escena del motor un vídeo corto y una hoja de contacto con 12 momentos. No graba la pantalla: abre el [visor](../charlie-visor/) sin controles, avanza t a mano y fotografía cada fotograma, como `render.ts` de [pdoom-video](https://github.com/mexicat/pdoom-video). Como una escena solo depende de t y del reloj, el vídeo sale igual en un equipo rápido que en uno lento, y no se pierden fotogramas.

## Volver a sacarlos

Desde la raíz del repo, con Playwright para Python (WebKit o Chromium), ffmpeg y Pillow:

```
python3 lab/charlie-video/exportar.py todas
python3 lab/charlie-video/exportar.py bigbang --segundos 6 --fps 30 --navegador webkit
python3 lab/charlie-video/exportar.py intro
python3 lab/charlie-video/exportar.py vuelta --perfil vertical --calidad master
python3 lab/charlie-video/exportar.py bigbang --perfil horizontal --fps 60 --salida /tmp/clips
```

Sirve el repo en local en un puerto libre, así que no sale nada a internet. Por defecto: WebKit (el motor de Safari y de Chrome en el iPhone), ventana de 390 × 844 fotografiada a escala 2 y vídeo de 540 px de ancho a 30 fotogramas por segundo. Curvatura y big bang duran 6 s y la vuelta, 5 s.

## Perfiles y calidades

Cada perfil fija la ventana del navegador, la escala de la foto y el tamaño exacto del vídeo:

| `--perfil` | Ventana (px CSS) | Vídeo |
|---|---|---|
| `movil` (por defecto) | 390 × 844 a escala 2 | 540 px de ancho, el de esta página |
| `vertical` | 540 × 960 a escala 2 | 1080 × 1920 |
| `horizontal` | 960 × 540 a escala 2 | 1920 × 1080 |
| `cuadrado` | 540 × 540 a escala 2 | 1080 × 1080 |
| `4k` | 1920 × 1080 a escala 2 | 3840 × 2160 |

`--fps` cambia los fotogramas por segundo (30 por defecto, 60 para pantallas rápidas), y `--ancho`, `--alto`, `--escala` y `--ancho-video` siguen cambiándolo todo a mano.

| `--calidad` | Qué saca | Para qué |
|---|---|---|
| `web` (por defecto) | H.264 CRF 26 y VP9 de respaldo; fotogramas en JPEG 92 | la página |
| `master` | solo H.264, CRF 16 con `aq-mode=3` contra las bandas de los degradados; fotogramas en PNG | guardar o volver a editar |

- **Color:** todo sale en BT.709 y rango de vídeo, con la matriz al pasar a YUV y las etiquetas puestas con `setparams` y `-x264-params`. Así Safari, iOS y Chrome pintan los mismos colores. Con este ffmpeg, poner `-colorspace` como opción de salida no basta: el MP4 de antes salía con `color_space=unknown`.
- **`+faststart`:** el índice va al principio y el vídeo arranca antes de bajarse entero.
- **Sin disco:** los fotogramas van a un solo ffmpeg por una tubería, que escribe el MP4 y el WebM a la vez. Solo se guardan los 12 de la hoja (en la intro, todos, porque el vídeo repite el tramo lento). La vuelta tarda 18 s en vez de 25.
- **Nombres:** los vídeos de esta página (`movil`, `web`, 30 fps) se siguen llamando `<escena>.mp4`. El resto lleva detrás el perfil, los fps si no son 30 y `-master`: `vuelta-vertical-master.mp4`, `bigbang-horizontal-60fps.mp4`.
- **`--salida`:** otra carpeta en vez de `clips/`, con su propio `clips.json`. Así una prueba no pisa los vídeos publicados.
- **`clips.json`** guarda además el perfil, la calidad, el CRF, el formato de los fotogramas y lo que dice `ffprobe` del MP4: tamaño, fps, fotogramas y etiquetas de color.

En `clips/` deja, por escena:

| Archivo | Qué es |
|---|---|
| `<escena>.mp4` | H.264, el que abre cualquier iPhone |
| `<escena>.webm` | VP9, de respaldo para navegadores sin H.264 |
| `<escena>-poster.jpg` | el momento con más luz de la hoja, para que la tarjeta no salga negra antes de reproducir |
| `<escena>-hoja.jpg` | 12 momentos repartidos por todo el tramo, en 4 × 3, cada uno con su t |

Y en `clips.json`, el t y el reloj de cada momento, el tramo, los fotogramas y lo que pesa cada archivo. Con esos t se enlaza cada momento al visor: `/lab/charlie-visor/?escena=vuelta&t=2.725&r=3.6`.

## Cómo avanza el tiempo

- **t** recorre el tramo entero de la escena, del primer fotograma al último, a ritmo constante.
- **El reloj** va a su velocidad real (1/30 s por fotograma), para que el latido no se acelere ni se frene al cambiar la duración.
- Cada fotograma pasa por `visor.fotograma(t, r)`, que mueve la escena ya cargada sin volver a importarla y espera a que el fotograma esté asentado, con el repintado que necesita WebKit.

## La intro, con el reloj real

La intro de `/motor/` (`motor/escenas/intro.js`) no va con t: va con el tiempo real desde su primer cuadro y dura 2,4 s. Por eso no sale en el visor y tiene su propio modo, `exportar.py intro`:

- Abre `/motor/` servido en local en WebKit, 390 × 844 a escala 2, en un contexto nuevo del navegador: `localStorage` vacío, página arriba y sin «reducir movimiento», que son las condiciones para que salga.
- Instala el reloj falso de Playwright (`page.clock.install` y `pause_at`), que cubre `performance.now()`, `Date` y `requestAnimationFrame`. Parado, la intro no corre sola mientras carga la curvatura.
- En cada fotograma fotografía y adelanta el reloj 1/30 s con `page.clock.run_for` (33, 33, 34 ms…). 90 fotogramas, 3 s.
- Al acabar comprueba que `motor-intro-vista` vale `1`: si no, la intro no ha terminado y para.

Saca `intro.mp4` (los 3 s a velocidad real y, detrás, los fotogramas 10 a 51, del punto que se enciende a la onda saliendo de pantalla, a 1/4; 8,6 s en total), `intro-poster.jpg` (el fotograma 22, con la onda bien visible) e `intro-hoja.jpg` (12 momentos de 0 a 2,4 s, rotulados en segundos). Solo MP4: H.264 lo abre todo. En `clips.json` queda como `intro`, con el segundo de cada momento en vez de t.

## En la página

Los vídeos llevan `preload="none"` y póster: en el móvil no se baja nada hasta que se toca reproducir. Van sin sonido, en bucle y con `playsinline`, para que el iPhone no los abra a pantalla completa.

## Límites

- **La intro, sin visor:** sus momentos van en segundos y no se abren en el visor, porque no tiene t. Si cambian sus tiempos en `intro.js`, hay que poner al día `INTRO_DURA`, `INTRO_LENTA` e `INTRO_POSTER` en `exportar.py`.
- **Solo la capa de la escena,** como en el visor: sin el texto de las secciones.
- **Las escenas están pensadas en vertical:** en `horizontal` y `4k` lo que pasa queda en el centro y los lados salen casi negros. Para un vídeo apaisado bueno, la escena tendría que componer para ese formato.
- **4K tarda:** cada foto es de 3840 × 2160, y 30 fotogramas tardan unos 20 s en un equipo de pruebas.
- **Para un PR visual,** se vuelve a lanzar `exportar.py` en su rama y la hoja nueva va en el PR. Por ahora solo recorre escenas del motor; una página sin t, como la portada, necesitaría otro modo que recorra el desplazamiento.

Basado en [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT), como el motor.
