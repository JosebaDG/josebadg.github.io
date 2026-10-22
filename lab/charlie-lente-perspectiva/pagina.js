// Lente en perspectiva: la malla de la portada vista de lado, con la lente en el fondo del embudo
// (Charlie, laboratorio). Basado en pdoom-video de Giacomo Magnanini
// (github.com/mexicat/pdoom-video), MIT.
//
// La página es la de ../charlie-lente-gpu/ (copiada, sin tocar la original): los mismos mandos, la
// misma colocación en la parte libre de la pantalla y el mismo «Medir las dos» (10 cuadros de
// calentamiento y 120 esperando a la GPU en cada uno, con la cifra del bloque entre 120 y al lado
// la mediana y el p90). Carga las dos versiones de la escena, WebGL2 y WebGPU, cada una en su
// lienzo, y enseña una. Si no hay WebGPU, lo dice y sigue con WebGL2.
// Lo que cambia es la escena (comun.js, escena-gl.js y escena-gpu.js) y los textos.
// Para scripts: window.lente.fotograma(t, r), window.lente.medirLasDos(n), window.lente.motores,
// y dataset.listo === '1' cuando el fotograma está asentado.

import * as gl2 from './escena-gl.js';
import * as gpu from './escena-gpu.js';

const FPS_MIN = 30, VENTANA_MS = 1500, LENTAS_SEGUIDAS = 2, PASO_MAX = 0.05, ASENTAR = 4, GIRO = 14;
const CALENTAR = 10, CUADROS = 120;
const NOMBRE = { gpu: 'WebGPU', gl: 'WebGL2' };
const $ = (id) => document.getElementById(id);
const html = document.documentElement;
const lienzos = { gpu: $('lienzoGPU'), gl: $('lienzoGL') };
const panel = $('panel'), mostrar = $('mostrar'), estado = $('estado'), cifras = $('cifras'), cartel = $('cartel'), ahora = $('ahora');
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

// Qué se ve con cada masa: los mismos tramos que la lente (comun.js usa sus mismas curvas:
// masa de 0,1 a 0,6; punto alineado a 0,65; sombra de 0,4 a 0,75; arrastre desde 0,6)
const TRAMOS = [
  [0.1, '<strong>Espacio plano.</strong> Sin masa, la malla es un plano liso y el punto dorado está a un lado.'],
  [0.4, '<strong>La masa hunde el espacio.</strong> La malla baja en un embudo y el punto dorado se acerca al centro.'],
  [0.65, '<strong>Anillo de Einstein.</strong> En el fondo del embudo, la luz del punto se abre en arcos hasta cerrar el anillo hacia 0,65. Empieza la sombra.'],
  [1.01, '<strong>Agujero negro.</strong> Embudo hondo, sombra negra en el fondo, anillo de fotones más brillante por un lado y la malla retorcida a su alrededor.'],
];
function contarAhora() {
  const tramo = TRAMOS.find(([hasta]) => T < hasta) || TRAMOS[TRAMOS.length - 1];
  const texto = `Qué ves: ${tramo[1]}`;
  if (ahora.innerHTML !== texto) ahora.innerHTML = texto;
}

// La parte de la pantalla que el panel deja libre: abajo en el móvil, a la izquierda en escritorio.
// Se calcula al cambiar de tamaño o de panel, no en cada cuadro, para no meter trabajo en la medida.
let Z = null;
function zona() {
  const w = innerWidth, h = innerHeight;
  const siempre = { x: w / 2, y: h * 0.42, r: Math.min(w, h) * 0.26 };
  if (panel.hidden) return siempre;
  const p = panel.getBoundingClientRect();
  if (p.left > w * 0.3) { const a = p.left; return a < 160 ? siempre : { x: a / 2, y: h * 0.45, r: Math.min(a, h) * 0.26 }; }
  const a = p.top;
  return a < 160 ? siempre : { x: w / 2, y: a / 2, r: Math.min(w, a) * 0.26 };
}
function recolocar() {
  Z = zona();
  for (const k of ['gpu', 'gl']) if (inst[k]) inst[k].medir();
  asentar = ASENTAR;
  pedir();
}
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
  botonMedir.disabled = true;
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

