// Lente en perspectiva (Charlie, laboratorio): lo que comparten la versión WebGL2 y la WebGPU.
//
// La malla de la portada vista de lado y en perspectiva: un plano de líneas que se hunde en un
// embudo cuando sube la masa, como la escena 0 de portada/curvatura.js. En el fondo del embudo está
// el agujero, visto con la misma cámara inclinada que la malla: cada píxel lanza un rayo desde la
// cámara y el agujero lo curva (la órbita de la luz alrededor de una masa de Schwarzschild). Así
// salen, sin pintarlos aparte:
//   - el disco caliente, que está en el plano del fondo del embudo y se ve como una elipse aplastada;
//     la parte de atrás del disco se curva por encima de la sombra (y otra copia por debajo), como en
//     Interstellar;
//   - la sombra, los rayos que caen dentro;
//   - el punto dorado, detrás del agujero: al alinearse se abre en el anillo de Einstein.
// La sombra y el anillo de fotones siguen siendo redondos desde cualquier ángulo (eso es física);
// lo que la cámara aplasta es el disco. El agujero va en la garganta del embudo: las líneas de la
// malla bajan hacia él y mueren en el borde de la sombra (las de detrás quedan tapadas por ella).
//
// La malla son líneas de verdad (tiras de triángulos que el vertex shader engorda en pantalla), no
// una rejilla pintada con fwidth(): así baja curvada y sin cortes por la pared empinada del embudo.
// Todo es función de t (la masa) y del reloj: nada de Math.random, Date.now ni estado entre cuadros.
// No cambia la portada, el motor ni las dos lentes: de la lente 2D solo se importa latido(), y las
// curvas de sus tramos (masa, sombra, alineación...) se copian aquí tal cual.

import { latido } from '../charlie-lente/lente.js';

export const tramo = [0, 1];
export const late = true;

export const GARGANTA = 1.0;  // anchura del embudo (la misma que en la portada)
export const PROF = 6.0;      // profundidad del embudo con la masa a 1
export const PERIODO = 1.5;   // segundos por latido (el de la portada y la lente: 40 por minuto)
const RADIO_LENTE = 1.6;      // «radio» de la lente 2D en el mundo: escala la posición del punto dorado
const RS = 0.3;               // radio de Schwarzschild con la masa a 1; la sombra se ve de 2,6 veces eso (0,78)
const DISCO = [3.0, 9.0];     // el disco, de 3 a 9 radios de Schwarzschild, en el plano del agujero
const DLS = 7;                // a qué distancia detrás del agujero está el punto dorado
const GIRO_ANILLO = 14;       // segundos por vuelta del lado brillante (el de la lente 2D)
const BC = 1.5 * Math.sqrt(3); // radio aparente de la sombra, en radios de Schwarzschild
const ELEV = 26;              // grados por encima del plano
const DIST = 22;              // distancia de la cámara en horizontal (en vertical, más)

// Niveles de detalle: cuántas líneas, cuántas muestras por línea y cuántos píxeles por punto.
// 2 = escritorio (la malla de la portada: 49 líneas por lado y 320 muestras), 1 = móvil, 0 = mínimo.
// Siempre por debajo de 65 536 vértices: índices de 16 bits, que valen en todas partes.
export const NIVELES = [
  { dpr: 1, L: 16, muestras: 96, pasos: 64 },
  { dpr: 1.5, L: 24, muestras: 192, pasos: 96 },
  { dpr: 2, L: 24, muestras: 320, pasos: 128 },
];

export const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const suave = (x) => { x = limitar(x, 0, 1); return x * x * (3 - 2 * x); };

// Tiras de la malla: por cada línea de la rejilla (x = n o y = n), `muestras` puntos con dos
// vértices (un lado y otro de la línea), más juntos cerca del embudo. Igual que en la portada.
export function construirMalla(nivel) {
  const { L, muestras } = NIVELES[nivel];
  const pos = (u) => L * Math.sign(u) * Math.abs(u) ** 1.6;
  const lineas = 2 * L + 1;
  const v = new Float32Array(2 * lineas * muestras * 2 * 4);
  let o = 0;
  for (let fam = 0; fam < 2; fam++) for (let n = -L; n <= L; n++) for (let j = 0; j < muestras; j++) {
    const m = pos(-1 + (2 * j) / (muestras - 1));
    const x = fam === 0 ? n : m, y = fam === 0 ? m : n;
    for (const lado of [-1, 1]) { v[o++] = x; v[o++] = y; v[o++] = fam; v[o++] = lado; }
  }
  const idx = new Uint16Array(2 * lineas * (muestras - 1) * 6);
  let k = 0;
  for (let ln = 0; ln < 2 * lineas; ln++) for (let j = 0; j < muestras - 1; j++) {
    const a = (ln * muestras + j) * 2, b = a + 1, c = a + 2, d = a + 3;
    idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;
  }
  return { v, idx, L };
}

