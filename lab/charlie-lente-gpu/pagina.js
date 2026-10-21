// Lente gravitacional: WebGPU frente a WebGL2, en una sola página (Charlie; paso 3 de la ruta).
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT.
//
// Carga las dos versiones de la misma escena, cada una en su lienzo (un lienzo no puede tener las
// dos a la vez), y enseña una. «Medir las dos» pone las dos al mismo nivel y tamaño, tira 10
// cuadros de calentamiento, pinta 120 esperando a la GPU en cada uno (WebGL2: lee un píxel;
// WebGPU: onSubmittedWorkDone) y enseña la mediana y el p90 de cada una juntas. Si no hay WebGPU,
// lo dice y mide solo WebGL2.
// Para scripts: window.lente.fotograma(t, r), window.lente.medirLasDos(n), window.lente.motores,
// y dataset.listo === '1' cuando el fotograma está asentado.

import * as gl2 from '../charlie-lente/lente.js';
import * as gpu from './lente-gpu.js';

const FPS_MIN = 30, VENTANA_MS = 1500, LENTAS_SEGUIDAS = 2, PASO_MAX = 0.05, ASENTAR = 4, GIRO = 14;
const CALENTAR = 10, CUADROS = 120;
const NOMBRE = { gpu: 'WebGPU', gl: 'WebGL2' };
const $ = (id) => document.getElementById(id);
const html = document.documentElement;
const lienzos = { gpu: $('lienzoGPU'), gl: $('lienzoGL') };
const panel = $('panel'), mostrar = $('mostrar'), estado = $('estado'), cifras = $('cifras'), cartel = $('cartel');
const rangoT = $('t'), salidaT = $('tSale'), selMotor = $('motor'), selNivel = $('nivel');
const botonMarcha = $('marcha'), casillaMM = $('mm'), botonMedir = $('medirBoton'), botonCopiar = $('copiar'), botonOcultar = $('ocultar');

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (x, d) => x.toFixed(d).replace('.', ',');
const escapar = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const leerNum = (v, d) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };

const q = new URLSearchParams(location.search);
const movil = innerWidth < 600 || matchMedia('(pointer: coarse)').matches;
let T = limitar(leerNum(q.get('t'), 0.85), 0, 1);
let reloj = Math.max(0, leerNum(q.get('r'), 0));
let menosMovimiento = q.has('mm') ? q.get('mm') === '1' : matchMedia('(prefers-reduced-motion: reduce)').matches;
const nivelURL = ['0', '1', '2'].includes(q.get('nivel')) ? Number(q.get('nivel')) : null;
let auto = nivelURL === null;
const conControles = q.get('ui') !== '0';
const motorURL = ['gpu', 'gl'].includes(q.get('motor')) ? q.get('motor') : null;

const inst = { gpu: null, gl: null };
const motivo = { gpu: '', gl: '' };
let activo = null, enMarcha = false, previo = 0, pendiente = false, asentar = 0, midiendo = false;
const ventana = { t0: 0, cuadros: 0, ultimo: 0 };
let lentas = 0;

const avisar = (texto) => { estado.textContent = texto; };
function textoNivel() {
  const i = inst[activo], r = i.resolucion;
  return `${NOMBRE[activo]}, nivel ${i.nivel}${auto ? ' (automático)' : ''}: lienzo de ${r.ancho} × ${r.alto} px.`;
}
function pedir() { if (!pendiente) { pendiente = true; requestAnimationFrame(cuadro); } }

function cuadro(ahora) {
  pendiente = false;
  if (!activo || midiendo) return;
  if (enMarcha) {
    if (previo) reloj += Math.min(PASO_MAX, (ahora - previo) / 1000);
    previo = ahora;
    if (reloj > GIRO) reloj -= GIRO;
    if (auto) vigilar(ahora);
  } else { previo = 0; ventana.t0 = 0; }
  salidaT.textContent = num(T, 3);
  try { inst[activo].pintar(T, reloj); } catch (e) { fallo(activo, e && e.message ? e.message : 'error al pintar'); return; }
  if (asentar > 0) asentar--;
  if (!asentar) html.dataset.listo = '1';
  if (enMarcha || asentar > 0) pedir();
  if (!enMarcha) guardarURL();
}

// Como el motor: un parón suelto (otra pestaña, una captura) no cuenta como ir lento
function vigilar(ahora) {
  if (ventana.t0 && ahora - ventana.ultimo > 250) ventana.t0 = 0;
  if (!ventana.t0) { ventana.t0 = ahora; ventana.ultimo = ahora; ventana.cuadros = 0; return; }
  ventana.ultimo = ahora;
  ventana.cuadros++;
  if (ahora - ventana.t0 < VENTANA_MS) return;
  const fps = (ventana.cuadros * 1000) / (ahora - ventana.t0);
  ventana.t0 = ahora; ventana.cuadros = 0;
  lentas = fps < FPS_MIN ? lentas + 1 : 0;
  if (lentas < LENTAS_SEGUIDAS) return;
  lentas = 0;
  if (inst[activo].bajar()) avisar(`Iba a ${Math.round(fps)} fps: baja de nivel. ${textoNivel()}`);
}

