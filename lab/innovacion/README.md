# Innovación: la tecnología, por dentro

Apartado del laboratorio para desmontar tecnologías hasta que se entienden: el código de verdad funcionando, con un mando y una frase para cada pieza. En https://josebadg.github.io/lab/innovacion/ (noindex). No toca `/motor/` ni la portada.

## Reglas

- Lo que ves es lo que corre: nada de animaciones que finjan.
- Cada pieza, un mando y una frase. Si no se puede tocar o explicar en una frase, no está desmontada.
- Los límites, a la vista, en la misma página (por ejemplo: en el navegador, WebAssembly pasa por JavaScript).
- Un enlace, un estado exacto: sin `Math.random` ni `Date.now` en lo que se pinta.
- Primero el móvil: iPhone, móvil pequeño (320) y escritorio; «reducir movimiento»; sin JavaScript, póster y texto.

## Hoja de ruta (de MVP en MVP; el orden puede cambiar)

1. **Desmontar un shader** (`shader/`). Hecho.
2. **El viaje de un fotograma**, sobre la lente de Charlie: qué bytes van de JavaScript a la GPU, dónde se copian y cuánto tarda cada parte.
3. **three.js por capas**: objetos, formas, materiales (shaders) y píxeles, cada capa con su interruptor.
4. **WebAssembly sin magia**: la misma cuenta en JS, en Wasm (SIMD de 128 bits) y en la GPU, con tiempos y la memoria lineal a la vista.
5. **Programas con permisos mínimos**: un componente que pide archivo o red y un anfitrión que se lo da o se lo niega.
6. **Modo explicar**: letra grande, un paso por pantalla, avance con un toque; y un editor para cambiar el código en directo.

Norte (visión, sin fecha): un solo viaje con zoom, como *Potencias de diez*: imagen → shader → GPU → memoria → bytes → el programa que los pidió.

## `shader/`: Desmontar un shader

- `shader.js`: el shader en WGSL (WebGPU) y en GLSL (WebGL2), con las mismas cuentas, y los dos motores. Un mando `etapa` enseña cada pieza por dentro (1 coordenadas, 2 zoom, 3 giro, 4 pliegue, 5 profundidad, 6 color). Con etapa 6, 98 pasos, 19 pliegues y k = 7,1 sale el original.
- `app.js`: estado, mandos y pasos. El paso que cruza el centro de la pantalla elige la etapa. Solo pinta cuando algo cambia, o mientras el reloj se mueve (nunca con «reducir movimiento»).
- Enlace exacto: `?etapa=1..6&pasos=1..98&pliegues=0..19&k=2..12&t=0..62.8&motor=gpu|gl&nivel=0|1|2&ui=0`.
- `prueba.py`: compara WGSL y GLSL píxel a píxel en 17 casos y comprueba que el mismo enlace da la misma imagen. Con `--poster` rehace `poster.jpg`.
- Origen: shader de una línea para twigl (modo «geekest»). Por el estilo, casi seguro de Yohei Nishitsuji (#つぶやきGLSL); no encontramos la publicación exacta ni licencia, así que se cita con su nombre y solo para enseñar; si el autor lo pide, se quita. `hsv` y `rotate3D` son las de twigl (doxas, MIT).
- Comprobado: el color final coincide con una versión independiente en Python (numpy) del original (correlación 0,9999).