// ---------- Cámara (las mismas cuentas que la portada) ----------
const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norma = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function mirar(ojo, obj, arriba) {
  const z = norma(resta(ojo, obj)), x = norma(cruz(arriba, z)), y = cruz(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -punto3(x, ojo), -punto3(y, ojo), -punto3(z, ojo), 1];
}
// desplY y desplX mueven el punto mirado a otro sitio de la pantalla (sin girar la cámara)
function perspectiva(fovy, aspecto, cerca, lejos, desplX, desplY) {
  const f = 1 / Math.tan(fovy / 2);
  return [f / aspecto, 0, 0, 0, 0, f, 0, 0, -desplX, -desplY, (lejos + cerca) / (cerca - lejos), -1, 0, 0, (2 * lejos * cerca) / (cerca - lejos), 0];
}
function por(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function ndc(m, x, y, z) {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [cx / cw, cy / cw];
}
function proyectar(m, x, y, z, ancho, alto) {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(cx / cw * 0.5 + 0.5) * ancho, (1 - (cy / cw * 0.5 + 0.5)) * alto];
}

// Todo lo que se pinta en un fotograma, a partir de t, el reloj, el tamaño y el nivel.
// Las curvas son las de la lente, salvo la hondura del embudo, que sigue hasta 1: a 0 la malla es plana; a 1, embudo hondo con sombra.
export function parametros(t, reloj, ctx, nivel, ancho, alto) {
  const mm = ctx.menosMovimiento;
  const rl = mm ? 0 : reloj;
  // Los tramos de la lente 2D (../charlie-lente/lente.js), copiados
  const masa = suave((t - 0.1) / 0.5);
  const sombra = suave((t - 0.4) / 0.35);
  const alinea = suave((t - 0.05) / 0.6);
  const retuerce = suave((t - 0.6) / 0.4);
  // La hondura del embudo sigue creciendo hasta t = 1 (masa satura en 0,6 y a partir de ahí solo
  // se veía el arrastre, que parece un giro de cámara)
  const hondo = suave((t - 0.1) / 0.9);
  const prof = PROF * hondo;

  // El agujero: se curva la luz con la masa; la sombra (radio aparente bc) va en la garganta del
  // embudo, a la altura a la que la malla tiene ese mismo radio. Así el borde de la sombra coincide
  // con el sitio donde las líneas de la malla dejan de bajar.
  const rs = RS * masa;
  const bc = BC * rs;
  const zB = -prof / Math.sqrt(1 + (bc * bc) / (GARGANTA * GARGANTA));

  // De lado y por encima del plano, mirando a media altura del embudo; luego la imagen se corre (sin
  // girar la cámara) para que el agujero caiga en el centro de la zona libre (ctx.centro()).
  // En vertical (móvil) la cámara se aleja para que el embudo llene el ancho, como en la portada.
  const aspecto = ancho / alto;
  const fovy = (40 * Math.PI) / 180;
  const elev = (ELEV * Math.PI) / 180;
  const dist = aspecto < 1 ? DIST * 1.1 * Math.sqrt(0.462 / Math.max(0.4, aspecto)) : DIST;
  // La cámara no sigue al embudo: mira siempre al mismo sitio y el encuadre se calcula con el
  // agujero a fondo (t = 1), así que al subir la masa el embudo se hunde de verdad en la pantalla
  const zFin = -PROF / Math.sqrt(1 + (BC * RS) ** 2 / (GARGANTA * GARGANTA));
  const obj = [0, 0, -PROF * 0.5];
  const ojo = [0, -dist * Math.cos(elev), obj[2] + dist * Math.sin(elev)];
  const vista = mirar(ojo, obj, [0, 0, 1]);
  const [nx, ny] = ndc(por(perspectiva(fovy, aspecto, 0.1, 200, 0, 0), vista), 0, 0, zFin);
  const c = ctx.centro();
  const dx = (2 * c.x) / ancho - 1 - nx, dy = 1 - (2 * c.y) / alto - ny;
  const vp = por(perspectiva(fovy, aspecto, 0.1, 200, dx, dy), vista);

  // La cámara para los rayos de la lente: sus ejes (filas de la vista), f = 1/tan(fov/2) y el corrimiento
  const camX = [vista[0], vista[4], vista[8]], camY = [vista[1], vista[5], vista[9]], camZ = [vista[2], vista[6], vista[10]];
  const f = 1 / Math.tan(fovy / 2);
  const ojoB = [ojo[0], ojo[1], ojo[2] - zB];          // la cámara vista desde el agujero
  const D = Math.hypot(ojoB[0], ojoB[1], ojoB[2]);
  // El punto dorado, detrás del agujero en el plano de la fuente: desalineado como en la lente 2D
  // (0,85 y 0,4 radios a la derecha y arriba) y en su sitio cuando alinea llega a 1
  const k = (D + DLS) / D;
  const ox = (1 - alinea) * RADIO_LENTE * 0.85 * k, oy = (1 - alinea) * RADIO_LENTE * 0.4 * k;
  const fuente = [0, 1, 2].map((i) => -camZ[i] * DLS + camX[i] * ox + camY[i] * oy);

  return {
    vp, prof,
    // Arrastre: al final la malla se retuerce alrededor del agujero (más cerca, más giro)
    giro: 1.1 * retuerce,
    // Cada latido manda una onda por la malla desde el fondo; solo con sombra y sin «menos movimiento»
    fase: rl % PERIODO,
    onda: mm ? 0 : 0.8 * sombra,
    latido: mm ? 0 : latido(rl) * sombra,
    // Calor de las líneas cerca del fondo: sube con la masa
    calor: 0.35 + 0.65 * masa,
    ojo, zB, bc, sombra,
    lente: {
      fx: aspecto / f, fy: 1 / f, dx, dy, rs,
      // Sin sombra, la masa es blanda (no atrapa luz): curva la luz pero deja pasar el centro
      blando: rs * 2.5 * (1 - sombra),
      camX, camY, camZ, ojoB,
      ring: sombra,
      ringPh: -0.6 + (rl / GIRO_ANILLO) * Math.PI * 2,
      heat: 0.8 * suave((t - 0.55) / 0.45),
      kick: mm ? 0 : 0.25 * latido(rl) * sombra,
      time: rl,
      swirl: 0.55 * retuerce,
      pasos: NIVELES[nivel].pasos,
      disco: [DISCO[0] * rs, DISCO[1] * rs],
      dls: DLS,
      fuente, fuenteR: 0.11 * k,
    },
  };
}

