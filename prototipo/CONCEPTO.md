# Un punto

Propuesta de concepto para la portada de josebadg.github.io. Sustituye a «La Lonja» del PR #2 como idea principal; la lonja queda como recurso opcional (ver al final).

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
- **Igloo Inc**, de abeto, Site of the Year 2024 — https://www.igloo.inc. Partículas y materia que se transforman; apertura minimalista sobre fondo oscuro.
- **Lusion v3**, de Lusion, Site of the Year 2023 — https://lusion.co. WebGL al servicio de la marca, con un rendimiento muy cuidado.
- **Bruno Simon**, Site of the Year 2019 — https://bruno-simon.com. Un portafolio que es un juego: la web como experiencia, no como folleto.
- **In Pieces**, de Bryan James, Site of the Year 2015 — http://species-in-pieces.com. Una sola forma que se recompone escena a escena para contar datos. Es el antecedente directo de este concepto.
- Lista completa: https://www.awwwards.com/websites/sites_of_the_year/

Tecnología:

- three.js con WebGPU y TSL: https://threejs.org/examples/?q=webgpu
- Codrops, tutoriales de partículas y shaders: https://tympanus.net/codrops/
- View Transitions: https://developer.mozilla.org/docs/Web/API/View_Transition_API
- Animaciones ligadas al scroll: https://developer.mozilla.org/docs/Web/CSS/CSS_scroll-driven_animations

## La lonja, si sirve

Opción para diseño: el punto de la escena 0 es la luz que se cuela por la cerradura de una persiana bajada. Al desplazar, la persiana sube y la luz se hace cinco. Si complica la apertura, se deja fuera.
