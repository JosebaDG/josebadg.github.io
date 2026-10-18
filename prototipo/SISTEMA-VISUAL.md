# Sistema visual de «Un punto»

Los tokens están en el `:root` de `punto.css`. `punto.js` lee de ahí los colores del lienzo (`--c-*`), así que cada color se cambia en un solo sitio. Capturas a 390 px, una por escena: `capturas/maya-390-0.png` a `maya-390-5.png`.

## Negro y punto

- **Negro puro (`#000`) y un solo blanco puro (`#fff`).** Ese blanco es solo del punto y de los enlaces. El texto va en `#ededed` y `#a6a6a6`, así que lo más brillante de la pantalla siempre es el punto.
- **Descartado:** un negro «cálido» o azulado (`#0a0a0f`). Con un negro que no es negro, el punto pierde contraste y la apertura parece una plantilla oscura más.

## Los cinco colores

| Quién | Token | Color | OKLCH |
|---|---|---|---|
| La persona | `--c-persona` | `#ffffff` | el punto |
| Miles | `--c-miles` | `#a2bcff` | 0,80 0,10 268 |
| Charlie | `--c-charlie` | `#47d6cf` | 0,80 0,12 190 |
| Maya | `--c-maya` | `#f89dc9` | 0,80 0,12 350 |
| Simone | `--c-simone` | `#e6b55d` | 0,80 0,12 80 |

- **Por qué:** OKLCH mide el color como lo ve el ojo. Con la misma luminosidad (0,80), ningún agente brilla más que otro, y solo cambia el tono, repartido por la rueda. Todos pasan de 10:1 sobre negro, así que valen también para texto.
- **Descartado:** el rojo y el verde provisionales. El rojo se lee como «error» o «caro», y rojo y verde juntos son la pareja que peor distinguen las personas con daltonismo.

## Los datos son luz

Las 24 columnas del precio van en grises: `--c-dato-bajo` `#4d4d4d`, `--c-dato-medio` `#a6a6a6` y `--c-dato-alto` `#fff`. Cuanto más cara la hora, más blanca.

- **Por qué:** antes las columnas usaban los colores de Charlie, Simone y Maya para barato, medio y caro, y parecía que Maya era «la hora cara». Los colores de agente dicen «quién» y nada más. Y el precio de la luz pintado como luz encaja con el punto.
- **Descartado:** el verde, ámbar y rojo de Pvpc-bridge. Esa web explica precios; esta escena solo tiene que impresionar, y el detalle está a un clic.

## Tipografía

- **Letra del sistema** (`system-ui`): cero bytes de fuente en la apertura, que tiene que pesar menos de 20 KB.
- **Titulares grandes:** `--t-display`, de 44 px a 320 hasta 80 px en escritorio (47 px a 390), peso 600, interletra −0,045 em e interlineado 1. `text-wrap: balance` reparte las líneas.
- **Descartado:** una fuente propia de titulares. Costaría entre 20 y 40 KB, el doble de toda la apertura. Si algún día entra, que sea con la escena 3D, ya cargada después.

## Ritmo entre escenas

- Cada escena ocupa una pantalla. El texto va abajo, siempre por debajo del dibujo (a 390, el texto empieza en 637 px o más y las columnas acaban en 523).
- Cada texto entra con el desplazamiento, como un plano nuevo, con CSS (`animation-timeline: view()`) y sin JavaScript. Donde el navegador no lo admite, o con `prefers-reduced-motion`, el texto ya está.
- Una sombra negra difusa detrás del texto lo deja leer sobre las partículas sin añadir cajas ni alto.
- Rejilla de 4 px (`--e-1` a `--e-6`) y una sola curva de movimiento (`--curva`).

## Logotipo «singularity·»

- **Texto, no imagen.** En el HTML es `singularity` con el punto en un `span` con `aria-hidden`, así que el lector dice «Singularity» y no pesa nada. Va en minúsculas, con la letra del sistema, peso 600 e interletra −0,045 em, como los titulares.
- **El punto final es el punto.** El `·` se pinta como un círculo de `--c-persona` (`#fff`), el único blanco puro, el mismo que respira en la apertura. La palabra va en `--tinta`, un poco más apagada, para que lo que más brille sea el punto. Lleva `data-punto-final`: la escena 3D termina justo ahí.
- **Tamaño:** `--t-marca`, de 40 px a 320 hasta 72 px en escritorio, en su propia línea y sin partir (`nowrap`). A 320 px ocupa menos que el ancho útil.
- **Alto contraste:** con colores forzados, el punto toma el color del texto y no desaparece.
- **Descartado:** dejar el `·` como carácter. Cada letra lo dibuja a un tamaño y altura distintos, y no sería «el» punto. Tampoco un SVG: añade peso y otra forma de la marca que mantener.

## La persiana: fuera

La apertura tiene que ser negro y un punto, nada más. Una persiana añade una segunda forma antes del punto, cuenta una metáfora literal en vez de dejar que el punto la sugiera y cuesta peso y animación. La idea de la lonja se queda en lo que ya hace el punto: una luz que se cuela en lo oscuro.