// ---------- Shaders ----------
// Malla: la de la portada (VS_MALLA y FS_MALLA de portada/curvatura.js) en GLSL ES 3.0 y en WGSL.
// La onda usa x*x en vez de pow(x, 2.0): pow con base negativa no está definido ni en GLSL ni en WGSL.
const G2 = (GARGANTA * GARGANTA).toFixed(3);
const P = PERIODO.toFixed(2);

export const GLSL_VS_MALLA = `#version 300 es
in vec2 aP;
in vec2 aInfo;   // x: familia (0 = x fija, 1 = y fija), y: lado de la tira (-1 o 1)
uniform mat4 uVP;
uniform vec2 uRes;      // media anchura y media altura del lienzo, en píxeles
uniform float uProf, uGiro, uFase, uOnda, uMedio;
uniform vec4 uOjoB;     // xyz: la cámara (mundo); w: altura del centro del agujero
uniform vec4 uHueco;    // x: radio aparente de la sombra; y: radio del hueco en la malla; z: sombra (0 a 1)
out float vR;
out float vVis;
out float vOnda;
out float vLado;
float pozo(float r) { return -uProf / sqrt(1.0 + r * r / ${G2}); }
float ondaEn(float r0) {
  float o = 0.0;
  for (int k = 0; k < 3; k++) {
    float edad = uFase + float(k) * ${P};
    float x = (r0 - (1.1 + edad * 4.2)) / 0.65;
    o += exp(-x * x) * exp(-edad * 0.75);
  }
  return o * uOnda / (1.0 + 0.06 * r0);
}
vec3 enMundo(vec2 p) {
  float r0 = length(p);
  float a = uGiro / (1.0 + r0 * 0.55);
  float c = cos(a), s = sin(a);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  return vec3(q, pozo(r0) + ondaEn(r0) * 0.45);
}
vec4 mundo(vec2 p) { return uVP * vec4(enMundo(p), 1.0); }
// 1 si el punto se ve; 0 si la sombra lo tapa (está detrás del agujero y su rayo pasa por dentro
// del radio aparente) o si cae dentro del agujero (la garganta del embudo, más cerca que ese radio)
float visible(vec3 w, float r0) {
  vec3 d = w - uOjoB.xyz;
  float ld = length(d);
  vec3 dh = d / ld;
  vec3 eb = vec3(0.0, 0.0, uOjoB.w) - uOjoB.xyz;
  float tc = dot(eb, dh);
  float imp = length(eb - dh * tc);
  float tapa = smoothstep(tc - 0.2, tc + 0.2, ld) * (1.0 - smoothstep(uHueco.x * 0.96, uHueco.x * 1.04 + 1e-4, imp));
  float dentro = 1.0 - smoothstep(uHueco.y * 0.9, uHueco.y * 1.02 + 1e-4, r0);
  return 1.0 - uHueco.z * max(tapa, dentro);
}
void main() {
  vec2 tg = aInfo.x < 0.5 ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
  vec3 w0 = enMundo(aP);
  vec4 c0 = uVP * vec4(w0, 1.0);
  vec4 c1 = mundo(aP + tg * 0.02);
  vec2 s0 = c0.xy / c0.w * uRes, s1 = c1.xy / c1.w * uRes;
  vec2 d = s1 - s0;
  d = length(d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  c0.xy += n * aInfo.y * uMedio / uRes * c0.w;
  vR = length(aP);
  vOnda = ondaEn(vR);
  vLado = aInfo.y;
  vVis = visible(w0, vR);
  gl_Position = c0;
}`;

