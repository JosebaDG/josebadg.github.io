// Página de la lente gravitacional (Charlie). Basado en pdoom-video de Giacomo Magnanini
// (github.com/mexicat/pdoom-video), MIT.
//
// Pinta lente.js quieta en el fotograma de la URL (?t=0.8&r=3.2&mm=1&nivel=1&ui=0) o con el reloj en
// marcha. Con nivel automático, un vigilante de fps como el del motor baja un nivel tras dos ventanas
// de 1,5 s por debajo de 30 fps. «Medir» pinta 120 cuadros esperando a la GPU en cada uno y da la
// mediana en milisegundos: es la cifra que se comparará con la versión WebGPU (paso 3).
// Para las capturas y la hoja de contacto: window.lente.fotograma(t, r) y dataset.listo === '1'.

import * as escena from './lente.js';

const FPS_MIN = 30, VENTANA_MS = 1500, LENTAS_SEGUIDAS = 2, PASO_MAX = 0.05, ASENTAR = 4;
const $ = (id) => document.getElementById(id);
const html = document.documentElement;
const lienzo = $('lienzo'), panel = $('panel'), mostrar = $('mostrar'), estado = $('estado');
const rangoT = $('t'), rangoR = $('r'), salidaT = $('tSale'), salidaR = $('rSale');
const selNivel = $('nivel'), botonMarcha = $('marcha'), casillaMM = $('mm');
const botonMedir = $('medirBoton'), botonCopiar = $('copiar'), botonOcultar = $('ocultar');

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (x, d) => x.toFixed(d).replace('.', ',');
const leerNum = (v, d) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };

const q = new URLSearchParams(location.search);
const movil = innerWidth < 600 || matchMedia('(pointer: coarse)').matches;
let T = limitar(leerNum(q.get('t'), 0.85), 0, 1);
let reloj = Math.max(0, leerNum(q.get('r'), 0));
let menosMovimiento = q.has('mm') ? q.get('mm') === '1' : matchMedia('(prefers-reduced-motion: reduce)').matches;
const nivelURL = ['0', '1', '2'].includes(q.get('nivel')) ? Number(q.get('nivel')) : null;
let auto = nivelURL === null;
const conControles = q.get('ui') !== '0';

let inst = null, enMarcha = false, previo = 0, pendiente = false, asentar = 0, midiendo = false;
const ventana = { t0: 0, cuadros: 0, ultimo: 0 };
let lentas = 0;

function avisar(texto) { estado.textContent = texto; }
function textoNivel() {
  const r = inst.resolucion;
  return `Nivel ${inst.nivel}${auto ? ' (automático)' : ''}: lienzo de ${r.ancho} × ${r.alto} px.`;
}

function pedir() { if (!pendiente) { pendiente = true; requestAnimationFrame(cuadro); } }

function cuadro(ahora) {
  pendiente = false;
  if (!inst || midiendo) return;
  if (enMarcha) {
    if (previo) reloj += Math.min(PASO_MAX, (ahora - previo) / 1000);
    previo = ahora;
    if (reloj > Number(rangoR.max)) reloj -= Number(rangoR.max);
    rangoR.value = String(reloj);
    if (auto) vigilar(ahora);
  } else { previo = 0; ventana.t0 = 0; }
  salidaT.textContent = num(T, 3);
  salidaR.textContent = `${num(reloj, 2)} s`;
  try { inst.pintar(T, reloj); } catch (e) { fallo(e && e.message ? e.message : 'error al pintar'); return; }
  if (asentar > 0) asentar--;
  if (!asentar) html.dataset.listo = '1';
  if (enMarcha || asentar > 0) pedir();
  if (!enMarcha) guardarURL();
}

// Como el motor: un parón suelto (otra pestaña, una captura) no cuenta como ir lento
function vigilar(ahora) {
  if (ventana.t0 && ahora - ventana.ultimo > 250) { ventana.t0 = 0; }
  if (!ventana.t0) { ventana.t0 = ahora; ventana.ultimo = ahora; ventana.cuadros = 0; return; }
  ventana.ultimo = ahora;
  ventana.cuadros++;
  if (ahora - ventana.t0 < VENTANA_MS) return;
  const fps = (ventana.cuadros * 1000) / (ahora - ventana.t0);
  ventana.t0 = ahora; ventana.cuadros = 0;
  lentas = fps < FPS_MIN ? lentas + 1 : 0;
  if (lentas < LENTAS_SEGUIDAS) return;
  lentas = 0;
  if (inst.bajar()) avisar(`Iba a ${Math.round(fps)} fps: baja de nivel. ${textoNivel()}`);
}

function fallo(motivo) {
  inst = null;
  html.dataset.listo = 'fallo';
  $('cartel').hidden = false;
  avisar(`La lente no se puede pintar: ${motivo}.`);
}