// Pinta n cuadros con una (con la lente, o vacíos: solo borrar), esperando a la GPU en cada uno;
// el lienzo de esa se ve mientras tanto
async function medirUna(cual, nivel, n, vacio = false) {
  const i = inst[cual];
  i.ponerNivel(nivel);
  for (const k of ['gpu', 'gl']) lienzos[k].hidden = k !== cual;
  await esperaCuadro();
  const tiempos = [];
  let bloque = 0, tramo = 0;
  for (let c = -CALENTAR; c < n; c++) {
    const t0 = performance.now();
    if (c >= 0 && c % 10 === 0) tramo = t0;
    if (vacio) i.pintarVacio(); else i.pintar(T, reloj + c / 60);
    await i.sincronizar();
    const t1 = performance.now();
    if (c >= 0) tiempos.push(t1 - t0);
    if (c >= 0 && (c % 10 === 9 || c === n - 1)) bloque += t1 - tramo;
    if (c % 10 === 9) await esperaCuadro();
  }
  tiempos.sort((a, b) => a - b);
  return { porCuadro: bloque / n, mediana: tiempos[Math.floor(n / 2)], p90: tiempos[Math.floor(n * 0.9)], nivel: i.nivel, ...i.resolucion };
}

// Mide con una. Si falla, esa sale «sin dato» con el motivo (devuelve null). Si la GPU no contesta en
// el tiempo máximo de sincronizar(), se suelta como si se hubiera perdido y se sigue con la otra
// (si se perdió, ya lo ha hecho fallo()).
async function intentar(k, medida) {
  try { return await medida(); } catch (e) {
    const texto = e && e.message ? e.message : 'fallo al medir';
    if (e && e.name === 'TimeoutError' && inst[k]) {
      const caida = inst[k];
      fallo(k, texto);
      try { caida.retirar(); } catch { /* ya no estaba */ }
    }
    motivo[k] = texto;
    return null;
  }
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
      res[k] = await intentar(k, () => medirUna(k, nivel, n));
    }
  } finally {
    midiendo = false;
    if (activo) ensenar(activo);
  }
  return res;
}

// En llano: cuánto tarda cada una por cuadro y cuánto del margen usa. Una pantalla de 120 Hz
// da 8,3 ms por cuadro y una de 60 Hz, 16,7. Se mide esperando a la GPU en cada
// cuadro, así que es el caso más justo, no el más cómodo.
const MARGEN = 1000 / 120, MARGEN60 = 1000 / 60;
function textoLlano(r) {
  const parte = (ms) => `${Math.round((ms / MARGEN) * 100)} %`;
  const cabe = (ms) => (ms <= MARGEN ? 'le sobra tiempo' : ms <= MARGEN60 ? 'a 120 Hz no le da, a 60 Hz sí' : 'no le da ni a 60 Hz');
  if (!r.gl && !r.gpu) return 'No ha salido ninguna cifra.';
  if (!r.gl || !r.gpu) {
    const k = r.gl ? 'gl' : 'gpu', ms = r[k].porCuadro;
    return `<strong>${NOMBRE[k]}</strong> tarda ${num(ms, 1)} ms por cuadro: usa el ${parte(ms)} de los 8,3 ms que da una pantalla de 120 Hz, así que ${cabe(ms)}. ${r.sinGPU ? 'Este navegador no tiene WebGPU, así que no hay con qué comparar.' : 'La otra no ha dado cifra.'}`;
  }
  const a = r.gl.porCuadro, b = r.gpu.porCuadro;
  let t = `Por cuadro, <strong>WebGL2</strong> tarda ${num(a, 1)} ms y <strong>WebGPU</strong> ${num(b, 1)} ms. Una pantalla de 120 Hz da 8,3 ms por cuadro: WebGL2 usa el ${parte(a)} y WebGPU el ${parte(b)}.`;
  t += Math.max(a, b) <= MARGEN ? ' A las dos les sobra tiempo.' : ` WebGL2: ${cabe(a)}. WebGPU: ${cabe(b)}.`;
  const veces = Math.max(a, b) / Math.max(Math.min(a, b), 1e-3);
  if (veces < 1.1) t += ' Empatan: es la misma imagen y el mismo trabajo por píxel.';
  else if (a < b) t += ' Aquí WebGPU no gana: la escena son dos dibujos (la malla y la lente) y el trabajo de cada vértice y cada píxel es el mismo en las dos, así que lo que WebGPU ahorra (preparar muchos dibujos, cálculo aparte) no tiene dónde notarse. También cuenta cómo espera cada una a que la GPU acabe el cuadro: WebGL2 lee un píxel y se queda parada; WebGPU pide un aviso y sigue cuando llega.';
  else t += ` Aquí WebGPU gana por ${num(veces, 1)} veces, con la misma imagen: el ahorro está en cómo manda el trabajo a la GPU, no en lo que pinta.`;
  return t;
}