export const GLSL_FS_MALLA = `#version 300 es
precision highp float;
in float vR;
in float vOnda;
in float vLado;
in float vVis;
uniform float uLatido, uAltoPx, uMedio, uL, uCalor;
out vec4 color;
void main() {
  float l = clamp((1.0 - abs(vLado)) * uMedio, 0.0, 1.0);
  float cerca = exp(-vR / 1.4) * uCalor;
  float luz = 0.55 + 0.75 * cerca * (0.75 + 0.4 * uLatido) + vOnda * 0.8;
  luz *= smoothstep(uL * 0.98, uL * 0.6, vR);
  float y = gl_FragCoord.y / uAltoPx;
  luz *= mix(0.5, 1.0, smoothstep(0.0, 0.3, y));
  vec3 frio = vec3(0.70, 0.73, 0.80);
  vec3 calido = vec3(1.0, 0.86, 0.66);
  vec3 col = mix(frio, calido, clamp(cerca * 1.3 + vOnda * 0.5, 0.0, 1.0));
  float a = clamp(0.62 * l * luz, 0.0, 1.0) * vVis;
  color = vec4(col * a, a);
}`;

// La lente con la misma cámara que la malla. Cada píxel lanza un rayo desde la cámara; si pasa cerca del
// agujero, se sigue paso a paso con la curvatura de Schwarzschild escrita como fuerza:
// a = -1,5 · rs · h² · p / |p|⁵ (h, el momento angular del rayo), que da las órbitas de la luz exactas.
// Al cruzar el plano del agujero dentro del disco, suma el disco; si cae dentro, es sombra; al salir,
// mira si llega al punto dorado del plano de la fuente. Sin sombra (al principio), la masa es blanda.
// Todo en coordenadas con el agujero en el origen. Esta pasada va antes que la malla, sobre negro, y la
// malla se suma encima salvo donde la tapa la sombra (eso lo decide la propia malla, en visible()).
// Uniformes (uL[0..8]):
//   0: ancho y alto del lienzo en px, fx = aspecto/f, fy = 1/f      1: corrimiento x e y, rs, blando
//   2: eje x de la cámara, sombra   3: eje y, bruma   4: eje z, ángulo del lado brillante
//   5: cámara (desde el agujero), latido   6: reloj, arrastre, pasos, distancia a la fuente
//   7: radio interior y exterior del disco, radio del punto dorado   8: punto dorado (desde el agujero)
const PASOS_MAX = 128;
export const GLSL_VS_LENTE = `#version 300 es
in vec2 aP;
void main() { gl_Position = vec4(aP, 0.0, 1.0); }`;

