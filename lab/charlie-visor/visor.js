// Visor de escenas del motor (Charlie, laboratorio de animación y vídeo).
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT
//
// Carga una escena de /motor/ con el mismo contrato que usa el motor (tramo, late, iniciar(ctx) →
// { pintar(t, reloj), retirar(), medir?() }) y la pinta quieta en el fotograma que diga la URL:
//   ?escena=curvatura&t=0.35&r=1.2&mm=1&ui=0
// t va en el tiempo T del motor (el mismo que sale al desplazar /motor/), r son segundos del reloj,
// mm=1 pide el fotograma de «reducir movimiento» y ui=0 quita los controles para las capturas.
// Como todo lo que pinta una escena depende solo de T y del reloj, un enlace es un fotograma exacto.

const ESCENAS = {
  curvatura: { modulo: '/motor/escenas/curvatura.js', nombre: 'Espacio curvado' },
  bigbang: { modulo: '/motor/escenas/bigbang.min.js', nombre: 'Big bang' },
  vuelta: { modulo: '/motor/escenas/vuelta.js', nombre: 'Vuelta al punto', firma: true },
  // Del laboratorio, no del motor: la lente en perspectiva, en su versión WebGL2
  perspectiva: { modulo: '/lab/charlie-lente-perspectiva/escena-gl.js', nombre: 'Lente en perspectiva' },
};
const PASO_MAX = 0.05; // como el motor: el reloj nunca salta más de 50 ms

const $ = (id) => document.getElementById(id);
const html = document.documentElement;
const capas = $('capas'), firma = $('firma'), panel = $('panel'), mostrar = $('mostrar');
const selEscena = $('escena'), rangoT = $('t'), rangoR = $('r'), salidaT = $('tSale'), salidaR = $('rSale');
const botonMarcha = $('marcha'), casillaMM = $('mm'), botonCopiar = $('copiar'), botonOcultar = $('ocultar');
const estado = $('estado'), filaReloj = $('filaReloj');

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (x, d) => x.toFixed(d).replace('.', ',');
const leerNum = (v, porDefecto) => { const x = parseFloat(v); return Number.isFinite(x) ? x : porDefecto; };

// ---------- Estado, desde la URL ----------
const q = new URLSearchParams(location.search);
const prefiereMenos = matchMedia('(prefers-reduced-motion: reduce)').matches;
let nombre = ESCENAS[q.get('escena')] ? q.get('escena') : 'curvatura';
let tPedido = q.has('t') ? leerNum(q.get('t'), null) : null;
let reloj = Math.max(0, leerNum(q.get('r'), 0));
let menosMovimiento = q.has('mm') ? q.get('mm') === '1' : prefiereMenos;
let conControles = q.get('ui') !== '0';

let viva = null;       // { nombre, tramo, late, inst, lienzo }
let T = 0;             // t del motor
let enMarcha = false, previo = 0, pendiente = false, turno = 0;
// Cuadros de más tras cargar o medir: WebKit no enseña un WebGL pintado en el mismo cuadro en que
// aparece el lienzo (en las capturas salía negro). Con unos pocos repintados del mismo fotograma, se queda.
const ASENTAR = 4;
let asentar = 0;

// ---------- Contexto que recibe la escena: el mismo que le da el motor ----------
function ctxDe(lienzo, alFallar) {
  return {
    lienzo,
    centro: () => ({ x: innerWidth / 2, y: innerHeight * 0.42 }),
    radio: () => Math.min(innerWidth, innerHeight) * 0.26,
    T: () => T,
    get menosMovimiento() { return menosMovimiento; },
    get pausado() { return false; },
    get movil() { return innerWidth < 600 || matchMedia('(pointer: coarse)').matches; },
    pedir,
    fallo: alFallar,
  };
}

function avisar(texto) { estado.textContent = texto; }

function retirarViva() {
  if (!viva) return;
  try { viva.inst && viva.inst.retirar(); } catch { /* ya no está */ }
  viva.lienzo.remove();
  viva = null;
}

async function cargar(n) {
  const mio = ++turno;
  html.dataset.listo = '0';
  retirarViva();
  const def = ESCENAS[n];
  firma.hidden = !def.firma;
  const lienzo = document.createElement('canvas');
  lienzo.setAttribute('aria-hidden', 'true');
  capas.append(lienzo);
  avisar(`Cargando ${def.nombre}…`);
  try {
    const m = await import(def.modulo);
    if (mio !== turno) { lienzo.remove(); return; }
    const entrada = { nombre: n, tramo: m.tramo, late: !!m.late, inst: null, lienzo };
    // El t ya puesto antes de iniciar: hay escenas que lo miran al arrancar (ctx.T())
    T = limitar(tPedido ?? (m.tramo[0] + m.tramo[1]) / 2, m.tramo[0], m.tramo[1]);
    entrada.inst = await m.iniciar(ctxDe(lienzo, () => fallo(entrada, 'la escena ha pedido retirarse')));
    if (mio !== turno) { try { entrada.inst.retirar(); } catch { /* nada */ } lienzo.remove(); return; }
    viva = entrada;
    nombre = n;
    const [desde, hasta] = m.tramo;
    rangoT.min = String(desde);
    rangoT.max = String(hasta);
    tPedido = null;
    rangoT.value = String(T);
    asentar = ASENTAR;
    filaReloj.classList.toggle('apagado', !viva.late);
    rangoR.disabled = !viva.late;
    botonMarcha.disabled = !viva.late;
    avisar(`${def.nombre}: tramo de ${num(desde, 2)} a ${num(hasta, 2)} del motor.${viva.late ? '' : ' No usa el reloj.'}`);
    pedir();
  } catch (e) {
    if (mio !== turno) return;
    lienzo.remove();
    html.dataset.listo = 'fallo';
    avisar(`${def.nombre} no ha cargado en este navegador (${e && e.message ? e.message : 'sin detalle'}). En /motor/ su sección enseña el cartel fijo.`);
  }
}

