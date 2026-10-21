// Página «Desmontar un shader»: estado, mandos, pasos y motor. El cálculo está en shader.js.
// Cada paso del texto es un <section data-etapa>: el que ocupa el centro de la pantalla decide qué
// pieza enseña el lienzo. El scroll elige la etapa; los mandos, los números. Nada se mueve solo:
// el reloj solo corre si se pulsa «Mover el reloj», y nunca con «reducir movimiento».

import { ETAPAS, MAX_PASOS, MAX_PLIEGUES, NIVELES, ORIGINAL, WGSL, GLSL, motorGPU, motorGL } from './shader.js';

const $ = (s) => document.querySelector(s);
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (v, def) => { const n = parseFloat(v); return Number.isFinite(n) ? n : def; };
const coma = (x, d) => x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

const Q = new URLSearchParams(location.search);
const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
const E = {
  etapa: limitar(Math.round(num(Q.get('etapa'), 6)), 1, ETAPAS),
  pasos: limitar(Math.round(num(Q.get('pasos'), MAX_PASOS)), 1, MAX_PASOS),
  pliegues: limitar(Math.round(num(Q.get('pliegues'), MAX_PLIEGUES)), 0, MAX_PLIEGUES),
  k: limitar(num(Q.get('k'), 7.1), 2, 12),
  t: limitar(num(Q.get('t'), 0), 0, 62.8),
  dens: 1,
};
const fija = Q.has('etapa'); // con ?etapa= el scroll no la cambia (enlaces exactos y pruebas)
let nivel = limitar(Math.round(num(Q.get('nivel'), 1)), 0, NIVELES.length - 1);
if (Q.get('ui') === '0') document.documentElement.classList.add('sin-ui');

const lienzos = { gpu: $('#lienzoGPU'), gl: $('#lienzoGL') };
let motor = null;
let clave = '';
let pendiente = false;
let reloj = false;
let cuadros = 0;

// ---------- Tamaño del lienzo: px de pantalla × densidad (tope 2) × nivel
function medir() {
  const l = lienzos[clave];
  const r = l.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  E.dens = dpr * NIVELES[nivel];
  const w = Math.max(1, Math.round(r.width * E.dens));
  const h = Math.max(1, Math.round(r.height * E.dens));
  if (l.width !== w || l.height !== h) { l.width = w; l.height = h; }
  ponerTrabajo(w * h);
}

function pedir() {
  if (pendiente || !motor) return;
  pendiente = true;
  requestAnimationFrame(pintar);
}

let antes = null;
function pintar(ms) {
  pendiente = false;
  if (!motor) return;
  if (reloj) {
    if (antes !== null) E.t = (E.t + (ms - antes) / 1000) % 62.8;
    antes = ms;
    ponerT();
  }
  medir();
  motor.pintar(E);
  cuadros++;
  document.documentElement.dataset.cuadros = String(cuadros);
  if (reloj) pedir();
}

// ---------- Motor: WebGPU si lo hay; si no, WebGL2. ?motor=gl obliga a WebGL2
async function ponerMotor(quiero) {
  if (motor) { motor.retirar(); motor = null; }
  let usar = quiero;
  if (usar === 'gpu' && !('gpu' in navigator)) usar = 'gl'; // sin adaptador, motorGPU falla y se pasa a WebGL2
  try {
    motor = usar === 'gpu' ? await motorGPU(lienzos.gpu) : motorGL(lienzos.gl);
  } catch (err) {
    console.warn(err);
    if (usar === 'gpu') { usar = 'gl'; motor = motorGL(lienzos.gl); } else { throw err; }
  }
  clave = usar;
  lienzos.gpu.hidden = usar !== 'gpu';
  lienzos.gl.hidden = usar !== 'gl';
  document.documentElement.dataset.motor = usar;
  $('#motor').value = usar;
  $('#motorSale').textContent = usar === 'gpu' ? 'WebGPU, con WGSL' : 'WebGL2, con GLSL';
  $('#motorSale2').textContent = usar === 'gpu' ? '(ahora: WebGPU)' : '(ahora: WebGL2)';
  $('#fuente').textContent = usar === 'gpu' ? WGSL.trim() : GLSL.trim();
  $('#fuenteIdioma').textContent = usar === 'gpu' ? 'WGSL' : 'GLSL';
  pedir();
}

