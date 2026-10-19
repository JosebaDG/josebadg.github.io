// Motor de escenas del laboratorio: el scroll hace de reloj (Charlie).
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT
//
// Un solo bucle, un solo vigilante de fps y un solo control de menos movimiento para todas las
// escenas. Cada escena es un módulo que exporta su tramo y una función iniciar(ctx) que devuelve
// { pintar(t, reloj), retirar(), medir?(), bajar?() }. Ver README.md, «Contrato de escena».
//
// El tiempo del motor, T, sale del desplazamiento: T = i + avance, donde i es la sección
// [data-escena] cuyo centro ya ha pasado por el centro de la pantalla y avance (0..1) es lo que
// falta hasta el centro de la siguiente. Se anclan secciones del DOM, nunca píxeles: si cambia el
// texto, la animación se recoloca sola. Todo lo que se ve depende de T y del reloj; sin azar.

const FPS_MIN = 30;
const VENTANA_MS = 1500;    // ventana del vigilante de fps
const LENTAS_SEGUIDAS = 2;  // ventanas lentas seguidas antes de bajar de nivel
const PASO_MAX = 0.05;      // el reloj nunca salta más de 50 ms (pestaña recuperada, pausa del sistema)

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));

export function puedeGPU() {
  if ('gpu' in navigator) return true;
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

// escenas: [{ nombre, modulo, pesada, tardia }], de abajo arriba (la última se pinta encima).
// tardia: ligera, pero no hace falta al abrir (la vuelta, al final de la página): se pide con las
// pesadas, después de la apertura, y sale también con menos movimiento, ahorro de datos o sin GPU.
// pesada: se pide después de la apertura (primer desplazamiento o navegador libre) y nunca con
// menos movimiento, con ahorro de datos o sin WebGPU ni WebGL 2.
export function crearMotor({ escenas, capas, boton = null, secciones = '[data-escena]' }) {
  const html = document.documentElement;
  const consulta = matchMedia('(prefers-reduced-motion: reduce)');
  let menosMovimiento = consulta.matches;
  const movil = () => innerWidth < 600 || matchMedia('(pointer: coarse)').matches;

  // ---------- Reloj de scroll ----------
  let ancho = innerWidth, alto = innerHeight;
  let centros = [];
  function medirSecciones() {
    const els = [...document.querySelectorAll(secciones)];
    centros = els.map((e) => e.offsetTop + e.offsetHeight * 0.5);
  }
  function T() {
    if (centros.length < 2) return 0;
    const y = scrollY + alto * 0.5;
    // El final de la página cuenta como el centro de la última sección, aunque no llegue a centrarse
    const yMax = html.scrollHeight - alto * 0.5;
    for (let i = 0; i < centros.length - 1; i++) {
      const a = centros[i];
      const b = Math.min(centros[i + 1], Math.max(a + 1, yMax));
      if (y < b) return i + limitar((y - a) / (b - a), 0, 1);
    }
    return centros.length - 1;
  }

  // Relevo: todas las escenas miran el mismo centro, así el punto que entrega una es el que recoge la otra
  const centro = () => ({ x: ancho / 2, y: alto * 0.42 });
  const radio = () => Math.min(ancho, alto) * 0.26;

  // ---------- Escenas ----------
  // Un lienzo por escena, creado ya en su orden para que la que carga tarde no cambie quién va encima
  const vivas = escenas.map((def) => {
    const lienzo = document.createElement('canvas');
    lienzo.className = `motor-lienzo motor-${def.nombre}`;
    lienzo.setAttribute('aria-hidden', 'true');
    lienzo.style.visibility = 'hidden';
    capas.append(lienzo);
    return { def, lienzo, inst: null, tramo: null, activa: false, late: false, estado: 'esperando' };
  });

  function caer(v, motivo) {
    if (v.estado === 'retirada' || v.estado === 'fallo') return;
    const habia = v.inst;
    v.estado = motivo === 'lenta' ? 'retirada' : 'fallo';
    v.activa = false;
    v.inst = null;
    try { if (habia) habia.retirar(); } catch { /* ya no está */ }
    v.lienzo.remove();
    // La sección enseña su cartel estático (CSS: html.sin-<nombre>)
    html.classList.add(`sin-${v.def.nombre}`);
    html.classList.remove(`con-${v.def.nombre}`);
    pedir();
  }

  function ctxDe(v) {
    return {
      lienzo: v.lienzo,
      centro, radio, T,
      get menosMovimiento() { return menosMovimiento; },
      get pausado() { return pausado; },
      get movil() { return movil(); },
      pedir,
      fallo: () => caer(v, 'fallo'),
    };
  }

  async function cargar(v) {
    if (v.estado !== 'esperando') return;
    v.estado = 'cargando';
    try {
      const m = await import(v.def.modulo);
      v.tramo = m.tramo;
      v.late = !!m.late;
      v.inst = await m.iniciar(ctxDe(v));
      if (v.estado !== 'cargando') { v.inst.retirar(); return; }
      v.estado = 'viva';
      html.classList.add(`con-${v.def.nombre}`);
      pedir();
    } catch (e) {
      v.estado = 'cargando';
      caer(v, 'fallo');
      if (window.console) console.info(`motor: ${v.def.nombre} no ha cargado (${e && e.message})`);
    }
  }

  // ---------- Un solo bucle ----------
  let reloj = 0, previo = 0, pendiente = false, pausado = false;
  const corre = () => !menosMovimiento && !pausado && !document.hidden && vivas.some((v) => v.activa && v.late);

  function pedir() { if (!pendiente) { pendiente = true; requestAnimationFrame(cuadro); } }

  function cuadro(ahora) {
    pendiente = false;
    const t = T();
    for (const v of vivas) {
      if (v.estado !== 'viva') continue;
      const [desde, hasta] = v.tramo;
      const activa = t >= desde && t <= hasta;
      if (activa !== v.activa) { v.activa = activa; v.lienzo.style.visibility = activa ? 'visible' : 'hidden'; }
    }
    const enMarcha = corre();
    if (enMarcha) {
      if (previo) reloj += Math.min(PASO_MAX, (ahora - previo) / 1000);
      previo = ahora;
    } else { previo = 0; ventana.t0 = 0; }
    for (const v of vivas) {
      if (!v.activa) continue;
      const [desde, hasta] = v.tramo;
      try { v.inst.pintar(limitar((t - desde) / (hasta - desde), 0, 1), reloj); }
      catch { caer(v, 'fallo'); }
    }
    if (enMarcha) { vigilar(ahora); pedir(); }
  }

  // ---------- Un solo vigilante de fps ----------
  // Solo cuenta mientras el reloj corre. Dos ventanas lentas seguidas: baja un nivel la escena
  // activa más cara. Si ya no puede bajar, una escena pesada se retira y deja su cartel; si solo
  // quedan ligeras, se para el movimiento propio (como pulsar la pausa).
  // Un parón suelto (más de 250 ms entre dos cuadros: otra pestaña, una captura, el sistema) no es
  // ir lento: esa ventana no cuenta y se empieza otra. Tres parones seguidos sí: el equipo no llega
  // ni a 4 fps y se baja de nivel sin esperar más.
  const ventana = { t0: 0, cuadros: 0, ultimo: 0 };
  let lentas = 0, bajadas = 0, parones = 0;
  function vigilar(ahora) {
    if (ventana.t0 && ahora - ventana.ultimo > 250) {
      parones++;
      ventana.t0 = 0;
      if (parones >= 3) { parones = 0; lentas = 0; bajarNivel(); return; }
    }
    if (!ventana.t0) { ventana.t0 = ahora; ventana.ultimo = ahora; ventana.cuadros = 0; return; }
    if (ventana.cuadros > 2) parones = 0;
    ventana.ultimo = ahora;
    ventana.cuadros++;
    if (ahora - ventana.t0 < VENTANA_MS) return;
    const fps = (ventana.cuadros * 1000) / (ahora - ventana.t0);
    ventana.t0 = ahora; ventana.cuadros = 0;
    lentas = fps < FPS_MIN ? lentas + 1 : 0;
    if (lentas < LENTAS_SEGUIDAS) return;
    lentas = 0;
    bajarNivel();
  }
  function bajarNivel() {
    const activas = vivas.filter((v) => v.activa).sort((a, b) => (b.def.pesada ? 1 : 0) - (a.def.pesada ? 1 : 0));
    for (const v of activas) {
      if (v.inst.bajar && v.inst.bajar()) { bajadas++; return; }
      if (v.def.pesada) { caer(v, 'lenta'); return; }
    }
    pausado = true;
    ponerBoton();
  }

  // ---------- Un solo control de menos movimiento (y su pausa) ----------
  // Con «reducir movimiento» el reloj no avanza: cada escena enseña su fotograma fijo y al
  // desplazar solo se funde. El botón pausa el movimiento propio de todas a la vez (WCAG 2.2.2).
  function ponerBoton() {
    if (!boton) return;
    boton.hidden = menosMovimiento;
    boton.setAttribute('aria-pressed', String(pausado));
    boton.setAttribute('aria-label', pausado ? 'Reanudar el movimiento' : 'Pausar el movimiento');
  }
  if (boton) boton.addEventListener('click', () => { pausado = !pausado; ponerBoton(); pedir(); });
  consulta.addEventListener('change', (e) => {
    menosMovimiento = e.matches;
    // Una escena pesada no se queda puesta si ahora se pide menos movimiento
    if (menosMovimiento) for (const v of vivas) if (v.def.pesada && v.estado === 'viva') caer(v, 'lenta');
    ponerBoton();
    pedir();
  });

  // ---------- Medidas y eventos (una sola vez para todas) ----------
  function medir() {
    ancho = innerWidth; alto = innerHeight;
    medirSecciones();
    for (const v of vivas) if (v.inst && v.inst.medir) v.inst.medir();
    pedir();
  }
  addEventListener('resize', medir, { passive: true });
  addEventListener('scroll', pedir, { passive: true });
  document.addEventListener('visibilitychange', pedir);
  if ('ResizeObserver' in window) new ResizeObserver(() => { medirSecciones(); pedir(); }).observe(document.body);

  // ---------- Arranque ----------
  medirSecciones();
  ponerBoton();
  const ahorro = !!(navigator.connection && navigator.connection.saveData);
  let tardias = false;
  const cargarPesadas = () => {
    if (tardias) return;
    tardias = true;
    for (const v of vivas) if (v.def.pesada || v.def.tardia) cargar(v);
  };
  for (const v of vivas) {
    if (v.def.tardia) continue;
    if (!v.def.pesada) { cargar(v); continue; }
    if (menosMovimiento || ahorro || !puedeGPU()) caer(v, 'lenta');
  }
  if (vivas.some((v) => (v.def.pesada || v.def.tardia) && v.estado === 'esperando')) {
    addEventListener('scroll', cargarPesadas, { once: true, passive: true });
    // Una escena que pide primer plano (la intro) no se interrumpe: la pesada se pide al acabar ella
    const ocupada = () => vivas.some((v) => v.estado === 'viva' && v.inst.ocupada && v.inst.ocupada());
    const cuandoLibre = () => (ocupada() ? setTimeout(cuandoLibre, 300) : cargarPesadas());
    const libre = () => (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(cuandoLibre, { timeout: 2500 });
    if (document.readyState === 'complete') libre(); else addEventListener('load', libre, { once: true });
  }
  html.classList.add('motor');
  pedir();

  // Para las pruebas por fotograma y la consola: nada de esto cambia lo que se ve
  return {
    T,
    reloj: () => reloj,
    escenas: () => vivas.map((v) => ({ nombre: v.def.nombre, estado: v.estado, activa: v.activa, tramo: v.tramo })),
    detalle: (nombre) => { const v = vivas.find((x) => x.def.nombre === nombre); return v && v.inst && v.inst.estado ? v.inst.estado() : null; },
    bajadas: () => bajadas,
    pausado: () => pausado,
    get menosMovimiento() { return menosMovimiento; },
  };
}
