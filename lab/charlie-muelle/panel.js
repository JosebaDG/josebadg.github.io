// Muelle en T (Charlie): arranca el motor de esta carpeta y lleva el panel de comparación.
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT
import { crearMotor } from './motor.js';
import { crearMuelle, PRESETS, PRESET, LIMITES } from './muelle.js';

const $ = (id) => document.getElementById(id);
const coma = (x, d) => x.toFixed(d).replace('.', ',');
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------- Lo que pide la URL (validado) ----------
const q = new URLSearchParams(location.search);
let activo = q.get('muelle') !== '0';
let preset = PRESETS[q.get('preset')] ? q.get('preset') : PRESET;
let { w, z } = PRESETS[preset];
const numero = (k, [a, b]) => { const n = parseFloat(q.get(k)); return Number.isFinite(n) ? limitar(n, a, b) : null; };
if (numero('w', LIMITES.w) !== null || numero('z', LIMITES.z) !== null) {
  preset = 'mano';
  w = numero('w', LIMITES.w) ?? w;
  z = numero('z', LIMITES.z) ?? z;
}
const sinPanel = q.get('ui') === '0';

// ---------- El motor: las cuatro escenas de /motor/, sin copiarlas ----------
const lecturaScroll = $('lecturaScroll'), lecturaMotor = $('lecturaMotor'), lecturaNota = $('lecturaNota');
let ultimaLectura = '';
function leer(t, objetivo) {
  if (sinPanel) return;
  const texto = `${coma(objetivo, 2)}|${coma(t, 2)}`;
  if (texto === ultimaLectura) return;
  ultimaLectura = texto;
  lecturaScroll.textContent = coma(objetivo, 2);
  lecturaMotor.textContent = coma(t, 2);
  lecturaNota.textContent = Math.abs(t - objetivo) >= 0.01 ? 'persiguiendo' : '';
}

window.motor = crearMotor({
  capas: $('capas'),
  boton: $('pausa'),
  muelle: activo ? { w, z } : null,
  registro: q.get('registro') === '1',
  alCuadro: leer,
  escenas: [
    { nombre: 'bigbang', modulo: '../../motor/escenas/bigbang.min.js', pesada: true },
    { nombre: 'curvatura', modulo: '../../motor/escenas/curvatura.js' },
    { nombre: 'vuelta', modulo: '../../motor/escenas/vuelta.js', tardia: true },
    { nombre: 'intro', modulo: '../../motor/escenas/intro.js' },
  ],
});
const motor = window.motor;
if (!activo) motor.muelle.ajustar({ w, z });   // por si se enciende después

// ---------- Panel ----------
const panel = $('panel'), interruptor = $('interruptor'), selPreset = $('preset');
const wIn = $('w'), zIn = $('z'), estado = $('estado');
if (sinPanel) panel.hidden = true;

// Cuánto tarda en quedarse a menos del 2 % de un salto, con el mismo integrador que el motor
function asienta(w, z) {
  const m = crearMuelle({ w, z });
  m.salta(0);
  let t = 0, ultimoFuera = 0;
  while (t < 5) { m.paso(1, 1 / 120); t += 1 / 120; if (Math.abs(1 - m.x) > 0.02) ultimoFuera = t; }
  return ultimoFuera;
}

function pintarPanel() {
  const mm = motor.menosMovimiento;
  interruptor.disabled = mm;
  interruptor.setAttribute('aria-pressed', String(activo && !mm));
  interruptor.innerHTML = `Muelle: <b>${activo && !mm ? 'sí' : 'no'}</b>`;
  selPreset.value = preset;
  selPreset.disabled = !activo || mm;
  $('ajustar').disabled = !activo || mm;
  if (!activo || mm) abrirAjuste(false);
  wIn.value = w; zIn.value = z;
  $('wSale').textContent = coma(w, 1);
  $('zSale').textContent = coma(z, 2);
  $('asienta').textContent = `${coma(asienta(w, z), 2)} s`;
  estado.textContent = mm ? 'Con «reducir movimiento» no hay muelle: el tiempo salta directo, como en /motor/.' : '';
}

function guardarURL() {
  const u = new URL(location.href);
  u.searchParams.set('muelle', activo ? '1' : '0');
  ['preset', 'w', 'z'].forEach((k) => u.searchParams.delete(k));
  if (preset === 'mano') { u.searchParams.set('w', String(w)); u.searchParams.set('z', String(z)); }
  else u.searchParams.set('preset', preset);
  history.replaceState(null, '', u);
}

interruptor.addEventListener('click', () => {
  activo = !activo;
  motor.muelle.ajustar({ w, z });
  motor.muelle.activar(activo);
  pintarPanel(); guardarURL();
});
selPreset.addEventListener('change', () => {
  preset = selPreset.value;
  if (PRESETS[preset]) ({ w, z } = PRESETS[preset]);
  motor.muelle.ajustar({ w, z });
  if (preset === 'mano') abrirAjuste(true);
  pintarPanel(); guardarURL();
});
function aMano() {
  w = limitar(parseFloat(wIn.value), ...LIMITES.w);
  z = limitar(parseFloat(zIn.value), ...LIMITES.z);
  preset = Object.keys(PRESETS).find((k) => PRESETS[k].w === w && PRESETS[k].z === z) || 'mano';
  motor.muelle.ajustar({ w, z });
  pintarPanel(); guardarURL();
}
function abrirAjuste(si) {
  $('ajuste').hidden = !si;
  $('ajustar').setAttribute('aria-expanded', String(si));
}
$('ajustar').addEventListener('click', () => abrirAjuste($('ajuste').hidden));
wIn.addEventListener('input', aMano);
zIn.addEventListener('input', aMano);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => setTimeout(pintarPanel));

// ---------- «Big bang de golpe»: el mismo gesto brusco cada vez, para comparar con y sin muelle ----------
// Pone la página en T 0,2 (antes del relevo), espera a que el motor esté quieto y la lleva a T 1 (las cinco
// nubes) en 4 cuadros: lo que hace un dedo rápido. Sin muelle, la explosión dura esos 4 cuadros.
function yDe(T) {
  const c = [...document.querySelectorAll('[data-escena]')].map((e) => e.offsetTop + e.offsetHeight * 0.5);
  const i = Math.min(Math.floor(T), c.length - 2);
  return Math.max(0, c[i] + (c[i + 1] - c[i]) * (T - i) - innerHeight * 0.5);
}
const cuadro = () => new Promise((r) => requestAnimationFrame(r));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let golpeando = false;
$('golpe').addEventListener('click', async () => {
  if (golpeando) return;
  golpeando = true;
  scrollTo({ top: yDe(0.2), behavior: 'instant' });
  await espera(250);
  for (let k = 0; k < 120 && !(motor.muelle.quieto || motor.muelle.directo); k++) await cuadro();
  await espera(350);
  const a = yDe(0.2), b = yDe(1);
  for (let k = 1; k <= 4; k++) { await cuadro(); scrollTo({ top: a + (b - a) * (k / 4), behavior: 'instant' }); }
  golpeando = false;
});

pintarPanel();