// ---------- Mandos
const mandos = [
  ['pasos', (v) => String(v)],
  ['pliegues', (v) => String(v)],
  ['k', (v) => coma(v, 1)],
];
function ponerT() {
  for (const el of document.querySelectorAll('[data-mando="t"]')) el.value = E.t.toFixed(2);
  for (const el of document.querySelectorAll('[data-sale="t"]')) el.textContent = coma(E.t, 2) + ' s';
}
function ponerMandos() {
  for (const [n, f] of mandos) {
    for (const el of document.querySelectorAll(`[data-mando="${n}"]`)) el.value = E[n];
    for (const el of document.querySelectorAll(`[data-sale="${n}"]`)) el.textContent = f(E[n]);
  }
  ponerT();
  $('#esOriginal').hidden = !(E.pasos === MAX_PASOS && E.pliegues === MAX_PLIEGUES && Math.abs(E.k - 7.1) < 1e-6);
}
for (const el of document.querySelectorAll('[data-mando]')) {
  el.addEventListener('input', () => {
    const n = el.dataset.mando;
    E[n] = n === 'k' || n === 't' ? num(el.value, E[n]) : Math.round(num(el.value, E[n]));
    ponerMandos();
    pedir();
  });
}
for (const b of document.querySelectorAll('[data-reloj]')) {
  if (reducir) { b.disabled = true; b.title = 'Con «reducir movimiento» el reloj no se mueve solo. Usa el deslizador.'; }
  b.addEventListener('click', () => {
    reloj = !reloj;
    antes = null;
    for (const x of document.querySelectorAll('[data-reloj]')) {
      x.setAttribute('aria-pressed', String(reloj));
      x.textContent = reloj ? 'Parar el reloj' : 'Mover el reloj';
    }
    pedir();
  });
}
$('#volver').addEventListener('click', () => {
  E.pasos = MAX_PASOS; E.pliegues = MAX_PLIEGUES; E.k = 7.1;
  ponerMandos();
  pedir();
});
$('#motor').addEventListener('change', (ev) => ponerMotor(ev.target.value));
$('#nivel').value = String(nivel);
$('#nivel').addEventListener('change', (ev) => { nivel = Number(ev.target.value); pedir(); });

// ---------- Cuánto trabajo es (en vivo, con el tamaño real del lienzo)
function ponerTrabajo(px) {
  const vueltas = E.pasos * Math.max(E.pliegues, 1);
  $('#trabajoPx').textContent = px.toLocaleString('es-ES');
  $('#trabajoVueltas').textContent = vueltas.toLocaleString('es-ES');
  $('#trabajoTotal').textContent = Math.round(px * vueltas / 1e6).toLocaleString('es-ES');
}

// ---------- Pasos del texto: el que cruza el centro de la pantalla elige la etapa
const pasos = [...document.querySelectorAll('[data-etapa]')];
let nombre = '';
function ponerEtapa(n, el) {
  nombre = el.dataset.nombre || '';
  if (E.etapa === n) { marcar(); return; }
  E.etapa = n;
  marcar();
  pedir();
}
function marcar() {
  for (const s of pasos) s.classList.toggle('activo', Number(s.dataset.etapa) === E.etapa && (!nombre || s.dataset.nombre === nombre));
  for (const s of document.querySelectorAll('#codigo [data-p]')) s.classList.toggle('activo', s.dataset.p.split(' ').includes(String(E.etapa)));
  $('#etapaSale').textContent = nombre || pasos.find((s) => Number(s.dataset.etapa) === E.etapa)?.dataset.nombre || '';
}
if (!fija && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entradas) => {
    for (const en of entradas) if (en.isIntersecting) ponerEtapa(Number(en.target.dataset.etapa), en.target);
  }, { rootMargin: '-45% 0px -45% 0px' });
  for (const s of pasos) io.observe(s);
}

// ---------- Arranque
$('#original').textContent = ORIGINAL;
ponerMandos();
marcar();
new ResizeObserver(() => pedir()).observe(document.querySelector('.escenario'));
ponerMotor(Q.get('motor') === 'gl' ? 'gl' : 'gpu').then(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try { await motor.sincronizar(); } catch (e) { console.warn(e); } // sin pantalla, algunos WebGPU no lo resuelven
  document.documentElement.dataset.listo = '1';
}).catch((err) => {
  console.error(err);
  const c = $('#cartel');
  c.hidden = false;
  c.textContent = 'Este navegador no puede pintar con WebGPU ni con WebGL2. El texto sigue valiendo: cada paso explica su pieza.';
  document.documentElement.dataset.listo = 'error';
});