function textoCifras(r) {
  const una = (k) => (r[k] ? `${NOMBRE[k]} ${num(r[k].porCuadro, 2)} ms (mediana ${num(r[k].mediana, 2)}, p90 ${num(r[k].p90, 2)})` : `${NOMBRE[k]} sin dato${motivo[k] ? `: ${escapar(motivo[k])}` : ''}`);
  const base = r.gl || r.gpu;
  const donde = base ? ` · nivel ${base.nivel}, ${base.ancho} × ${base.alto} px` : '';
  let tecnico;
  if (r.sinGPU) tecnico = `${una('gl')}${donde}. No hay WebGPU (${escapar(r.sinGPU)}), así que solo mido WebGL2.`;
  else {
    let fin = '';
    if (r.gl && r.gpu) {
      const a = r.gl.porCuadro, b = r.gpu.porCuadro;
      const veces = Math.max(a, b) / Math.max(Math.min(a, b), 1e-3);
      fin = veces < 1.1 ? ' Empate: menos de un 10 % de diferencia.' : ` ${b < a ? 'WebGPU' : 'WebGL2'} va ${num(veces, 1)} veces más rápida.`;
    }
    tecnico = `${una('gl')} · ${una('gpu')}${donde}.${fin}`;
  }
  return `<p class="llano">${textoLlano(r)}</p><p class="tecnico">Cifras: ${tecnico} Bloque de ${CUADROS} cuadros entre ${CUADROS}, esperando a la GPU en cada uno.</p>`;
}

// Para capturas: pone t y reloj, repinta y espera a que el fotograma se asiente
function fotograma(t, r = 0) {
  T = limitar(t, 0, 1); reloj = Math.max(0, r);
  rangoT.value = String(T);
  contarAhora();
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
  contarAhora();
  Z = zona();
  const ctx = (cual) => ({
    lienzo: lienzos[cual],
    centro: () => { const z = Z || (Z = zona()); return { x: z.x, y: z.y }; },
    radio: () => (Z || (Z = zona())).r,
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

rangoT.addEventListener('input', () => { T = Number(rangoT.value); contarAhora(); pedir(); });
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
  botonMedir.disabled = !activo;
  if (!r && !activo) avisar('No se puede medir: no queda ninguna forma de pintar la lente.');
  if (r) { cifras.innerHTML = textoCifras(r); avisar(textoNivel()); cifras.scrollIntoView({ block: 'nearest' }); }
});
botonCopiar.addEventListener('click', async () => {
  guardarURL();
  try { await navigator.clipboard.writeText(location.href); avisar('Enlace copiado: abre este mismo fotograma.'); }
  catch { avisar('No se ha podido copiar; el enlace está en la barra de direcciones.'); }
});
botonOcultar.addEventListener('click', () => { panel.hidden = true; mostrar.hidden = false; mostrar.focus(); recolocar(); });
mostrar.addEventListener('click', () => { panel.hidden = false; mostrar.hidden = true; botonOcultar.focus(); recolocar(); });
addEventListener('resize', recolocar);
if ('ResizeObserver' in window) new ResizeObserver(() => { const z = zona(); if (!Z || z.x !== Z.x || z.y !== Z.y || z.r !== Z.r) recolocar(); }).observe(panel);
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
