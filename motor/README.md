# Motor de escenas

Primera versión del motor de la web, en `josebadg.github.io/motor/`. El desplazamiento hace de reloj: cada escena es una función de ese tiempo y del reloj de movimiento propio, sin azar, así que el mismo punto de la página pinta siempre lo mismo. Esta página es un banco de pruebas con tres escenas y sus relevos: la intro, la curvatura y el big bang. Todavía no es la portada, y la página no se indexa.

Método basado en [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT). Licencia MIT: ver `LICENSE`. Sin fuentes, audio, imágenes ni textos ajenos; el único código de fuera es three.js (MIT), dentro de `escenas/bigbang.min.js`.

## Archivos

- `motor.js`: el motor. Un solo bucle, un solo vigilante de fps y un solo control de «reducir movimiento», con su botón de pausa, para todas las escenas.
- `relevos.js`: los t de entrega entre escenas, en un solo sitio.
- `escenas/intro.js`: la intro, un fogonazo de 2,4 s al abrir. Lienzo 2D sin dependencias.
- `escenas/curvatura.js`: el espacio-tiempo curvado hacia el punto. Es `curvatura.js` de la vista previa con este contrato. WebGL sin dependencias, unos 6 KB comprimido.
- `escenas/bigbang.min.js`: el big bang en 3D (three.js, WebGPU con caída a WebGL 2), unos 247 KB comprimido. Se compila desde `escenas/fuente/bigbang.js` con `escenas/fuente/build.mjs`.
- `carteles/curvatura.jpg`: el cartel fijo de la curvatura. El de las cinco nubes es CSS.
- `index.html` y `motor.css`: el banco de pruebas.

## El tiempo del motor

`T = i + avance`. `i` es la sección `[data-escena]` cuyo centro ya ha pasado por el centro de la pantalla, y `avance` (de 0 a 1) es lo que falta hasta el centro de la siguiente. Se anclan secciones del DOM, nunca píxeles: si el texto cambia de largo, la animación se recoloca sola. El final de la página cuenta como el centro de la última sección.

## Contrato de escena

Cada escena es un módulo que exporta:

```js
export const tramo = [desde, hasta]; // en T del motor; fuera de él, su lienzo se oculta y no se pinta
export const late = true;            // opcional: tiene movimiento propio y pide que corra el reloj
export async function iniciar(ctx) {
  // ctx: { lienzo, centro(), radio(), T(), menosMovimiento, pausado, movil, pedir(), fallo() }
  return {
    pintar(t, reloj) {}, // t de 0 a 1 dentro de su tramo; reloj en segundos de movimiento propio
    retirar() {},        // suelta el contexto y lo que tenga
    medir() {},          // opcional: el motor la llama al cambiar el tamaño
    bajar() {},          // opcional: baja un nivel de detalle; false si ya no puede
    ocupada() {},        // opcional: true mientras no se la debe interrumpir; el motor espera para pedir las pesadas
  };
}
```

`iniciar` devuelve `pintar` y `retirar` en vez de exportarlos sueltos porque los dos necesitan el lienzo y el contexto de esa escena.

En `index.html` se dan de abajo arriba, la última encima:

```js
crearMotor({ capas, boton, escenas: [
  { nombre: 'bigbang', modulo: './escenas/bigbang.min.js', pesada: true },
  { nombre: 'curvatura', modulo: './escenas/curvatura.js' },
  { nombre: 'intro', modulo: './escenas/intro.js' },
] });
```

## Relevo

Las escenas miran el mismo `centro()` del motor y leen sus momentos de `relevos.js`:

- `PUNTO.aparece` (T 0,30): la malla cae y su luz empieza a apagarse. El punto 3D se enciende debajo de esa luz.
- `PUNTO.entrega` (T 0,42): la malla ya no se ve y el big bang explota desde ahí.
- `PUNTO.apagado` (T 0,58): la luz de la curvatura termina de apagarse. Su tramo acaba en 0,62.

El big bang llega a las cinco nubes en T 1 y se funde entre T 1 y 1,35. `bigbang.min.js` no lleva una copia de `relevos.js`: lo importa como archivo aparte (`../relevos.js`) y el navegador lo lee al cargar, el mismo que lee la curvatura. Mover un relevo no obliga a recompilar. `build.mjs` falla si la salida no importa `../relevos.js` o si lleva sus valores dentro.

## Intro

Un fogonazo de 2,4 s al abrir la página, encima de todo. Negro y el punto quieto; el punto se enciende (0,35 s), estalla en un destello cálido con una onda de cinco arcos, uno por color `--c-*` (pico en 0,55 s), y al apagarse la luz el negro se abre desde el centro y deja ver la curvatura, con el mismo punto en el mismo `centro()`. Al final solo queda el punto de la curvatura.

- **Va con el tiempo real, no con el desplazamiento:** dura lo mismo en un equipo lento. Un hueco de más de 0,25 s entre cuadros no cuenta.
- **Se salta con cualquier gesto:** tocar, una tecla, la rueda o desplazar. Se funde en 0,3 s. Con la pausa del motor se quita al momento. No lleva botón de «Saltar»: para 2,4 s se leería tarde y cualquier gesto ya vale.
- **Una vez por sesión:** al volver a la página en la misma pestaña no se repite (`sessionStorage`). Tampoco sale si la página abre ya desplazada.
- **Menos movimiento:** no hay fogonazo; la página abre en el fotograma fijo de la curvatura.
- **Un solo destello, de subida suave:** lejos del límite de tres por segundo de WCAG 2.3.1.
- **No la interrumpe la escena pesada:** mientras dura, el motor no pide el big bang (`ocupada()`); se pide al acabar o con el primer desplazamiento, que ya la salta.
- El texto de la sección está siempre en el DOM, por encima del lienzo.