function fallo(entrada, motivo) {
  if (viva !== entrada) return;
  retirarViva();
  html.dataset.listo = 'fallo';
  avisar(`La escena se ha retirado: ${motivo}.`);
}

// ---------- Pintar ----------
function pedir() { if (!pendiente) { pendiente = true; requestAnimationFrame(cuadro); } }

function cuadro(ahora) {
  pendiente = false;
  if (enMarcha) {
    if (previo) reloj += Math.min(PASO_MAX, (ahora - previo) / 1000);
    previo = ahora;
    if (reloj > Number(rangoR.max)) reloj = 0;
    rangoR.value = String(reloj);
  } else previo = 0;
  salidaT.textContent = num(T, 3);
  salidaR.textContent = `${num(reloj, 2)} s`;
  if (viva) {
    const [desde, hasta] = viva.tramo;
    try {
      viva.inst.pintar(limitar((T - desde) / (hasta - desde), 0, 1), reloj);
      if (asentar > 0) asentar--;
      if (!asentar) html.dataset.listo = '1';
    } catch (e) { fallo(viva, e && e.message ? e.message : 'error al pintar'); }
  }
  if (enMarcha || asentar > 0) pedir();
  if (!enMarcha) guardarURL();
}

// ---------- URL: cada fotograma tiene su enlace ----------
function enlace() {
  const p = new URLSearchParams();
  p.set('escena', nombre);
  p.set('t', String(+T.toFixed(3)));
  if (reloj) p.set('r', String(+reloj.toFixed(2)));
  if (menosMovimiento !== prefiereMenos || q.has('mm')) p.set('mm', menosMovimiento ? '1' : '0');
  if (!conControles) p.set('ui', '0');
  return `${location.pathname}?${p}`;
}
let temporizador = 0;
function guardarURL() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => history.replaceState(null, '', enlace()), 150);
}

// ---------- Controles ----------
function ponerMarcha(si) {
  enMarcha = si && !!viva && viva.late;
  botonMarcha.setAttribute('aria-pressed', String(enMarcha));
  botonMarcha.textContent = enMarcha ? 'Parar reloj' : 'Mover reloj';
  pedir();
}
function ponerControles(si) {
  conControles = si;
  panel.hidden = !si;
  mostrar.hidden = si;
  guardarURL();
}

selEscena.value = nombre;
casillaMM.checked = menosMovimiento;
rangoR.value = String(reloj);

selEscena.addEventListener('change', () => { ponerMarcha(false); cargar(selEscena.value); });
rangoT.addEventListener('input', () => { T = Number(rangoT.value); asentar = Math.max(asentar, 2); pedir(); });
rangoR.addEventListener('input', () => { reloj = Number(rangoR.value); asentar = Math.max(asentar, 2); pedir(); });
botonMarcha.addEventListener('click', () => ponerMarcha(!enMarcha));
casillaMM.addEventListener('change', () => {
  menosMovimiento = casillaMM.checked;
  // Algunas escenas deciden al iniciar cuánto pintan: se vuelve a cargar con el t de ahora
  tPedido = T;
  ponerMarcha(false);
  cargar(nombre);
});
botonCopiar.addEventListener('click', async () => {
  const url = new URL(enlace(), location.href).href;
  try { await navigator.clipboard.writeText(url); avisar('Enlace copiado: abre este mismo fotograma.'); }
  catch { avisar(url); }
});
botonOcultar.addEventListener('click', () => { ponerControles(false); mostrar.focus(); });
mostrar.addEventListener('click', () => { ponerControles(true); selEscena.focus(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !conControles) { ponerControles(true); selEscena.focus(); } });
addEventListener('resize', () => { if (viva && viva.inst.medir) viva.inst.medir(); asentar = ASENTAR; pedir(); }, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) ponerMarcha(false); });

ponerControles(conControles);
cargar(nombre);

// Para las capturas por fotograma (Playwright) y la consola
window.visor = {
  ir: (n, t, r = 0) => { reloj = r; rangoR.value = String(r); tPedido = t; selEscena.value = n; return cargar(n); },
  estado: () => ({ escena: viva && viva.nombre, T, reloj, menosMovimiento, listo: html.dataset.listo }),
  enlace,
  // Para exportar vídeo fotograma a fotograma (lab/charlie-video/): mueve t y reloj sobre la escena ya
  // cargada, sin volver a importarla, y se resuelve cuando el fotograma está pintado y asentado.
  tramo: () => (viva ? { desde: viva.tramo[0], hasta: viva.tramo[1], late: viva.late } : null),
  fotograma: (t, r = 0) => new Promise((resolver) => {
    if (!viva) { resolver(false); return; }
    T = limitar(t, viva.tramo[0], viva.tramo[1]);
    reloj = Math.max(0, r);
    rangoT.value = String(T);
    rangoR.value = String(reloj);
    html.dataset.listo = '0';
    asentar = ASENTAR;
    pedir();
    const mirar = () => (html.dataset.listo === '1' ? resolver(true) : html.dataset.listo === 'fallo' ? resolver(false) : requestAnimationFrame(mirar));
    requestAnimationFrame(mirar);
  }),
};
