// The Singularity · escena del motor: la vuelta al punto (Charlie).
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT
//
// Al final de la página, todo vuelve a un punto: un cielo tenue de partículas (blancas y alguna de
// cada agente, con los tokens --c-*) sale mientras se lee la penúltima sección y cae en espiral hacia
// el punto del logotipo, el elemento marcado con [data-punto-final]. Si no hay ninguno, cae en el
// centro() del motor. Al llegar queda un halo que respira con el reloj del motor.
//
// Lienzo 2D, sin dependencias, así que es ligera: sale también donde el big bang no puede.
// Lo que se ve depende solo de t, del reloj y de dónde está el punto final; sin azar (semilla fija).
// - El punto final se mide en cada cuadro: el logotipo se mueve al desplazar y las partículas lo siguen.
// - Con «reducir movimiento» no hay caída ni cielo: el halo aparece ya formado sobre el punto y solo
//   se funde al desplazar.
// - Con la pausa del motor no respira; la caída sigue, porque la mueve el dedo, no el reloj.
// - Si va lenta: la mitad de partículas, hasta un mínimo (bajar()).
import { VUELTA } from '../relevos.js';

export const tramo = [VUELTA.desde, VUELTA.hasta];
// Respira con el reloj del motor al final
export const late = true;

const MIN_PARTICULAS = 300;
const QUIEN = ['persona', 'miles', 'charlie', 'maya', 'simone'];
const RESERVA = ['#ffffff', '#a2bcff', '#47d6cf', '#f89dc9', '#e6b55d'];
const TONOS = 8;          // pasos del color propio al blanco del punto
const RADIO_PUNTO = 12;   // px: el halo final, del tamaño del anillo del símbolo
const RESPIRA = 1.5;      // s: el ritmo de la malla y del punto del símbolo

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const tramoDe = (x, a, b) => limitar((x - a) / (b - a), 0, 1);
const suave = (x) => x * x * (3 - 2 * x);

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function iniciar(ctx) {
  const { lienzo, centro } = ctx;
  const c2 = lienzo.getContext('2d', { alpha: true });
  if (!c2) throw new Error('sin 2D');

  // ---------- Presupuesto ----------
  const potente = (navigator.hardwareConcurrency || 4) >= 8;
  const N = ctx.movil ? (potente ? 1600 : 1000) : (potente ? 3200 : 2000);
  let cuantas = N;

  // ---------- Partículas: datos fijos ----------
  // u, v: sitio en el cielo (0..1 de la pantalla); ret: cuándo sale; giro: sentido y fuerza de la espiral;
  // tam: tamaño; quien: 0 = persona (blanco), 1..4 = agentes, una de cada siete.
  let s = 20261019;
  const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const P = Array.from({ length: N }, (_, i) => ({
    u: azar(), v: azar(), ret: azar(), giro: (azar() < 0.5 ? -1 : 1) * (0.3 + azar() * 0.3),
    tam: 1.1 + azar() * 1.1, base: 0.18 + azar() * 0.22, cerca: Math.pow(azar(), 3),
    ang: azar() * Math.PI * 2, quien: i % 7 === 0 ? 1 + (i % 4) : 0,
  }));

  // Colores de la página, y de cada uno, TONOS pasos hasta el blanco del punto
  const estilo = getComputedStyle(document.documentElement);
  const colores = QUIEN.map((q, k) => {
    const token = estilo.getPropertyValue(`--c-${q}`).trim();
    return rgb(/^#[0-9a-f]{6}$/i.test(token) ? token : RESERVA[k]);
  });
  const tonos = colores.map((c) => Array.from({ length: TONOS + 1 }, (_, k) => {
    const f = k / TONOS;
    return `rgb(${c.map((x) => Math.round(x + (255 - x) * f)).join(',')})`;
  }));

  // ---------- Medidas ----------
  let ancho = 0, alto = 0, dpr = 1;
  function medir() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    ancho = innerWidth; alto = innerHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // El punto del logotipo, en px CSS de la pantalla; si no hay, el centro del motor
  function puntoFinal() {
    const el = document.querySelector('[data-punto-final]');
    if (el) {
      const b = el.getBoundingClientRect();
      if (b.width || b.height) return { x: b.left + b.width / 2, y: b.top + b.height / 2, logo: true };
    }
    const c = centro();
    return { x: c.x, y: c.y, logo: false };
  }

  let ultimo = { t: 0, recogida: 0, llegada: 0, final: null };

  function halo(f, fuerza, respira) {
    if (fuerza <= 0.001) return;
    const r = RADIO_PUNTO * 2.4 * respira;
    const g = c2.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, `rgba(255,255,255,${(0.9 * fuerza).toFixed(3)})`);
    g.addColorStop(0.18, `rgba(255,255,255,${(0.45 * fuerza).toFixed(3)})`);
    g.addColorStop(0.5, `rgba(243,207,150,${(0.12 * fuerza).toFixed(3)})`);
    g.addColorStop(1, 'rgba(243,207,150,0)');
    c2.globalAlpha = 1;
    c2.fillStyle = g;
    c2.fillRect(f.x - r, f.y - r, r * 2, r * 2);
  }

  // t: 0..1 en el tramo. T es el tiempo del motor, el que usan los relevos.
  function pintar(t, reloj) {
    const T = tramo[0] + t * (tramo[1] - tramo[0]);
    const f = puntoFinal();
    c2.globalCompositeOperation = 'source-over';
    c2.clearRect(0, 0, ancho, alto);
    c2.globalCompositeOperation = 'lighter';

    // Con menos movimiento: el halo ya formado, que solo se funde al desplazar
    if (ctx.menosMovimiento) {
      const fuerza = suave(tramoDe(T, VUELTA.cae, VUELTA.llega));
      halo(f, fuerza, 1);
      ultimo = { t, recogida: fuerza, llegada: fuerza, final: f, particulas: 0 };
      return;
    }

    const enciende = suave(tramoDe(T, VUELTA.desde, VUELTA.cae));
    const recogida = tramoDe(T, VUELTA.cae, VUELTA.llega);
    // El halo sale cuando ya ha llegado la mayoría; respira solo al final, con el reloj del motor
    const llegada = suave(tramoDe(recogida, 0.55, 1));
    const respira = 1 + 0.18 * llegada * Math.sin((reloj * Math.PI * 2) / RESPIRA);
    // Mientras el logotipo aún no ha entrado en pantalla, caen hacia el borde por donde va a salir y
    // suben con él: nunca se van de la pantalla
    const borde = RADIO_PUNTO * 2;
    const destino = { x: limitar(f.x, borde, ancho - borde), y: limitar(f.y, borde, alto - borde) };

    for (let i = 0; i < cuantas; i++) {
      const p = P[i];
      // Cada partícula sale un poco más tarde que otra y tarda lo mismo en llegar
      const v = suave(tramoDe(recogida, p.ret * 0.3, p.ret * 0.3 + 0.7));
      const cx = p.u * ancho, cy = p.v * alto;
      // Al llegar se queda pegada al punto, dentro del halo, y respira con él
      const rf = RADIO_PUNTO * 0.8 * p.cerca * respira;
      const fx = destino.x + Math.cos(p.ang) * rf, fy = destino.y + Math.sin(p.ang) * rf;
      const dx = cx - destino.x, dy = cy - destino.y;
      const e = Math.sin(v * Math.PI) * p.giro;
      const x = cx + (fx - cx) * v - dy * e;
      const y = cy + (fy - cy) * v + dx * e;
      if (x < -4 || y < -4 || x > ancho + 4 || y > alto + 4) continue;
      c2.globalAlpha = enciende * (p.base + (1 - p.base) * v) * (1 - 0.55 * llegada * v);
      c2.fillStyle = tonos[p.quien][Math.round(v * TONOS)];
      const tam = p.tam * (1 - 0.35 * v);
      c2.fillRect(x - tam / 2, y - tam / 2, tam, tam);
    }
    halo(f, llegada, respira);
    ultimo = { t, recogida, llegada, final: f, particulas: cuantas };
  }

  // Si va lenta: la mitad de partículas; por debajo del mínimo ya no baja
  function bajar() {
    if (cuantas / 2 < MIN_PARTICULAS) return false;
    cuantas = Math.floor(cuantas / 2);
    return true;
  }

  function retirar() {
    c2.clearRect(0, 0, ancho, alto);
  }

  medir();
  return {
    pintar, medir, bajar, retirar,
    // Para las pruebas: por dónde va y dónde está el punto final
    estado: () => ultimo,
    particulas: () => cuantas,
  };
}
