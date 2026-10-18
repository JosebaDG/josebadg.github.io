# Motor de escenas

Primera versión del motor de la web, en `josebadg.github.io/motor/`. El desplazamiento hace de reloj: cada escena es una función de ese tiempo y del reloj de movimiento propio, sin azar, así que el mismo punto de la página pinta siempre lo mismo. Esta página es un banco de pruebas con dos escenas y su relevo, la curvatura y el big bang. Todavía no es la portada, y la página no se indexa.

Método basado en [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT). Licencia MIT: ver `LICENSE`. Sin fuentes, audio, imágenes ni textos ajenos; el único código de fuera es three.js (MIT), dentro de `escenas/bigbang.min.js`.

## Archivos

- `motor.js`: el motor. Un solo bucle, un solo vigilante de fps y un solo control de «reducir movimiento», con su botón de pausa, para todas las escenas.
- `relevos.js`: los t de entrega entre escenas, en un solo sitio.
- `escenas/curvatura.js`: el espacio-tiempo curvado hacia el punto. Es `curvatura.js` de la vista previa con este contrato. WebGL sin dependencias, unos 6 KB comprimido.
- `escenas/bigbang.min.js`: el big bang en 3D (three.js, WebGPU con caída a WebGL 2), unos 247 KB comprimido. Se compila desde `escenas/fuente/bigbang.js`.
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
  // ctx: { lienzo, centro(), radio(), T(), menosMovimiento, movil, pedir(), fallo() }
  return {
    pintar(t, reloj) {}, // t de 0 a 1 dentro de su tramo; reloj en segundos de movimiento propio
    retirar() {},        // suelta el contexto y lo que tenga
    medir() {},          // opcional: el motor la llama al cambiar el tamaño
    bajar() {},          // opcional: baja un nivel de detalle; false si ya no puede
  };
}
```

`iniciar` devuelve `pintar` y `retirar` en vez de exportarlos sueltos porque los dos necesitan el lienzo y el contexto de esa escena.

En `index.html` se dan de abajo arriba, la última encima:

```js
crearMotor({ capas, boton, escenas: [
  { nombre: 'bigbang', modulo: './escenas/bigbang.min.js', pesada: true },
  { nombre: 'curvatura', modulo: './escenas/curvatura.js' },
] });
```

## Relevo

Las dos escenas miran el mismo `centro()` del motor y leen sus momentos de `relevos.js`:

- `PUNTO.aparece` (T 0,30): la malla cae y su luz empieza a apagarse. El punto 3D se enciende debajo de esa luz.
- `PUNTO.entrega` (T 0,42): la malla ya no se ve y el big bang explota desde ahí.
- `PUNTO.apagado` (T 0,58): la luz de la curvatura termina de apagarse. Su tramo acaba en 0,62.

El big bang llega a las cinco nubes en T 1 y se funde entre T 1 y 1,35. `bigbang.min.js` lleva dentro una copia de `relevos.js` al compilar, así que si se cambia un relevo hay que volver a compilarlo.

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
npm run build   # escribe ../bigbang.min.js
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

El script de las pruebas está fuera del repo. Falta mirarlo en un móvil de verdad.

## Pendiente

- La intro: un fogonazo de 2 a 3 s, que se pueda saltar y con su versión de menos movimiento.
- La vuelta del big bang al punto, que sigue en la vista previa.
- Pasar la portada a este motor cuando el banco de pruebas esté aprobado.