// Si una se cae, se sigue con la otra; si no queda ninguna, cartel
function fallo(cual, texto) {
  inst[cual] = null;
  motivo[cual] = texto;
  if (cual === 'gpu') selMotor.querySelector('option[value=gpu]').disabled = true;
  if (activo !== cual) return;
  const otra = cual === 'gpu' ? 'gl' : 'gpu';
  if (inst[otra]) { ensenar(otra); avisar(`${NOMBRE[cual]} se ha caído (${texto}): sigo con ${NOMBRE[otra]}.`); return; }
  activo = null;
  html.dataset.listo = 'fallo';
  cartel.textContent = 'La lente no se puede pintar en este navegador: no hay ni WebGPU ni WebGL 2.';
  cartel.hidden = false;
  avisar(`La lente no se puede pintar: ${texto}.`);
}

function ensenar(cual) {
  activo = cual;
  selMotor.value = cual;
  for (const k of ['gpu', 'gl']) lienzos[k].hidden = k !== cual;
  asentar = ASENTAR;
  pedir();
}

function guardarURL() {
  const p = new URLSearchParams();
  p.set('t', T.toFixed(3));
  if (reloj > 0) p.set('r', reloj.toFixed(2));
  if (activo) p.set('motor', activo);
  if (menosMovimiento) p.set('mm', '1');
  if (!auto && activo) p.set('nivel', String(inst[activo].nivel));
  if (!conControles) p.set('ui', '0');
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

function marcha(si) {
  enMarcha = si && !menosMovimiento;
  botonMarcha.setAttribute('aria-pressed', String(enMarcha));
  botonMarcha.textContent = enMarcha ? 'Parar reloj' : 'Mover reloj';
  pedir();
}

const esperaCuadro = () => new Promise((ok) => requestAnimationFrame(ok));

// Pinta n cuadros con una, esperando a la GPU en cada uno; el lienzo de esa se ve mientras tanto
async function medirUna(cual, nivel, n) {
  const i = inst[cual];
  i.ponerNivel(nivel);
  for (const k of ['gpu', 'gl']) lienzos[k].hidden = k !== cual;
  await esperaCuadro();
  const tiempos = [];
  for (let c = -CALENTAR; c < n; c++) {
    const t0 = performance.now();
    i.pintar(T, reloj + c / 60);
    await i.sincronizar();
    if (c >= 0) tiempos.push(performance.now() - t0);
    if (c % 10 === 9) await esperaCuadro();
  }
  tiempos.sort((a, b) => a - b);
  return { mediana: tiempos[Math.floor(n / 2)], p90: tiempos[Math.floor(n * 0.9)], nivel: i.nivel, ...i.resolucion };
}

// Las dos al mismo nivel (el que tenga ahora la que se ve) y al mismo tamaño; primero WebGL2
async function medirLasDos(n = CUADROS) {
  if (!activo || midiendo) return null;
  midiendo = true;
  const nivel = inst[activo].nivel;
  const res = { gl: null, gpu: null, sinGPU: inst.gpu ? '' : (motivo.gpu || 'este navegador no tiene WebGPU') };
  try {
    for (const k of ['gl', 'gpu']) {
      if (!inst[k]) continue;
      try { res[k] = await medirUna(k, nivel, n); } catch (e) { res[k] = null; motivo[k] = e && e.message ? e.message : 'fallo al medir'; }
    }
  } finally {
    midiendo = false;
    if (activo) ensenar(activo);
  }
  return res;
}

function textoCifras(r) {
  const una = (k) => (r[k] ? `<strong>${NOMBRE[k]}</strong> ${num(r[k].mediana, 2)} ms (p90 ${num(r[k].p90, 2)})` : `<strong>${NOMBRE[k]}</strong> sin dato${motivo[k] ? `: ${escapar(motivo[k])}` : ''}`);
  const base = r.gl || r.gpu;
  const donde = base ? ` · nivel ${base.nivel}, ${base.ancho} × ${base.alto} px` : '';
  if (r.sinGPU) return `${una('gl')}${donde}. No hay WebGPU (${escapar(r.sinGPU)}), así que solo mido WebGL2.`;
  let fin = '';
  if (r.gl && r.gpu) {
    const a = r.gl.mediana, b = r.gpu.mediana;
    const rapida = b < a ? 'WebGPU' : 'WebGL2';
    const veces = Math.max(a, b) / Math.max(Math.min(a, b), 1e-3);
    fin = veces < 1.1 ? ' Empate: menos de un 10 % de diferencia.' : ` ${rapida} va ${num(veces, 1)} veces más rápida.`;
  }
  return `${una('gl')} · ${una('gpu')}${donde}.${fin} Mediana por cuadro, esperando a la GPU.`;
}

// Para capturas: pone t y reloj, repinta y espera a que el fotograma se asiente
function fotograma(t, r = 0) {
  T = limitar(t, 0, 1); reloj = Math.max(0, r);
  rangoT.value = String(T);
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
  casillaMM.checked = menosMovimiento;
  selNivel.value = auto ? 'auto' : String(nivelURL);
  if (!conControles) panel.hidden = true;
  const ctx = (cual) => ({
    lienzo: lienzos[cual],
    centro: () => ({ x: innerWidth / 2, y: innerHeight * 0.42 }),
    radio: () => Math.min(innerWidth, innerHeight) * 0.26,
    get menosMovimiento() { return menosMovimiento; },
    get pausado() { return !enMarcha; },
    movil,
    nivel: nivelURL ?? undefined,
    pedir,
    fallo: (detalle) => fallo(cual, `el navegador ha soltado el contexto ${NOMBRE[cual]}${detalle ? ` (${detalle})` : ''}`),
  });
  const [rGPU, rGL] = await Promise.allSettled([gpu.iniciar(ctx('gpu')), gl2.iniciar(ctx('gl'))]);
  if (rGPU.status === 'fulfilled') inst.gpu = rGPU.value; else motivo.gpu = rGPU.reason && rGPU.reason.message ? rGPU.reason.message : 'sin detalle';
  if (rGL.status === 'fulfilled') inst.gl = rGL.value; else motivo.gl = rGL.reason && rGL.reason.message ? rGL.reason.message : 'sin detalle';
  if (!inst.gpu) selMotor.querySelector('option[value=gpu]').disabled = true;
  if (!inst.gl) selMotor.querySelector('option[value=gl]').disabled = true;
  const primero = motorURL && inst[motorURL] ? motorURL : inst.gpu ? 'gpu' : inst.gl ? 'gl' : null;
  if (!primero) {
    html.dataset.listo = 'fallo';
    cartel.textContent = 'La lente no se puede pintar en este navegador: no hay ni WebGPU ni WebGL 2.';
    cartel.hidden = false;
    avisar(`WebGPU: ${motivo.gpu}. WebGL2: ${motivo.gl}.`);
    botonMedir.disabled = true;
    return;
  }
  ensenar(primero);
  let texto = textoNivel();
  if (!inst.gpu) texto += ` Sin WebGPU (${motivo.gpu}): solo WebGL2.`;
  if (menosMovimiento) texto += ' Menos movimiento: el reloj no corre.';
  avisar(texto);
}

rangoT.addEventListener('input', () => { T = Number(rangoT.value); pedir(); });
selMotor.addEventListener('change', () => {
  const cual = selMotor.value;
  if (!inst[cual]) return;
  if (activo && inst[activo]) inst[cual].ponerNivel(inst[activo].nivel);
  ensenar(cual);
  avisar(textoNivel());
});
botonMarcha.addEventListener('click', () => marcha(!enMarcha));
casillaMM.addEventListener('change', () => {
  menosMovimiento = casillaMM.checked;
  if (menosMovimiento) marcha(false);
  botonMarcha.disabled = menosMovimiento;
  pedir();
});
selNivel.addEventListener('change', () => {
  if (!activo) return;
  auto = selNivel.value === 'auto';
  const n = auto ? (movil ? 1 : 2) : Number(selNivel.value);
  for (const k of ['gpu', 'gl']) if (inst[k]) inst[k].ponerNivel(n);
  lentas = 0; ventana.t0 = 0;
  avisar(textoNivel());
  asentar = ASENTAR;
  pedir();
});
botonMedir.addEventListener('click', async () => {
  botonMedir.disabled = true;
  avisar(`Midiendo ${CUADROS} cuadros con cada una…`);
  const r = await medirLasDos();
  botonMedir.disabled = false;
  if (r) { cifras.innerHTML = textoCifras(r); avisar(textoNivel()); }
});
botonCopiar.addEventListener('click', async () => {
  guardarURL();
  try { await navigator.clipboard.writeText(location.href); avisar('Enlace copiado: abre este mismo fotograma.'); }
  catch { avisar('No se ha podido copiar; el enlace está en la barra de direcciones.'); }
});
botonOcultar.addEventListener('click', () => { panel.hidden = true; mostrar.hidden = false; mostrar.focus(); });
mostrar.addEventListener('click', () => { panel.hidden = false; mostrar.hidden = true; botonOcultar.focus(); });
addEventListener('resize', () => { for (const k of ['gpu', 'gl']) if (inst[k]) inst[k].medir(); asentar = ASENTAR; pedir(); });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
  if (q.has('mm')) return;
  menosMovimiento = e.matches; casillaMM.checked = e.matches;
  if (e.matches) marcha(false);
  botonMarcha.disabled = menosMovimiento;
  pedir();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && enMarcha) previo = 0; });

botonMarcha.disabled = menosMovimiento;
window.lente = {
  fotograma, medirLasDos,
  get motores() { return { gpu: !!inst.gpu, gl: !!inst.gl, activo, motivoGPU: motivo.gpu }; },
  get nivel() { return activo ? inst[activo].nivel : null; },
};
arrancar();
