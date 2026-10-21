# Laboratorio de animación y vídeo

El departamento del equipo (Miles, Charlie, Maya y Simone) para animación, 3D y vídeo en el navegador, en https://josebadg.github.io/lab/ (noindex). Jefe: Charlie, porque el motor es suyo (aceptado el 19/10/2026).

## Secciones, en este orden

1. **Te espera** (`#espera`): solo lo que espera el sí de Joseba, siempre arriba y separado del resto. Es el antiguo escaparate de `/preview/`. Cada tarjeta lleva una línea en castellano llano, captura (antes y después si cambia algo que ya existe), «Ver el después» a una vista previa publicada y el enlace al PR o hilo. Nunca el diff de GitHub como enlace para ver.
2. **Publicado** (`#publicado`): lo que ya está en la web (la portada, `/motor/` y lo que vaya saliendo).
3. **Experimentos** (`#experimentos`): pruebas sueltas de cada miembro. Cada uno añade las suyas en su bloque.
4. **Biblioteca** (`#biblioteca`): recursos ordenados por la necesidad que resuelven («Presentar logros y concepto», «Animar con el scroll», «Efectos de luz y gravedad», etc.), con un buscador «¿Qué necesitas?» y, debajo, la ficha larga de cada recurso. Cada recurso nuevo se ficha bajo la necesidad o necesidades que resuelve; si no encaja en ninguna, se abre una necesidad nueva. Ante una necesidad nueva, primero se busca aquí y después fuera. Que algo esté aquí no obliga a usarlo.

## Dónde va cada cosa

- `lab/index.html`: esta página. `lab/capturas/`: capturas de las tarjetas (PNG o JPG ligeros, Playwright con WebKit a 390 × 844).
- `lab/aprendizaje-federado/`: la investigación «Aprender juntos sin entregar lo que pensamos» (paper de Google sobre aprendizaje federado privado y cómo se gobierna una comunidad), enlazada desde la ficha `#f-federado` de la Biblioteca, bajo la necesidad «Comunidad y conocimiento compartido» (`#n-comunidad`). Página completa publicada el 20/10/2026, noindex.
- `lab/explosion/`: la explosión del punto (experimento de Miles; antes estaba en `/lab/`). Los enlaces compartidos antiguos (`/lab/#s=…`) se reenvían allí.
- `lab/charlie-muelle/`: el muelle en T (experimento de Charlie, 20/10/2026). Una copia del motor que suaviza el tiempo con un muelle opcional, con interruptor para comparar, su prueba de Playwright y un vídeo lado a lado. `/motor/` no cambia; ver su README.
- `lab/innovacion/`: el apartado de Innovación (Miles, 21/10/2026): tecnologías desmontadas hasta que se entienden, con su visión y hoja de ruta por MVP. Es una página propia, enlazada desde la navegación y desde Experimentos; no cambia el orden de secciones de `/lab/`. Primer MVP: `lab/innovacion/shader/`, un shader de una línea desmontado en seis pasos (WebGPU con alternativa WebGL2). Ver su README.
- Las vistas previas siguen en `/preview/`: `singularity/`, `lonja/` y las copias de PR sin fusionar en `/preview/prN/`. `/preview/` a secas reenvía a `/lab/#espera`.

## Cómo se mantiene

Las rondas del canal del equipo ponen al día «Te espera»: añaden lo nuevo y quitan lo fusionado o descartado (con su `/preview/prN/` y sus capturas). Antes de publicar: WebKit 390 × 844 y escritorio 1280, sin desbordes ni errores, y axe sin fallos WCAG 2.2 AA. La regla vive en el registro de decisiones del equipo. La Biblioteca la mantienen las mismas rondas: cada recurso nuevo, su ficha bajo su necesidad.
