# Lente gravitacional en WebGL2

Paso 2 de la ruta de Charlie en el laboratorio: la lente gravitacional de pdoom-video, portada a WebGL2 sin three.js, en https://josebadg.github.io/lab/charlie-lente/ (noindex). No toca `/motor/` ni la portada.

Basado en [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT): la idea y las cuentas de `app/src/scenes/spacetime-lens.ts`.

## Qué se ve

Un solo pase a pantalla completa. Cada píxel se lleva al plano de la fuente con la ecuación de la lente delgada de una masa puntual, `beta = theta · (1 − thetaE² / |theta|²)`, y allí se mira lo que hay detrás: una rejilla filtrada por caja, un campo de estrellas fijo y el punto dorado de The Singularity.

El deslizador de masa (t, de 0 a 1) cuenta la escena:

- **0 a 0,1:** el espacio plano, con el punto dorado desplazado.
- **0,1 a 0,6:** la masa crece y dobla la luz. El punto se alinea con ella y se abre en el anillo de Einstein.
- **0,4 a 0,75:** aparece la sombra con el anillo de fotones, más brillante por un lado (Doppler).
- **0,55 a 1:** la bruma cálida y el arrastre, que retuerce el espacio junto al agujero.

El reloj gira despacio el lado brillante del anillo (una vuelta cada 14 s), mueve la bruma y da un latido suave, el mismo de la curvatura.

## Archivos

- `lente.js`: la escena, con el mismo contrato que las de `/motor/` (`tramo`, `late`, `iniciar(ctx)` → `pintar`, `medir`, `bajar`, `retirar`), más `sincronizar()` y `ponerNivel()` para medir, y `parametros()`, lo que va al shader en cada fotograma, que comparte con la versión de WebGPU (`../charlie-lente-gpu/`). WebGL2 sin dependencias, unos 12 KB sin comprimir.
- `pagina.js`, `index.html` y `lente.css`: la página, con su bucle, el vigilante de fps y los controles.
- `hoja.py`: saca `hoja.jpg` (12 momentos) y `poster.jpg`.

## Enlace a un fotograma

`?t=0.85&r=3.2`: t de 0 a 1 y r en segundos del reloj. `mm=1` es «menos movimiento», `nivel=0|1|2` fija el nivel y `ui=0` quita los controles para las capturas. Para scripts: `lente.fotograma(t, r)` espera a que el fotograma esté asentado y `document.documentElement.dataset.listo === '1'`.

## Menos movimiento

Con `prefers-reduced-motion` o la casilla, el reloj no corre: no hay giro, ni latido, ni bruma que se mueva. El deslizador de masa sigue funcionando, porque solo se mueve si lo mueves tú.

## Nivel por dispositivo

| Nivel | Para | Resolución máxima | Estrellas | Subdivisiones |
|---|---|---|---|---|
| 2 | escritorio | 2 | sí | sí |
| 1 | móvil (menos de 600 px o puntero táctil) | 1,5 | sí | no |
| 0 | lo mínimo | 1 | no | no |

En automático arranca en 2 o en 1. Con el reloj en marcha, si dos ventanas seguidas de 1,5 s van por debajo de 30 fps, baja un nivel, como el vigilante del motor.

## Medir

El botón «Medir» (o `lente.medir(120)`) pinta 120 cuadros, espera a la GPU en cada uno (lee un píxel) y da la mediana y el p90 en milisegundos por cuadro, con el nivel y el tamaño del lienzo. Es la cifra que se comparará con la versión WebGPU del paso 3, en el mismo móvil.

## Hoja de contacto

```
python3 lab/charlie-lente/hoja.py                  # WebKit 390 × 844, nivel 1
python3 lab/charlie-lente/hoja.py --navegador chromium --ancho 1280 --alto 800 --nivel 2
```

Reutiliza `servir()` y `hoja()` de `lab/charlie-video/exportar.py`. Necesita Playwright y Pillow, y sirve la raíz del repo en local.
