// Lente gravitacional: WebGPU frente a WebGL2, en una sola página (Charlie; paso 3 de la ruta).
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT.
//
// Carga las dos versiones de la misma escena, cada una en su lienzo (un lienzo no puede tener las
// dos a la vez), y enseña una. «Medir las dos» pone las dos al mismo nivel y tamaño, tira 10
// cuadros de calentamiento, pinta 120 esperando a la GPU en cada uno (WebGL2: lee un píxel;
// WebGPU: onSubmittedWorkDone) y enseña, de cada una, el tiempo del bloque de 120 entre 120 (con
// décimas) y al lado la mediana y el p90. Si no hay WebGPU, lo dice y mide solo WebGL2.
// Si WebGPU se pierde a mitad o no contesta en 3 s (tiempo máximo de sincronizar()), esa sale
// «sin dato» y la página sigue con WebGL2.
// Por qué el bloque: WebKit e iOS redondean performance.now() al milisegundo, así que un cuadro de
// 3 o 4 ms sale en enteros; el bloque se mide en tramos de 10 cuadros seguidos (sin contar la
// pausa para soltar el hilo cada 10) y el redondeo queda por debajo de 0,1 ms por cuadro.
// «Medir la espera» hace lo mismo en los niveles 0 y 2, con la lente y con cuadros vacíos (solo
// borrar), y dice si la diferencia entre las dos viene de la espera o del dibujo.
// Para scripts: window.lente.fotograma(t, r), window.lente.medirLasDos(n), window.lente.medirEspera(n), window.lente.motores,
// y dataset.listo === '1' cuando el fotograma está asentado.
//
// Que se entienda (Miles): cada mando dice qué cambia, una línea dice qué se ve con la masa puesta,
// el resultado de «Medir las dos» sale también en lenguaje llano (cuánto del margen por cuadro usa
// cada una) y la lente se coloca en la parte de la pantalla que el panel deja libre. Con el panel
// oculto (o ui=0) la lente vuelve al sitio de siempre, así que las capturas y la hoja no cambian.

import * as gl2 from '../charlie-lente/lente.js';
import * as gpu from './lente-gpu.js';

const FPS_MIN = 30, VENTANA_MS = 1500, LENTAS_SEGUIDAS = 2, PASO_MAX = 0.05, ASENTAR = 4, GIRO = 14;
const CALENTAR = 10, CUADROS = 120;
const NOMBRE = { gpu: 'WebGPU', gl: 'WebGL2' };
const $ = (id) => document.getElementById(id);
const html = document.documentElement;
const lienzos = { gpu: $('lienzoGPU'), gl: $('lienzoGL') };
const panel = $('panel'), mostrar = $('mostrar'), estado = $('estado'), cifras = $('cifras'), cartel = $('cartel'), ahora = $('ahora');
const rangoT = $('t'), salidaT = $('tSale'), selMotor = $('motor'), selNivel = $('nivel');
const botonMarcha = $('marcha'), casillaMM = $('mm'), botonMedir = $('medirBoton'), botonEspera = $('esperaBoton'), botonCopiar = $('copiar'), botonOcultar = $('ocultar');

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

