# Un punto

Concepto elegido para la portada de josebadg.github.io. Sustituye a «La Lonja» del PR #2, que queda de reserva sin fusionar; la persiana puede volver como recurso si encaja (ver al final).

## Decisión de rumbo (17/10/2026)

- **Concepto principal: «Un punto».** «La Lonja» (PR #2) queda de reserva.
- **Identidad: ni solo el nombre ni solo una marca, sino una fusión de los dos** que juegue con el punto e impacte. Tres candidatas abajo; falta elegir una.
- **Vía libre al three.js actual** (WebGPU, partículas, el relieve de Nava de Ordunte), siempre como mejora progresiva: móvil primero, WCAG 2.2 AA, `prefers-reduced-motion` y lectura sin JavaScript.
- **No se fusiona ni se publica** sin el visto bueno final de diseño.

## Identidad: nombre y marca fusionados

La narrativa manda: una persona que se divide en cinco. La identidad tiene que poder contarse con el punto.

1. **«Joseba.»: el punto es la marca (recomendada).** El nombre termina en un punto, y ese punto es el que respira en la apertura. La historia se lee como «punto y seguido»: un punto que no cierra, abre. Apertura: negro y el punto. Final: el nombre aparece delante del punto, «Joseba.», y debajo «y seguido». Ventajas: se lee igual sin JS, con lector de pantalla y en una tarjeta de enlace; el logotipo es tipografía y un círculo, cero peso; el punto ya es el protagonista del 3D.
2. **«Jo5eba»: el cinco escondido en el nombre.** La «s» es un 5: una persona que lleva a cinco dentro. Apertura: el punto se divide en cinco y uno de ellos encaja en el hueco de la «s». Riesgo: puede sonar a alias de foro de los 2000, y el lector de pantalla diría «jo cinco eba» si no se marca con `aria-label`.
3. **«Joseba ×5»: el nombre multiplicado.** El «×» son dos hilos que se cruzan, y el contador sube de ×1 a ×5 al desplazar. Es la más explícita y la que mejor encaja con los datos (×45 PR, ×24 horas). Riesgo: se acerca a eslogan de producto.

En las tres, la dirección sigue siendo josebadg.github.io y el usuario JosebaDG se queda como firma del código. Simone afina el juego de palabras de la elegida; Maya, el logotipo.

## Dirección three.js

Capas, de la que siempre está a la que solo llega si el dispositivo puede:

1. **HTML y CSS:** todo el texto, legible sin JavaScript.
2. **Canvas 2D (este prototipo):** la apertura, sin librerías y por debajo de 20 KB.
3. **three.js con `WebGPURenderer`**, que cae solo a WebGL 2 si no hay WebGPU. Partículas calculadas en la GPU con TSL.

Cuándo se carga la capa 3:

- Con `import()` dinámico, después de que se vea el punto y en cuanto se empieza a desplazar o el navegador queda libre. Nunca bloquea la apertura.
- Solo si no hay `prefers-reduced-motion`, no está activado el ahorro de datos y el dispositivo tiene WebGPU o WebGL 2.
- three.js fijado a una versión y servido desde este repo, sin CDN: ninguna petición a terceros.

Escenas en 3D:

- **El punto:** el mismo punto blanco, ahora hecho de partículas.
- **Uno se hace cinco:** cinco nubes con los colores de los tokens `--c-*`.
- **Hilos:** uno por PR fusionado, con datos reales de `actividad.json`.
- **La materia son datos:** las partículas forman las 24 columnas del precio de hoy.
- **Nava de Ordunte:** las partículas se posan sobre el relieve real del valle, reutilizando los datos que ya publica Nava de Ordunte 3D.
- **Vuelta al punto:** todo se recoge en el punto final de la identidad elegida.

Presupuesto y reservas:

- Del orden de 20 000 partículas en móvil y 100 000 en escritorio, con la densidad de píxeles limitada a 2.
- Si el rendimiento cae por debajo de 30 fps de forma sostenida, se bajan las partículas y, si no basta, se vuelve al canvas 2D.
- La animación se para con la pestaña oculta o la escena fuera de la pantalla.

Accesibilidad del 3D:

- El canvas es decorativo (`aria-hidden`) y ningún dato vive solo en él.
- El desplazamiento es el nativo del navegador: no se secuestra el scroll.
- Nada parpadea más de 3 veces por segundo.
- Si algo se mueve solo durante más de 5 segundos, hay un botón visible para pausarlo (WCAG 2.2.2).

Esta carpeta tiene un prototipo funcional de la apertura: `prototipo/index.html`. No toca la portada actual.

## La idea en una frase

Pantalla negra. Un punto blanco que respira. Al desplazar, el punto se divide en cinco, los cinco tejen hilos y los hilos se convierten en datos reales. Al final todo vuelve a ser un punto.

## Por qué funciona

- **Primera impresión sin ruido.** Nada que leer, nada que cargar: negro y un punto. El cerebro pregunta «¿qué es esto?» y desplaza.
- **No es una metáfora vacía: todo es dato.** Los hilos son los pull requests fusionados de verdad (`actividad.json`). Las columnas son el precio de la luz de hoy (`2026.csv`). Cambia cada día sin que nadie toque nada.
- **Cuenta quiénes somos sin decirlo.** Uno se hace cinco: una persona y cuatro agentes. Es la historia del laboratorio.
- **Es de los cuatro.** Cada escena es el terreno de uno: el sistema visual, el 3D y las partículas, los textos, los datos y la coordinación.

## Guion por escenas

| # | Escena | Qué se ve | Dato real |
|---|--------|-----------|-----------|
| 0 | Un punto | Negro total. Un punto blanco que respira. A los 2,4 s aparece «Todo empieza con un punto.» | — |
| 1 | Uno se hace cinco | El punto se divide: uno en el centro, cuatro alrededor, cada uno con su color | — |
| 2 | Hilos | Arcos de cada agente al centro, uno por PR fusionado | `actividad.json` |
| 3 | La materia son datos | Las partículas forman 24 columnas: el precio de hoy, por tramos | `datos/2026.csv` (y REData en directo) |
| 4 | Lo que ya existe | Las partículas se apartan como cielo; entra el contenido: proyectos | estado de cada proyecto |
| 5 | ¿Cuál es tu punto? | Todo vuelve al punto inicial | — |

Versión final prevista (no está en el prototipo): escena 3 en WebGL/WebGPU con decenas de miles de partículas, y una escena extra donde las partículas se convierten en el relieve de Nava de Ordunte en 3D.

## Normas que no se negocian

- **Móvil primero.** Se diseña a 390 px y luego se amplía. Nada se sale por los lados a 320 px.
- **WCAG 2.2 AA.** Todo el texto está en el HTML, no en el canvas. El canvas es decorativo (`aria-hidden`). Enlace para saltar a los proyectos. Foco visible.
- **`prefers-reduced-motion`.** Sin respiración ni transiciones: cada escena aparece ya formada.
- **Sin JavaScript se lee todo.** El título no se oculta si no hay JS.
- **Rendimiento.** La apertura pesa menos de 20 KB y no carga librerías. three.js o WebGPU se cargan después, solo cuando hacen falta, y con versión de reserva en canvas 2D. El bucle solo se anima de forma continua mientras el punto respira.
- **Datos con reserva.** Si Red Eléctrica o los archivos no responden, la escena se forma con valores neutros y el texto no promete el dato.

## Referencias del estado del arte

Sites of the Year de Awwwards de los últimos años y lo que nos llevamos de cada uno:

- **Lando Norris**, de OFF+BRAND, Site of the Year 2025 — https://landonorris.com. Ritmo de scroll y transiciones de cine: cada desplazamiento es un plano nuevo.
- **Messenger**, de abeto, entre los Sites of the Year 2025 — https://messenger.abeto.co. Un mundo 3D pequeño que se explora sin instrucciones.
- **Igloo Inc**, de abeto, Site of the Year 2024 — https://www.igloo.inc. Materia 3D que se transforma al desplazar.
- **Lusion v3**, de Lusion, Site of the Year 2023 — https://lusion.co. WebGL al servicio de la marca, con un rendimiento muy cuidado.
- **Bruno Simon**, Site of the Year 2019 — https://bruno-simon.com. Un portafolio que es un juego: la web como experiencia, no como folleto.
- **In Pieces**, de Bryan James, Site of the Year 2015 — http://species-in-pieces.com. Una sola forma que se recompone escena a escena para contar datos. Es el antecedente directo de este concepto.
- Lista completa: https://www.awwwards.com/websites/sites_of_the_year/

Tecnología:

- three.js con WebGPU y TSL: https://threejs.org/examples/?q=webgpu
- Codrops, tutoriales de partículas y shaders: https://tympanus.net/codrops/
- View Transitions: https://developer.mozilla.org/docs/Web/API/View_Transition_API
- Animaciones ligadas al scroll: https://developer.mozilla.org/docs/Web/CSS/CSS_scroll-driven_animations

## La lonja, de reserva

«La Lonja» (PR #2) queda de reserva, sin fusionar. Como recurso: el punto de la escena 0 puede ser la luz que se cuela por la cerradura de una persiana bajada. Maya la ha dejado fuera de la apertura en su sistema visual; puede volver si encaja en otra escena sin restar impacto al punto.

## Contacto y miles-drive

- **Contacto:** solo con el bloque `data-contacto` y `/miles-drive/contacto.js`. Ni `mailto:` ni el correo en claro en ningún archivo.
- **miles-drive:** se presenta como «herramienta personal de gestión de archivos», sin nombres de proveedores ni lo que hace con los archivos. La carpeta `miles-drive/` no se toca desde esta rama.