export const GLSL_FS_LENTE = `#version 300 es
precision highp float;
uniform vec4 uL[9];
out vec4 color;
const vec3 ORO = vec3(0.95, 0.74, 0.36);
const vec3 BRASA = vec3(1.0, 0.46, 0.16);
const vec3 SANGRE = vec3(0.55, 0.08, 0.05);
const vec3 BLANCO = vec3(1.9, 1.45, 1.05);

// El disco en el punto q (en su plano): color ya multiplicado y opacidad
vec4 disco(vec3 q) {
  float din = uL[7].x;
  float dout = uL[7].y;
  float rq = length(q.xy);
  float x = (rq - din) / (dout - din);
  if (x < -0.06 || x > 1.0) return vec4(0.0);
  float perfil = smoothstep(-0.06, 0.05, x) * smoothstep(1.0, 0.55, x) * exp(-2.6 * max(x, 0.0));
  float ang = atan(q.y, q.x) + uL[6].y * din / max(rq, 1e-3);
  float dop = 0.55 + 0.45 * cos(ang - uL[4].w);
  float vetas = 0.84 + 0.16 * sin(rq / din * 19.0 - ang * 2.0 + uL[6].x * 1.3);
  vec3 c = mix(BLANCO, BRASA, smoothstep(0.0, 0.5, x));
  c = mix(c, SANGRE * 1.6, smoothstep(0.5, 1.0, x));
  float k = uL[2].w * (1.0 + 0.5 * uL[5].w);
  return vec4(c * (perfil * vetas * (0.3 + 1.1 * dop) * k), clamp(perfil * 1.4, 0.0, 0.9) * uL[2].w);
}

void main() {
  vec2 nd = gl_FragCoord.xy / uL[0].xy * 2.0 - 1.0;
  vec3 rd = normalize(uL[2].xyz * ((nd.x - uL[1].x) * uL[0].z) + uL[3].xyz * ((nd.y - uL[1].y) * uL[0].w) - uL[4].xyz);
  vec3 ro = uL[5].xyz;
  float rs = uL[1].z;
  float sombra = uL[2].w;
  float rm = uL[7].y + 2.5;
  float tca = -dot(ro, rd);
  vec3 pc = ro + rd * tca;
  float b = length(pc);
  vec3 col = vec3(0.0);
  float a = 0.0;
  float dentro = 0.0;
  vec3 p = ro;
  vec3 v = rd;
  if (b < rm && rs > 1e-4) {
    p = ro + rd * (tca - sqrt(rm * rm - b * b));
    vec3 hv = cross(p, v);
    float kh = -1.5 * rs * dot(hv, hv);
    float e2 = uL[1].w * uL[1].w;
    float rcap = rs * sombra;
    for (int i = 0; i < ${PASOS_MAX}; i++) {
      if (float(i) >= uL[6].z) break;
      float r2 = dot(p, p);
      float r = sqrt(r2);
      float dt = clamp(0.08 * (r - 0.8 * rcap), 0.01, 0.5);
      float s = r2 + e2;
      vec3 vn = normalize(v + p * (kh / (s * s * sqrt(s)) * dt));
      vec3 pn = p + vn * dt;
      if (p.z * pn.z <= 0.0 && p.z != pn.z) {
        vec4 e = disco(mix(p, pn, p.z / (p.z - pn.z)));
        col += (1.0 - a) * e.rgb;
        a += (1.0 - a) * e.a;
      }
      p = pn;
      v = vn;
      if (dot(p, p) < rcap * rcap) { dentro = 1.0; break; }
      if (dot(p, p) > rm * rm && dot(p, v) > 0.0) break;
    }
  }
  // El punto dorado: donde el rayo, ya recto, corta el plano de la fuente
  if (dentro < 0.5) {
    vec3 fw = -uL[4].xyz;
    float vf = dot(v, fw);
    if (vf > 0.05) {
      vec3 q = p + v * (dot(fw * uL[6].w - p, fw) / vf);
      vec3 fs = q - uL[8].xyz;
      float f2 = dot(fs, fs) / (uL[7].z * uL[7].z);
      col += (1.0 - a) * ORO * (0.9 * exp(-f2) + 0.9 * exp(-f2 * 9.0)) * (1.0 + 0.35 * uL[5].w);
    }
  }
  // El anillo de fotones (fino, en el borde de la sombra) y la bruma cálida pegada a ella
  float bc = 2.598 * rs;
  if (bc > 1e-4) {
    float angp = atan(dot(pc, uL[3].xyz), dot(pc, uL[2].xyz));
    float dop = 0.55 + 0.45 * cos(angp - uL[4].w);
    float x = (b - bc) / (bc * 0.03);
    float nucleo = exp(-x * x * 0.5);
    float hz = uL[3].w * smoothstep(bc * 0.97, bc * 1.03, b) * exp(-(b - bc) / (bc * 0.9))
             * (0.7 + 0.3 * sin(angp * 3.0 - uL[6].x * 2.0));
    col += (1.0 - a) * (BLANCO * nucleo * (0.35 + 0.6 * dop) * sombra * (1.0 + 0.5 * uL[5].w)
                        + (SANGRE * 0.35 + ORO * 0.05) * hz);
  }
  col = 1.0 - exp(-col * 1.15);
  color = vec4(col, 1.0);
}`;

