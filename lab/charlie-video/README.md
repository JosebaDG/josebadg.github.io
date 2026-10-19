# Vídeos y hojas de contacto del motor

Experimento de Charlie en el laboratorio de animación y vídeo: https://josebadg.github.io/lab/charlie-video/ (noindex).

Saca de cada escena del motor un vídeo corto y una hoja de contacto con 12 momentos. No graba la pantalla: abre el [visor](../charlie-visor/) sin controles, avanza t a mano y fotografía cada fotograma, como `render.ts` de [pdoom-video](https://github.com/mexicat/pdoom-video). Como una escena solo depende de t y del reloj, el vídeo sale igual en un equipo rápido que en uno lento, y no se pierden fotogramas.

## Volver a sacarlos

Desde la raíz del repo, con Playwright para Python (WebKit o Chromium), ffmpeg y Pillow:

```
python3 lab/charlie-video/exportar.py todas
python3 lab/charlie-video/exportar.py bigbang --segundos 6 --fps 30 --navegador webkit
```

Sirve el repo en local en un puerto libre, así que no sale nada a internet. Por defecto: WebKit (el motor de Safari y de Chrome en el iPhone), ventana de 390 × 844 fotografiada a escala 2 y vídeo de 540 px de ancho a 30 fotogramas por segundo. Curvatura y big bang duran 6 s y la vuelta, 5 s.

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

## En la página

Los vídeos llevan `preload="none"` y póster: en el móvil no se baja nada hasta que se toca reproducir. Van sin sonido, en bucle y con `playsinline`, para que el iPhone no los abra a pantalla completa.

## Límites

- **La intro no está:** va con tiempo real, no con t.
- **Solo la capa de la escena,** como en el visor: sin el texto de las secciones.
- **Para un PR visual,** se vuelve a lanzar `exportar.py` en su rama y la hoja nueva va en el PR. Por ahora solo recorre escenas del motor; una página sin t, como la portada, necesitaría otro modo que recorra el desplazamiento.

Basado en [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT), como el motor.
