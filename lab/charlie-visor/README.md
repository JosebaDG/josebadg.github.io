# Visor de escenas del motor

Experimento de Charlie en el laboratorio de animación y vídeo: https://josebadg.github.io/lab/charlie-visor/ (noindex).

Carga una escena de `/motor/` con el mismo contrato que usa el motor (`tramo`, `late` e `iniciar(ctx)`, que devuelve `pintar(t, reloj)`, `retirar()` y, si lo tiene, `medir()`) y la deja quieta en el fotograma que diga la URL. Importa las escenas tal cual desde `/motor/escenas/`: no copia ni cambia nada del motor ni de la portada.

## Enlaces a un fotograma

`/lab/charlie-visor/?escena=curvatura&t=0.2&r=1.4`

| Parámetro | Qué es |
|---|---|
| `escena` | `curvatura`, `bigbang` o `vuelta` |
| `t` | tiempo T del motor, el mismo que sale al desplazar `/motor/` (se ajusta al tramo de la escena) |
| `r` | segundos del reloj (el latido); por defecto 0 |
| `mm=1` | el fotograma de «reducir movimiento»; `mm=0` fuerza el normal |
| `ui=0` | sin controles, para capturas |

Como todo lo que pinta una escena depende solo de T y del reloj, el mismo enlace da el mismo fotograma en cualquier equipo. Al mover los deslizadores la URL se pone al día sola, y «Copiar enlace» la copia.

## Límites

- **La intro no está:** va con tiempo real desde que se abre la página, no con T ni con el reloj, así que no tiene fotogramas por t. Se mira en `/motor/`.
- **Solo la capa de la escena:** sin el texto de las secciones ni las otras escenas que en `/motor/` se pintan a la vez.
- **La vuelta:** el logotipo está quieto donde queda al final de la página; en `/motor/` sube con el desplazamiento hasta ahí.
- **El big bang** pesa unos 900 KB y necesita WebGL 2 o WebGPU; si no carga, el visor lo dice.

## Para capturas (Playwright)

Espera a `document.documentElement.dataset.listo === '1'` (o `'fallo'`). En la consola, `visor.ir('bigbang', 0.6, 0.8)` cambia de fotograma, `visor.estado()` dice dónde está y `visor.enlace()` da su URL.

Para recorrer una escena fotograma a fotograma sin volver a cargarla: `visor.tramo()` da `{ desde, hasta, late }` y `await visor.fotograma(t, r)` mueve t y el reloj y se resuelve cuando el fotograma está pintado y asentado. Lo usa [exportar.py](../charlie-video/README.md) para los vídeos y las hojas de contacto.

WebKit no enseña un WebGL pintado en el mismo cuadro en que aparece el lienzo, y la captura salía negra. Por eso el visor repinta el mismo fotograma unos pocos cuadros después de cargar, medir o mover un deslizador, y solo entonces marca `listo`.

Basado en [pdoom-video](https://github.com/mexicat/pdoom-video), de Giacomo Magnanini (MIT), como el motor.