function guardarURL() {
  const p = new URLSearchParams();
  p.set('t', T.toFixed(3));
  if (reloj > 0) p.set('r', reloj.toFixed(2));
  if (menosMovimiento) p.set('mm', '1');
  if (!auto) p.set('nivel', String(inst ? inst.nivel : nivelURL));
  if (!conControles) p.set('ui', '0');
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

function marcha(si) {
  enMarcha = si && !menosMovimiento;
  botonMarcha.setAttribute('aria-pressed', String(enMarcha));
  botonMarcha.textContent = enMarcha ? 'Parar reloj' : 'Mover reloj';
  pedir();
}

// Mediana de milisegundos por cuadro con la GPU esperada: el dato para comparar con WebGPU
async function medir(cuadros = 120) {
  if (!inst) return null;
  midiendo = true;
  const tiempos = [];
  const espera = () => new Promise((ok) => requestAnimationFrame(ok));
  await espera();
  for (let i = 0; i < cuadros; i++) {
    const t0 = performance.now();
    inst.pintar(T, reloj + i / 60);
    inst.sincronizar();
    tiempos.push(performance.now() - t0);
    if (i % 10 === 9) await espera();
  }
  midiendo = false;
  tiempos.sort((a, b) => a - b);
  const res = { mediana: tiempos[Math.floor(cuadros / 2)], p90: tiempos[Math.floor(cuadros * 0.9)], nivel: inst.nivel, ...inst.resolucion };
  asentar = ASENTAR;
  pedir();
  return res;
}

// Para capturas y la hoja de contacto: pone t y reloj, repinta y espera a que el fotograma se asiente
function fotograma(t, r = 0) {
  T = limitar(t, 0, 1); reloj = Math.max(0, r);
  rangoT.value = String(T); rangoR.value = String(Math.min(reloj, Number(rangoR.max)));
  html.dataset.listo = '0';
  asentar = ASENTAR;
  pedir();
  return new Promise((ok) => {
    const mira = () => (html.dataset.listo === '1' ? ok(true) : html.dataset.listo === 'fallo' ? ok(false) : requestAnimationFrame(mira));
    requestAnimationFrame(mira);
  });
}

async function arrancar() {
  html.dataset.listo = '0';
  rangoT.value = String(T);
  rangoR.value = String(Math.min(reloj, Number(rangoR.max)));
  casillaMM.checked = menosMovimiento;
  selNivel.value = auto ? 'auto' : String(nivelURL);
  if (!conControles) { panel.hidden = true; }
  const ctx = {
    lienzo,
    centro: () => ({ x: innerWidth / 2, y: innerHeight * 0.42 }),
    radio: () => Math.min(innerWidth, innerHeight) * 0.26,
    get menosMovimiento() { return menosMovimiento; },
    get pausado() { return !enMarcha; },
    movil,
    nivel: nivelURL ?? undefined,
    pedir,
    fallo: () => fallo('el navegador ha soltado el contexto WebGL'),
  };
  try {
    inst = await escena.iniciar(ctx);
  } catch (e) {
    fallo(e && e.message ? e.message : 'sin detalle');
    return;
  }
  avisar(textoNivel() + (menosMovimiento ? ' Menos movimiento: el reloj no corre.' : ''));
  asentar = ASENTAR;
  pedir();
}

rangoT.addEventListener('input', () => { T = Number(rangoT.value); pedir(); });
rangoR.addEventListener('input', () => { reloj = Number(rangoR.value); pedir(); });
botonMarcha.addEventListener('click', () => marcha(!enMarcha));
casillaMM.addEventListener('change', () => {
  menosMovimiento = casillaMM.checked;
  if (menosMovimiento) marcha(false);
  botonMarcha.disabled = menosMovimiento;
  pedir();
});
selNivel.addEventListener('change', () => {
  if (!inst) return;
  auto = selNivel.value === 'auto';
  inst.ponerNivel(auto ? (movil ? 1 : 2) : Number(selNivel.value));
  lentas = 0; ventana.t0 = 0;
  avisar(textoNivel());
  pedir();
});
botonMedir.addEventListener('click', async () => {
  botonMedir.disabled = true;
  avisar('Midiendo 120 cuadros…');
  const m = await medir();
  botonMedir.disabled = false;
  if (m) avisar(`Mediana ${num(m.mediana, 2)} ms por cuadro (p90 ${num(m.p90, 2)} ms), nivel ${m.nivel}, ${m.ancho} × ${m.alto} px.`);
});
botonCopiar.addEventListener('click', async () => {
  guardarURL();
  try { await navigator.clipboard.writeText(location.href); avisar('Enlace copiado: abre este mismo fotograma.'); }
  catch { avisar('No se ha podido copiar; el enlace está en la barra de direcciones.'); }
});
botonOcultar.addEventListener('click', () => { panel.hidden = true; mostrar.hidden = false; mostrar.focus(); });
mostrar.addEventListener('click', () => { panel.hidden = false; mostrar.hidden = true; botonOcultar.focus(); });
addEventListener('resize', () => { if (inst) { inst.medir(); asentar = ASENTAR; pedir(); } });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
  if (q.has('mm')) return;
  menosMovimiento = e.matches; casillaMM.checked = e.matches;
  if (e.matches) marcha(false);
  botonMarcha.disabled = menosMovimiento;
  pedir();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && enMarcha) { previo = 0; } });

botonMarcha.disabled = menosMovimiento;
window.lente = { fotograma, medir, get nivel() { return inst ? inst.nivel : null; } };
arrancar();