// Las mismas dos pasadas en WGSL, en dos módulos. Dos diferencias de plataforma, nada más: en WebGPU la
// profundidad del recorte va de 0 a 1 (en WebGL de -1 a 1), y la y del píxel cuenta desde arriba.
export const WGSL_MALLA = /* wgsl */ `
struct UM {
  vp: mat4x4f,
  res: vec2f, prof: f32, giro: f32,
  fase: f32, onda: f32, medio: f32, latido: f32,
  altoPx: f32, L: f32, calor: f32, _r: f32,
  ojoB: vec4f,
  hueco: vec4f,
};
@group(0) @binding(0) var<uniform> um: UM;

struct SalMalla {
  @builtin(position) pos: vec4f,
  @location(0) vR: f32,
  @location(1) vOnda: f32,
  @location(2) vLado: f32,
  @location(3) vVis: f32,
};

fn pozo(r: f32) -> f32 { return -um.prof / sqrt(1.0 + r * r / ${G2}); }
fn ondaEn(r0: f32) -> f32 {
  var o = 0.0;
  for (var k = 0; k < 3; k++) {
    let edad = um.fase + f32(k) * ${P};
    let x = (r0 - (1.1 + edad * 4.2)) / 0.65;
    o += exp(-x * x) * exp(-edad * 0.75);
  }
  return o * um.onda / (1.0 + 0.06 * r0);
}
fn enMundo(p: vec2f) -> vec3f {
  let r0 = length(p);
  let a = um.giro / (1.0 + r0 * 0.55);
  let c = cos(a);
  let s = sin(a);
  let q = vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
  return vec3f(q, pozo(r0) + ondaEn(r0) * 0.45);
}
fn mundo(p: vec2f) -> vec4f { return um.vp * vec4f(enMundo(p), 1.0); }
fn visible(w: vec3f, r0: f32) -> f32 {
  let d = w - um.ojoB.xyz;
  let ld = length(d);
  let dh = d / ld;
  let eb = vec3f(0.0, 0.0, um.ojoB.w) - um.ojoB.xyz;
  let tc = dot(eb, dh);
  let imp = length(eb - dh * tc);
  let tapa = smoothstep(tc - 0.2, tc + 0.2, ld) * (1.0 - smoothstep(um.hueco.x * 0.96, um.hueco.x * 1.04 + 1e-4, imp));
  let dentro = 1.0 - smoothstep(um.hueco.y * 0.9, um.hueco.y * 1.02 + 1e-4, r0);
  return 1.0 - um.hueco.z * max(tapa, dentro);
}

@vertex fn vsMalla(@location(0) aP: vec2f, @location(1) aInfo: vec2f) -> SalMalla {
  let tg = select(vec2f(1.0, 0.0), vec2f(0.0, 1.0), aInfo.x < 0.5);
  let w0 = enMundo(aP);
  var c0 = um.vp * vec4f(w0, 1.0);
  let c1 = mundo(aP + tg * 0.02);
  let s0 = c0.xy / c0.w * um.res;
  let s1 = c1.xy / c1.w * um.res;
  var d = s1 - s0;
  d = select(vec2f(1.0, 0.0), normalize(d), length(d) > 1e-6);
  let n = vec2f(-d.y, d.x);
  let xy = c0.xy + n * aInfo.y * um.medio / um.res * c0.w;
  var o: SalMalla;
  o.pos = vec4f(xy, 0.5 * (c0.z + c0.w), c0.w);
  o.vR = length(aP);
  o.vOnda = ondaEn(o.vR);
  o.vLado = aInfo.y;
  o.vVis = visible(w0, o.vR);
  return o;
}

@fragment fn fsMalla(i: SalMalla) -> @location(0) vec4f {
  let l = clamp((1.0 - abs(i.vLado)) * um.medio, 0.0, 1.0);
  let cerca = exp(-i.vR / 1.4) * um.calor;
  var luz = 0.55 + 0.75 * cerca * (0.75 + 0.4 * um.latido) + i.vOnda * 0.8;
  luz *= smoothstep(um.L * 0.98, um.L * 0.6, i.vR);
  let y = (um.altoPx - i.pos.y) / um.altoPx;
  luz *= mix(0.5, 1.0, smoothstep(0.0, 0.3, y));
  let frio = vec3f(0.70, 0.73, 0.80);
  let calido = vec3f(1.0, 0.86, 0.66);
  let col = mix(frio, calido, clamp(cerca * 1.3 + i.vOnda * 0.5, 0.0, 1.0));
  let a = clamp(0.62 * l * luz, 0.0, 1.0) * i.vVis;
  return vec4f(col * a, a);
}
`;

