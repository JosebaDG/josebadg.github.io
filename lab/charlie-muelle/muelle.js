// Muelle para el tiempo del motor (Charlie, laboratorio de animación y vídeo).
// El T del motor deja de copiar al T del desplazamiento y lo persigue como una masa atada a él con un muelle:
//
//   x'' = ω² · (objetivo − x) − 2·ζ·ω · x'
//
// x es el T que pintan las escenas, objetivo el T que sale del desplazamiento, ω (rad/s) la rigidez
// (ω = √k con masa 1) y ζ la amortiguación (ζ = c / 2√k). Con ζ = 1 (amortiguamiento crítico) llega lo
// antes posible sin pasarse; con ζ < 1 rebota; con ζ > 1 llega más tarde. Ver README.md.
//
// Se integra con Euler semiimplícito en pasos fijos de como mucho 1/240 s: estable para cualquier ω de
// los presets y el mismo resultado con la misma secuencia de dt. Sin azar.

export const PRESETS = {
  suave: { w: 6, z: 1 },     // asienta en ~1,0 s: el big bang se ve entero aunque el dedo vuele
  medio: { w: 9, z: 1 },     // asienta en ~0,65 s: el de por defecto
  firme: { w: 14, z: 1 },    // asienta en ~0,4 s: casi pegado al dedo
  rebote: { w: 9, z: 0.55 }, // se pasa un 12 % y vuelve: para comparar, no para quedarse
};
export const PRESET = 'medio';
export const LIMITES = { w: [2, 30], z: [0.3, 1.5] };

const H = 1 / 240;          // paso máximo de integración, en segundos
const QUIETO_X = 5e-4;      // en secciones: menos de medio píxel en una sección de 844 px
const QUIETO_V = 5e-3;      // en secciones por segundo

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));

export function crearMuelle({ w = PRESETS[PRESET].w, z = PRESETS[PRESET].z } = {}) {
  let x = 0, v = 0, quieto = true, iniciado = false;
  return {
    get x() { return x; },
    get v() { return v; },
    get quieto() { return quieto; },
    get iniciado() { return iniciado; },
    get w() { return w; },
    get z() { return z; },
    // Sin muelle: el T del motor es el del desplazamiento, y la velocidad se olvida
    salta(objetivo) { x = objetivo; v = 0; quieto = true; iniciado = true; return x; },
    // Un cuadro: dt en segundos desde el anterior
    paso(objetivo, dt) {
      if (!iniciado) return this.salta(objetivo);
      if (!(dt > 0)) return x;
      const n = Math.ceil(dt / H), h = dt / n;
      for (let i = 0; i < n; i++) {
        v += (w * w * (objetivo - x) - 2 * z * w * v) * h;
        x += v * h;
      }
      quieto = Math.abs(objetivo - x) < QUIETO_X && Math.abs(v) < QUIETO_V;
      if (quieto) { x = objetivo; v = 0; }
      return x;
    },
    ajustar(p = {}) {
      if (Number.isFinite(p.w)) w = limitar(p.w, ...LIMITES.w);
      if (Number.isFinite(p.z)) z = limitar(p.z, ...LIMITES.z);
    },
  };
}
