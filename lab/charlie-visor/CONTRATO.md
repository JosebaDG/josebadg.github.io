# Contrato de escena (borrador)

Borrador de Miles para el paso 1 del laboratorio, para que Charlie lo revise. Reglas que cumple cada escena del motor para que el mismo `t` pinte siempre lo mismo, se pueda grabar fotograma a fotograma y se pueda comprobar sola en cada PR. No cambia nada del motor: pone por escrito lo que ya hacen las escenas, el visor y `exportar.py`.

## 1. La escena (lo que ya pide el motor)

Es el contrato de `motor/README.md`, sin cambios:

- `export const tramo = [desde, hasta]`, en T del motor.
- `export const late = true` si tiene movimiento propio y necesita el reloj.
- `export async function iniciar(ctx)` devuelve `{ pintar(t, reloj), retirar() }` y, si los tiene, `medir()`, `bajar()` y `ocupada()`.

## 2. Determinismo: un fotograma depende solo de esto

`pintar(t, reloj)` pinta lo mismo siempre que sean iguales:

- `t` (de 0 a 1 en su tramo) y `reloj` (segundos de movimiento propio);
- el tamaño del lienzo y `ctx.menosMovimiento`;
- el nivel de detalle que haya fijado `bajar()`.

Por eso, dentro de una escena:

- **Nada de `Math.random()` sin semilla.** Si hace falta azar, un generador con semilla fija, creado en `iniciar` (por ejemplo, mulberry32), y sus valores se sacan siempre en el mismo orden.
- **Nada de relojes reales en `pintar`:** ni `Date.now()`, ni `performance.now()`, ni el tiempo que da `requestAnimationFrame`. El tiempo lo pone el motor en `reloj`.
- **Nada que se acumule entre llamadas:** posiciones que avanzan «un poco cada cuadro» o suavizados que dependen del cuadro anterior. Si hay física, se calcula a partir de `t` y `reloj`. Si es cara, se puede guardar en caché, siempre que el resultado no dependa del orden en que llegan los fotogramas.
- **Lo que se mide del DOM** (como `data-punto-final` en la vuelta) cuenta como entrada: en el visor está quieto, así que no rompe la prueba.

Queda fuera la intro, porque va con tiempo real desde que se abre la página. Si algún día se graba, será con el reloj falso.

## 3. El visor (lo que usan la prueba y `exportar.py`)

En `lab/charlie-visor/`:

- `document.documentElement.dataset.listo` vale `'0'` mientras carga, `'1'` cuando el fotograma está pintado y asentado, y `'fallo'` si la escena no carga o se retira.
- `visor.tramo()` devuelve `{ desde, hasta, late }`.
- `await visor.fotograma(t, r)` mueve `t` y el reloj, y se resuelve cuando el fotograma está pintado y asentado. Asentado quiere decir que se repinta unos cuadros, porque WebKit no enseña un WebGL pintado en el mismo cuadro en que aparece el lienzo.
- Cada escena nueva entra en `ESCENAS` de `visor.js`.

## 4. La prueba barajada

`determinismo.py` abre la escena en el visor a 390 × 844, sin controles (`ui=0&mm=0`). Pinta 12 fotogramas repartidos por el tramo, primero en orden y luego barajados (semilla 7), en dos navegadores nuevos, y compara el hash SHA-256 de cada captura. El reloj avanza 1/30 s por fotograma si la escena late.

- Sale **0** si todo coincide.
- Sale **1** si algún fotograma cambia, y dice cuáles.
- Sale **2** si la escena no carga o si los 12 fotogramas son iguales, porque una pantalla vacía también «coincide».

Corre en GitHub Actions (`.github/workflows/escenas.yml`) en cada PR que toque `motor/escenas/`, `motor/relevos.js` o `lab/charlie-visor/`, para cada escena en Chromium y en WebKit. Una escena nueva se añade a la matriz del workflow.

## Preguntas abiertas para Charlie

1. ¿Metemos `medir()` en la prueba, con un segundo tamaño de pantalla (320) y comprobando que el fotograma sale igual antes y después de redimensionar?
2. ¿Y `menosMovimiento` (`mm=1`) como segunda pasada? Hoy solo se prueba el fotograma normal.
3. Para el paso 6 (regresión visual), ¿guardamos los hashes de esta prueba como referencia o mejor capturas con tolerancia, porque Chromium y WebKit cambian de versión?