export const WGSL_LENTE = /* wgsl */ `
@group(0) @binding(0) var<uniform> uL: array<vec4f, 9>;
const ORO = vec3f(0.95, 0.74, 0.36);
const BRASA = vec3f(1.0, 0.46, 0.16);
const SANGRE = vec3f(0.55, 0.08, 0.05);
const BLANCO = vec3f(1.9, 1.45, 1.05);

@vertex fn vsLente(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn disco(q: vec3f) -> vec4f {
  let din = uL[7].x;
  let dout = uL[7].y;
  let rq = length(q.xy);
  let x = (rq - din) / (dout - din);
  if (x < -0.06 || x > 1.0) { return vec4f(0.0); }
  let perfil = smoothstep(-0.06, 0.05, x) * smoothstep(1.0, 0.55, x) * exp(-2.6 * max(x, 0.0));
  let ang = atan2(q.y, q.x) + uL[6].y * din / max(rq, 1e-3);
  let dop = 0.55 + 0.45 * cos(ang - uL[4].w);
  let vetas = 0.84 + 0.16 * sin(rq / din * 19.0 - ang * 2.0 + uL[6].x * 1.3);
  var c = mix(BLANCO, BRASA, smoothstep(0.0, 0.5, x));
  c = mix(c, SANGRE * 1.6, smoothstep(0.5, 1.0, x));
  let k = uL[2].w * (1.0 + 0.5 * uL[5].w);
  return vec4f(c * (perfil * vetas * (0.3 + 1.1 * dop) * k), clamp(perfil * 1.4, 0.0, 0.9) * uL[2].w);
}

@fragment fn fsLente(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let nd = vec2f(fc.x / uL[0].x * 2.0 - 1.0, 1.0 - fc.y / uL[0].y * 2.0);
  let rd = normalize(uL[2].xyz * ((nd.x - uL[1].x) * uL[0].z) + uL[3].xyz * ((nd.y - uL[1].y) * uL[0].w) - uL[4].xyz);
  let ro = uL[5].xyz;
  let rs = uL[1].z;
  let sombra = uL[2].w;
  let rm = uL[7].y + 2.5;
  let tca = -dot(ro, rd);
  let pc = ro + rd * tca;
  let b = length(pc);
  var col = vec3f(0.0);
  var a = 0.0;
  var dentro = 0.0;
  var p = ro;
  var v = rd;
  if (b < rm && rs > 1e-4) {
    p = ro + rd * (tca - sqrt(rm * rm - b * b));
    let hv = cross(p, v);
    let kh = -1.5 * rs * dot(hv, hv);
    let e2 = uL[1].w * uL[1].w;
    let rcap = rs * sombra;
    for (var i = 0; i < ${PASOS_MAX}; i++) {
      if (f32(i) >= uL[6].z) { break; }
      let r2 = dot(p, p);
      let r = sqrt(r2);
      let dt = clamp(0.08 * (r - 0.8 * rcap), 0.01, 0.5);
      let s = r2 + e2;
      let vn = normalize(v + p * (kh / (s * s * sqrt(s)) * dt));
      let pn = p + vn * dt;
      if (p.z * pn.z <= 0.0 && p.z != pn.z) {
        let e = disco(mix(p, pn, p.z / (p.z - pn.z)));
        col += (1.0 - a) * e.rgb;
        a += (1.0 - a) * e.a;
      }
      p = pn;
      v = vn;
      if (dot(p, p) < rcap * rcap) { dentro = 1.0; break; }
      if (dot(p, p) > rm * rm && dot(p, v) > 0.0) { break; }
    }
  }
  if (dentro < 0.5) {
    let fw = -uL[4].xyz;
    let vf = dot(v, fw);
    if (vf > 0.05) {
      let q = p + v * (dot(fw * uL[6].w - p, fw) / vf);
      let fs = q - uL[8].xyz;
      let f2 = dot(fs, fs) / (uL[7].z * uL[7].z);
      col += (1.0 - a) * ORO * (0.9 * exp(-f2) + 0.9 * exp(-f2 * 9.0)) * (1.0 + 0.35 * uL[5].w);
    }
  }
  let bc = 2.598 * rs;
  if (bc > 1e-4) {
    let angp = atan2(dot(pc, uL[3].xyz), dot(pc, uL[2].xyz));
    let dop = 0.55 + 0.45 * cos(angp - uL[4].w);
    let x = (b - bc) / (bc * 0.03);
    let nucleo = exp(-x * x * 0.5);
    let hz = uL[3].w * smoothstep(bc * 0.97, bc * 1.03, b) * exp(-(b - bc) / (bc * 0.9))
           * (0.7 + 0.3 * sin(angp * 3.0 - uL[6].x * 2.0));
    col += (1.0 - a) * (BLANCO * nucleo * (0.35 + 0.6 * dop) * sombra * (1.0 + 0.5 * uL[5].w)
                        + (SANGRE * 0.35 + ORO * 0.05) * hz);
  }
  col = 1.0 - exp(-col * 1.15);
  return vec4f(col, 1.0);
}
`;