## Lo que hace el motor por todas

- **Un solo bucle:** pinta al desplazar. Solo sigue pidiendo cuadros mientras corre el reloj.
- **Reloj:** avanza solo si hay una escena activa con `late`, no hay pausa, no se ha pedido menos movimiento y la pestaña está a la vista. Nunca salta más de 50 ms de golpe.
- **Vigilante de fps:** cuenta en ventanas de 1,5 s mientras corre el reloj. Dos ventanas seguidas por debajo de 30 fps bajan un nivel la escena activa más cara, primero la pesada. Un parón suelto de más de 250 ms (otra pestaña, una captura) no cuenta; tres seguidos bajan un nivel sin esperar. Si una escena pesada ya no puede bajar, se retira y su sección enseña el cartel. Si solo quedan ligeras, se para el movimiento propio, como al pulsar la pausa.
- **Reducir movimiento:** el reloj no avanza, cada escena enseña su fotograma fijo y al desplazar solo se funde. La escena pesada no se carga, y si se activa con la página abierta, se retira. Sin botón de pausa, porque no hay nada que pausar.
- **Pausa:** un botón de 44 × 44 px para el movimiento propio de todas las escenas a la vez (WCAG 2.2.2).
- **Carga:** las ligeras al abrir. Las pesadas con el primer desplazamiento o cuando el navegador queda libre, y nunca con menos movimiento, con ahorro de datos ni sin WebGPU ni WebGL 2.
- **Si una escena falla:** si no carga, pierde el contexto o lanza un error al pintar, se quita su lienzo y el `<html>` recibe `sin-<nombre>`, que enseña su cartel. El texto está siempre en el DOM.

## Compilar el big bang

```sh
cd motor/escenas/fuente
npm ci
npm run build   # escribe ../bigbang.min.js y comprueba que lee ../relevos.js
```

## Pruebas

Se prueba por fotogramas: se lleva la página a un T concreto con la pausa puesta, para que el reloj no se mueva, y se mide la captura.

Medidas del 18 de octubre de 2026, en navegadores sin pantalla y sin GPU: Chromium con SwiftShader y WebKit de Playwright, ninguno con WebGPU. Las dos escenas y el relevo salen en Chromium a 320 × 640, 390 × 844 y 1280 × 800, y en WebKit a 390 × 844. En ningún caso hay desbordamiento horizontal.

| Caso | Curvatura | Big bang | Vigilante de fps |
| --- | --- | --- | --- |
| Chromium 320 × 640 | 60 fps | 22 fps | bajó 2 niveles |
| Chromium 390 × 844 | 60 fps | 13 fps | bajó 2 niveles |
| Chromium 1280 × 800 | 60 fps | 6 fps | bajó 1 nivel |
| WebKit 390 × 844 | 62 fps | 55 fps | no bajó nada |
| Chromium 390, menos movimiento | fija | no se carga | no hace falta |

Los fps del big bang en Chromium son de dibujar por software, sin GPU: no dicen nada de un móvil o un ordenador de verdad. Sí demuestran que el vigilante baja de nivel cuando hace falta.

Además:

- Con la pausa puesta, el reloj no avanzó nada en 0,8 s. Sin ella, avanzó 3 s en 3 s.
- En una vuelta anterior de las pruebas, en Chromium a 1280 sin GPU, el big bang llegó a su mínimo y se retiró: la sección enseñó el cartel CSS de las cinco nubes y no se colgó nada.

Intro, medidas del 19 de octubre de 2026 con los mismos navegadores. Sin desbordamiento horizontal en ningún caso y sin errores en la consola (solo el aviso de three.js de que no hay WebGPU).

| Caso | Dura | Al tocar | Al desplazar | Brillo medio en el pico | Segunda visita |
| --- | --- | --- | --- | --- | --- |
| Chromium 320 × 640 | 2,97 s | 0,33 s | 0,29 s | 104 de 255 | no sale |
| Chromium 390 × 844 | 3,30 s | 0,31 s | 0,30 s | 42 de 255 | no sale |
| Chromium 1280 × 800 | 3,30 s | 0,30 s | 0,30 s | 65 de 255 | no sale |
| WebKit 390 × 844 | 2,30 s | 0,29 s | 0,30 s | 94 de 255 | no sale |
| Chromium 390, menos movimiento | no sale | — | — | — | no sale |

En Chromium dura más de 2,4 s por un parón de 1,3 s al pintar la curvatura por primera vez, dibujando por software; ese parón cuenta solo 0,25 s. En WebKit dura lo previsto. El brillo del pico es aproximado: la captura no siempre cae justo en el pico. Después de la intro, la curvatura y el big bang cargan y pintan igual que antes.

El script de las pruebas está fuera del repo. Falta mirarlo en un móvil de verdad.

## Pendiente

- La vuelta del big bang al punto, que sigue en la vista previa.
- Pasar la portada a este motor cuando el banco de pruebas esté aprobado.
