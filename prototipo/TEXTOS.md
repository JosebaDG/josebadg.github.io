# Textos de «Un punto»

Una frase por escena, de 12 palabras como mucho. Todo está en `index.html`; las dos frases con datos las rellena `punto.js` cuando los datos llegan.

| # | Escena | Frase (palabras) | Debajo |
|---|--------|------------------|--------|
| 0 | Un punto | Todo empieza con un punto. (5) | — |
| 1 | Big bang | Uno se hace cinco. (4) | Una persona y cuatro agentes de IA: Miles, Charlie, Maya y Simone. (12) |
| 2 | Hilos | Cada hilo es un cambio real. (6) | Con datos: «45 cambios de Pvpc-bridge fusionados en 5 días.» (8) y «Lo que hace uno, lo revisa otro.» (7). Sin datos, solo la segunda. |
| 3 | La materia son datos | La materia son datos. (4) | Con datos: «Estas 24 columnas son el precio de la luz de hoy.» (11), la hora actual y la más barata. Sin datos: «Cada día, el precio de la luz se vuelve 24 columnas.» (11) |
| 4 | Lo que ya existe | Lo que ya existe. (4) | Los cinco proyectos. |
| 5 | Vuelta al punto | ¿Cuál es tu punto? (4) | «Todo esto empezó con uno.» y el enlace al código. Cierre: «Conocimiento que genera conocimiento: singularity·» (5) |

## Por qué

- **Se quedan las frases que ya funcionaban.** «Todo empieza con un punto», «Uno se hace cinco» y «¿Cuál es tu punto?» son cortas, dicen lo que se ve y no suenan a agencia.
- **El cierre explica el nombre.** «Conocimiento que genera conocimiento» es de donde sale Singularity. Sin esa frase, «singularity» suena a la promesa de la IA que lo sabe todo, que es justo lo que no somos y lo que nos acerca a las otras marcas con ese nombre.
- **Nada promete lo que no está.** Sin datos, el texto de las escenas 2 y 3 no da cifras ni dice «hoy». Los 45 cambios son de Pvpc-bridge, y lo dice. «Lo que hace uno, lo revisa otro» es la regla escrita en `docs/simbiosis/02-roles-y-reglas.md` de Pvpc-bridge.
- **Proyectos:** Nava de Ordunte 3D es un prototipo (su README dice MVP), así que lo dice; y el GPX se abre sin subirlo a ningún sitio, como cuenta su README. miles-drive se queda tal cual, con la frase acordada.

## Qué se descartó

- «Nadie revisa su propio trabajo»: con todo publicado desde una sola cuenta, no se puede comprobar desde fuera.
- «pull requests» en la escena 2: «cambios» lo entiende cualquiera.
- Un cierre de eslogan («El futuro empieza aquí» y parecidos): promete y no dice nada.

## Para Maya y Charlie

El logotipo del cierre va como texto: `<span class="marca" lang="en">singularity<span aria-hidden="true">·</span></span>`. El lector dice «singularity» y no lee el punto. El estilo y el `data-punto-final` del punto son de Maya.

Pendiente: la frase de la escena extra de Nava de Ordunte, cuando exista.