// Los uniformes de las dos pasadas, empaquetados igual para las dos versiones
export function datosMalla(F, lienzo, dpr, L, datos = new Float32Array(36)) {
  datos.set(F.vp, 0);
  datos[16] = lienzo.width / 2; datos[17] = lienzo.height / 2; datos[18] = F.prof; datos[19] = F.giro;
  datos[20] = F.fase; datos[21] = F.onda; datos[22] = 0.65 * dpr + 0.75; datos[23] = F.latido;
  datos[24] = lienzo.height; datos[25] = L; datos[26] = F.calor; datos[27] = 0;
  datos[28] = F.ojo[0]; datos[29] = F.ojo[1]; datos[30] = F.ojo[2]; datos[31] = F.zB;
  datos[32] = F.bc; datos[33] = F.bc; datos[34] = F.sombra; datos[35] = 0;
  return datos;
}
export function datosLente(F, lienzo, datos = new Float32Array(36)) {
  const P = F.lente;
  datos.set([lienzo.width, lienzo.height, P.fx, P.fy], 0);
  datos.set([P.dx, P.dy, P.rs, P.blando], 4);
  datos.set([...P.camX, P.ring], 8);
  datos.set([...P.camY, P.heat], 12);
  datos.set([...P.camZ, P.ringPh], 16);
  datos.set([...P.ojoB, P.kick], 20);
  datos.set([P.time, P.swirl, P.pasos, P.dls], 24);
  datos.set([P.disco[0], P.disco[1], P.fuenteR, 0], 28);
  datos.set([...P.fuente, 0], 32);
  return datos;
}
