// The Singularity · escena del motor: la intro, un fogonazo de 2,4 s al abrir la página.
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT
//
// Negro y el punto quieto; el punto se enciende, estalla en un fogonazo con una onda de cinco
// colores (--c-*) y, al apagarse la luz, deja ver la curvatura que hay debajo, con el mismo punto en
// el mismo centro() del motor. Lienzo 2D, sin dependencias.
//
// A diferencia de las otras escenas, no va con el desplazamiento: va con el tiempo real desde su
// primer cuadro, para durar lo mismo en un equipo lento (el reloj del motor se frena con los cuadros
// lentos). Un hueco de más de 0,25 s entre cuadros (pestaña oculta) no cuenta. Por eso:
// - Se salta con cualquier gesto: tocar, una tecla, la rueda o desplazar. También con la pausa del motor.
// - Una vez por sesión: al volver a la página en la misma pestaña no se repite.
// - Con «reducir movimiento» no hay fogonazo: la página abre directamente en el fotograma fijo de la
//   curvatura.
// - Si la página abre ya desplazada (volver atrás, un enlace a una sección), no sale.
// Un solo destello, de subida suave: queda lejos del límite de tres destellos por segundo (WCAG 2.3.1).
import { PUNTO } from '../relevos.js';

export const tramo = [0, PUNTO.aparece];
export const late = true;

// Momentos de la intro, en segundos desde su primer cuadro
const ENCIENDE = 0.35;  // el punto pasa de nada a su brillo
const ESTALLA = 0.55;   // pico del fogonazo
const ONDA = 1.6;       // la onda llega a la esquina más lejana
const DESTAPA = [0.9, 1.9]; // el negro se abre y deja ver la curvatura
const DURA = 2.4;       // fin: solo queda el punto de la curvatura
const FUNDIDO = 0.3;    // al saltarla, se funde en 0,3 s
const HUECO_MAX = 0.25; // un cuadro nunca adelanta la intro más de esto
const VISTA = 'motor-intro-vista';

const QUIEN = ['persona', 'miles', 'charlie', 'maya', 'simone'];
const RESERVA = ['#ffffff', '#a2bcff', '#47d6cf', '#f89dc9', '#e6b55d'];

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const tramoDe = (x, a, b) => limitar((x - a) / (b - a), 0, 1);
const suave = (x) => x * x * (3 - 2 * x);

