# Logotipo de The Singularity (vista previa, 18/10)

La referencia son las capturas de Joseba del 18/10: el espacio-tiempo que se curva hacia un punto blanco que late,
el dorado del disco de luz y «THE SINGULARITY» debajo de «Todo empieza con un punto.». El texto «singularity·»
no es un logotipo y queda fuera.

## Piezas

- `iso-a.svg` Pozo, `iso-b.svg` Horizonte, `iso-c.svg` Cinco: el símbolo (isotipo), caja 64 × 64.
- `logo-h-*.svg`: horizontal, símbolo + palabra. `logo-v-*.svg`: apilado.
- `palabra.svg`: solo la palabra. `favicon-*.svg`: fondo negro y trazo más grueso, para 16-32 px.
- Todo sale de `gen.py` (aquí mismo; necesita uharfbuzz y fonttools): no editar los SVG a mano.

## Reglas

- Palabra: Archivo (OFL) expandida al 125 %. «SINGULARITY» peso 480, interletra 0,16 em; «THE» peso 400,
  interletra 0,62 em, alineada a la izquierda. Letras en trazos, con el kerning de la fuente (HarfBuzz).
- Colores: dorado `#f3cf96` (14,2:1 sobre negro) y punto blanco `#fff`. Nada más.
- El punto del símbolo (`.iso-punto`) late a 1,5 s, el ritmo de la malla, con una onda; se para con el
  botón de pausa y con «reducir movimiento». En la página es el `data-punto-final` del big bang.
- Tamaño mínimo: símbolo 16 px (favicon); palabra, 120 px de ancho.
- En la página: `?logo=a|b|c` cambia el símbolo del cierre. Sin parámetro, la A.

## Tipografía de la página

Una sola fuente variable (Archivo, 47 KB, latín y castellano; pesos 300-700, anchura 100-125 %).
Títulos: peso 330, anchura 112 %, interletra −0,032 em, interlínea 1,04. Texto: peso 380, interlínea 1,6.
Mayúsculas pequeñas (DESLIZA, botones): peso 500, anchura 125 %, interletra 0,26 em.