// Qué se ve con cada masa: los mismos tramos que parametros() de ../charlie-lente/lente.js
// (masa de 0,1 a 0,6; punto alineado a 0,65; sombra de 0,4 a 0,75; arrastre desde 0,6)
const TRAMOS = [
  [0.1, '<strong>Espacio plano.</strong> Sin masa no se curva nada: cuadrícula recta y el punto dorado a un lado.'],
  [0.4, '<strong>La masa curva el espacio.</strong> La cuadrícula se dobla y el punto dorado se acerca al centro.'],
  [0.65, '<strong>Anillo de Einstein.</strong> El punto se pone detrás de la masa y su luz se abre en arcos a su alrededor, hasta cerrar el anillo hacia 0,65. Empieza la sombra.'],
  [1.01, '<strong>Agujero negro.</strong> Sombra negra, anillo de fotones más brillante por un lado y el espacio retorcido.'],
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
  botonMedir.disabled = true; botonEspera.disabled = true;
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

// Cuánto pesa la espera: en los niveles 0 y 2, cada una pinta n cuadros con la lente y n cuadros
// vacíos (solo borrar el lienzo), esperando a la GPU en cada uno igual que en «Medir las dos». El
// cuadro vacío es casi solo mandar el pase y saber que ha acabado. Si la diferencia entre las dos es
// la misma con la lente que en vacío y no cambia con el nivel, lo que las separa es la espera, no el
// dibujo. Al acabar, las dos vuelven al nivel que tenían.
const NIVELES_ESPERA = [0, 2];
async function medirEspera(n = CUADROS) {
  if (!activo || midiendo) return null;
  midiendo = true;
  const antes = inst[activo].nivel;
  const res = { niveles: [], sinGPU: inst.gpu ? '' : (motivo.gpu || 'este navegador no tiene WebGPU') };
  try {
    for (const nivel of NIVELES_ESPERA) {
      const fila = { nivel, gl: null, gpu: null };
      for (const k of ['gl', 'gpu']) {
        if (!inst[k]) continue;
        const lente = await intentar(k, () => medirUna(k, nivel, n));
        const vacio = lente && inst[k] ? await intentar(k, () => medirUna(k, nivel, n, true)) : null;
        if (lente && vacio) fila[k] = { lente, vacio };
      }
      res.niveles.push(fila);
    }
  } finally {
    for (const k of ['gpu', 'gl']) if (inst[k]) inst[k].ponerNivel(antes);
    midiendo = false;
    if (activo) ensenar(activo);
  }
  return res;
}

// En llano: qué parte del cuadro es la espera y si la diferencia entre las dos viene de ahí
function textoEspera(r) {
  const filas = r.niveles.filter((f) => f.gl || f.gpu);
  if (!filas.length) return '<p class="llano">No ha salido ninguna cifra.</p>';
  const parte = (v, l) => `${Math.round((v / Math.max(l, 1e-3)) * 100)} %`;
  const llano = [];
  const ambas = filas.filter((f) => f.gl && f.gpu);
  for (const f of filas) {
    const trozos = ['gl', 'gpu'].filter((k) => f[k]).map((k) => `${NOMBRE[k]} ${num(f[k].vacio.porCuadro, 1)} de ${num(f[k].lente.porCuadro, 1)} ms (el ${parte(f[k].vacio.porCuadro, f[k].lente.porCuadro)})`);
    llano.push(`Nivel ${f.nivel}: el cuadro vacío tarda ${trozos.join('; ')}.`);
  }
  let t = `<strong>Cuadro vacío</strong> (solo borrar y esperar a la GPU) frente al cuadro con la lente. ${llano.join(' ')}`;
  if (!ambas.length) {
    t += r.sinGPU ? ' Este navegador no tiene WebGPU, así que no hay diferencia que explicar.' : ' La otra no ha dado cifra, así que no hay diferencia que explicar.';
  } else {
    const dif = ambas.map((f) => ({ nivel: f.nivel, lente: f.gpu.lente.porCuadro - f.gl.lente.porCuadro, vacio: f.gpu.vacio.porCuadro - f.gl.vacio.porCuadro }));
    const signo = (x) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x), 2)}`;
    t += ` WebGPU menos WebGL2: ${dif.map((d) => `nivel ${d.nivel}, ${signo(d.lente)} ms con la lente y ${signo(d.vacio)} en vacío`).join('; ')}.`;
    const L = dif.reduce((a, d) => a + d.lente, 0) / dif.length;
    const V = dif.reduce((a, d) => a + d.vacio, 0) / dif.length;
    if (Math.abs(L) < 0.1) t += ' Con la lente casi empatan, así que no hay diferencia que repartir.';
    else {
      const q = V / L;
      if (q >= 0.75 && q <= 1.25) t += ' <strong>La diferencia es la espera:</strong> en vacío se separan casi lo mismo que con la lente, así que no viene del dibujo, sino de mandar el cuadro y saber que ha acabado.';
      else if (q < 0.25) t += ' <strong>La diferencia es el dibujo:</strong> en vacío casi empatan, así que la espera no las separa.';
      else if (q > 1.25) t += ' <strong>La espera explica más que toda la diferencia:</strong> en vacío se separan más que con la lente, así que en el dibujo la que espera más recupera parte.';
      else t += ` <strong>Mitad y mitad:</strong> la espera explica un ${Math.round(q * 100)} % de la diferencia y el resto es el dibujo.`;
    }
  }
  const res = filas.map((f) => (f.gl || f.gpu).lente).map((x) => `${x.ancho} × ${x.alto}`);
  if (res.length === 2 && res[0] === res[1]) t += ' En esta pantalla los niveles 0 y 2 tienen el mismo lienzo: solo cambian la rejilla fina y las estrellas.';

  const una = (f, k) => (f[k] ? `${NOMBRE[k]} lente ${num(f[k].lente.porCuadro, 2)} ms, vacío ${num(f[k].vacio.porCuadro, 2)} ms (mediana ${num(f[k].vacio.mediana, 2)}, p90 ${num(f[k].vacio.p90, 2)})` : `${NOMBRE[k]} sin dato${motivo[k] ? `: ${escapar(motivo[k])}` : ''}`);
  const motores = r.sinGPU ? ['gl'] : ['gl', 'gpu'];
  let tecnico = r.niveles.map((f) => {
    const b = (f.gl || f.gpu);
    return `Nivel ${f.nivel}${b ? `, ${b.lente.ancho} × ${b.lente.alto} px` : ''}: ${motores.map((k) => una(f, k)).join(' · ')}.`;
  }).join(' ');
  if (r.sinGPU) tecnico += ` No hay WebGPU (${escapar(r.sinGPU)}), así que solo mido WebGL2.`;
  return `<p class="llano">${t}</p><p class="tecnico">Cifras: ${tecnico} Bloques de ${CUADROS} cuadros entre ${CUADROS}, esperando a la GPU en cada uno.</p>`;
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
  else if (a < b) t += ' Aquí WebGPU no gana: la escena es un solo dibujo a pantalla completa y cada píxel hace el mismo cálculo en las dos, así que lo que WebGPU ahorra (preparar muchos dibujos, cálculo aparte) no tiene dónde notarse. También cuenta cómo espera cada una a que la GPU acabe el cuadro: WebGL2 lee un píxel y se queda parada; WebGPU pide un aviso y sigue cuando llega.';
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
    botonMedir.disabled = true; botonEspera.disabled = true;
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
  botonMedir.disabled = true; botonEspera.disabled = true;
  avisar(`Midiendo ${CUADROS} cuadros con cada una…`);
  const r = await medirLasDos();
  botonMedir.disabled = !activo; botonEspera.disabled = !activo;
  if (!r && !activo) avisar('No se puede medir: no queda ninguna forma de pintar la lente.');
  if (r) { cifras.innerHTML = textoCifras(r); avisar(textoNivel()); cifras.scrollIntoView({ block: 'nearest' }); }
});
botonEspera.addEventListener('click', async () => {
  botonMedir.disabled = true; botonEspera.disabled = true;
  avisar(`Midiendo la espera: cuadros con la lente y vacíos, niveles 0 y 2, con cada una…`);
  const r = await medirEspera();
  botonMedir.disabled = !activo; botonEspera.disabled = !activo;
  if (!r && !activo) avisar('No se puede medir: no queda ninguna forma de pintar la lente.');
  if (r) { cifras.innerHTML = textoEspera(r); avisar(textoNivel()); cifras.scrollIntoView({ block: 'nearest' }); }
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
  fotograma, medirLasDos, medirEspera,
  get motores() { return { gpu: !!inst.gpu, gl: !!inst.gl, activo, motivoGPU: motivo.gpu }; },
  get nivel() { return activo ? inst[activo].nivel : null; },
};
arrancar();