function yaVista() {
  try { return localStorage.getItem(VISTA) === '1'; } catch { return false; }
}
function marcarVista() {
  try { localStorage.setItem(VISTA, '1'); } catch { /* sin almacenamiento: se verá otra vez */ }
}

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function iniciar(ctx) {
  const { lienzo, centro } = ctx;
  const g = lienzo.getContext('2d');
  if (!g) throw new Error('sin 2D');

  const estilo = getComputedStyle(document.documentElement);
  const colores = QUIEN.map((q, i) => rgb(estilo.getPropertyValue(`--c-${q}`) || RESERVA[i]));

  // terminada: ya no pinta nada. e: segundos de intro. saltada: e del gesto. previo: hora del último cuadro.
  let terminada = ctx.menosMovimiento || yaVista() || ctx.T() > 0.02;
  let e = 0, previo = null, saltada = null, dpr = 1, w = 0, h = 0;

  function medir() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = innerWidth; h = innerHeight;
    lienzo.width = Math.round(w * dpr);
    lienzo.height = Math.round(h * dpr);
  }

  function acabar() {
    if (terminada) return;
    terminada = true;
    marcarVista();
    quitarGestos();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, lienzo.width, lienzo.height);
    lienzo.style.display = 'none';
    ctx.pedir();
  }

  // Un gesto la salta: se funde en FUNDIDO; con pausa o menos movimiento, o si aún no ha empezado, se quita ya
  function saltar() {
    if (terminada || saltada !== null) return;
    if (previo === null || ctx.pausado || ctx.menosMovimiento) { acabar(); return; }
    saltada = e;
    marcarVista();
    ctx.pedir();
  }
  const GESTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
  const op = { passive: true };
  function quitarGestos() { for (const e of GESTOS) removeEventListener(e, saltar, op); }
  if (!terminada) for (const e of GESTOS) addEventListener(e, saltar, op);
  else lienzo.style.display = 'none';

  medir();

  function pintar() {
    if (terminada) return;
    if (ctx.menosMovimiento || ctx.pausado) { acabar(); return; }
    const ahora = performance.now() / 1000;
    if (previo !== null) e += Math.min(HUECO_MAX, Math.max(0, ahora - previo));
    previo = ahora;
    let fuera = 1;
    if (saltada !== null) {
      fuera = 1 - tramoDe(e - saltada, 0, FUNDIDO);
      if (fuera <= 0) { acabar(); return; }
    }
    if (e >= DURA) { acabar(); return; }

    const { x: cx, y: cy } = centro();
    const lejos = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalAlpha = fuera;

    // Negro encima de la curvatura hasta que la luz se apaga; se abre desde el centro
    const tapa = 1 - suave(tramoDe(e, DESTAPA[0], DESTAPA[1]));
    if (tapa > 0) {
      const hueco = lejos * suave(tramoDe(e, DESTAPA[0], DESTAPA[1])) * 1.1;
      const gr = g.createRadialGradient(cx, cy, hueco * 0.6, cx, cy, hueco + lejos * 0.35 + 1);
      gr.addColorStop(0, `rgba(0,0,0,${0.15 * tapa})`);
      gr.addColorStop(1, `rgba(0,0,0,${tapa})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }

    g.globalCompositeOperation = 'lighter';

    // El punto: se enciende, se hincha en el fogonazo y vuelve a su tamaño
    const enc = suave(tramoDe(e, 0.05, ENCIENDE));
    const pico = Math.exp(-Math.pow((e - ESTALLA) / 0.16, 2));
    const radioPunto = 3 + 2 * enc + 26 * pico;
    const brillo = enc * (1 - 0.6 * tramoDe(e, DURA - 0.5, DURA));
    luz(cx, cy, radioPunto * 4, [255, 248, 236], brillo, 0.0);
    luz(cx, cy, radioPunto, [255, 255, 255], brillo, 0.55);

    // El fogonazo: la pantalla se llena de luz cálida y se apaga en algo menos de un segundo
    const sube = suave(tramoDe(e, ENCIENDE, ESTALLA));
    const baja = Math.exp(-Math.max(0, e - ESTALLA) / 0.28);
    const fogonazo = sube * baja;
    if (fogonazo > 0.002) {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, lejos);
      gr.addColorStop(0, `rgba(255,250,240,${0.95 * fogonazo})`);
      gr.addColorStop(0.25, `rgba(255,236,210,${0.5 * fogonazo})`);
      gr.addColorStop(1, `rgba(255,220,190,${0.22 * fogonazo})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }

    // La onda: cinco arcos, uno por color, que salen del punto y llegan a la esquina más lejana
    const av = tramoDe(e, ESTALLA - 0.08, ONDA);
    if (av > 0 && av < 1) {
      const r = lejos * (1 - Math.pow(1 - av, 2.2));
      const a = Math.pow(1 - av, 1.4) * suave(tramoDe(e, ESTALLA - 0.08, ESTALLA + 0.05));
      const grueso = 1.5 + 10 * (1 - av);
      const giro = -Math.PI / 2 + 0.5 * av;
      const hueco = 0.06;
      g.lineWidth = grueso;
      g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const [rr, gg, bb] = colores[i];
        const a0 = giro + (i / 5) * Math.PI * 2 + hueco;
        const a1 = giro + ((i + 1) / 5) * Math.PI * 2 - hueco;
        g.strokeStyle = `rgba(${rr},${gg},${bb},${0.85 * a})`;
        g.beginPath();
        g.arc(cx, cy, r, a0, a1);
        g.stroke();
      }
    }

    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  function luz(x, y, r, [rr, gg, bb], a, duro) {
    if (a <= 0 || r <= 0) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rr},${gg},${bb},${a})`);
    if (duro > 0) gr.addColorStop(duro, `rgba(${rr},${gg},${bb},${a * 0.9})`);
    gr.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  return {
    pintar,
    medir,
    retirar() { quitarGestos(); terminada = true; },
    // Mientras dura, el motor no pide la escena pesada: su carga pararía el fogonazo
    ocupada: () => !terminada,
    // Para las pruebas: en qué punto va (nada de esto cambia lo que se ve)
    estado: () => (terminada ? 'terminada' : saltada !== null ? 'saltando' : previo === null ? 'esperando' : 'en marcha'),
    segundos: () => e,
  };
}
