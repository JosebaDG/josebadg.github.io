// Lente en perspectiva (Charlie, laboratorio): lo que comparten la versión WebGL2 y la WebGPU.
//
// La malla de la portada vista de lado y en perspectiva: un plano de líneas que se hunde en un
// embudo cuando sube la masa, como la escena 0 de portada/curvatura.js. En el fondo del embudo va
// la lente que ya teníamos (../charlie-lente/lente.js): el punto dorado que se abre en anillo de
// Einstein, la sombra y el anillo de fotones. Los números de la lente salen de su misma función
// parametros(); aquí solo se le dice dónde cae en pantalla el fondo del embudo y qué tamaño tiene.
//
// La malla son líneas de verdad (tiras de triángulos que el vertex shader engorda en pantalla), no
// una rejilla pintada con fwidth(): así baja curvada y sin cortes por la pared empinada del embudo.
// Todo es función de t (la masa) y del reloj: nada de Math.random, Date.now ni estado entre cuadros.
// No cambia la portada, el motor ni las dos lentes: de ellas solo se importa sin tocarlas.

import { parametros as parametrosLente, latido } from '../charlie-lente/lente.js';

export const tramo = [0, 1];
export const late = true;

export const GARGANTA = 1.0;  // anchura del embudo (la misma que en la portada)
export const PROF = 6.0;      // profundidad del embudo con la masa a 1
export const PERIODO = 1.5;   // segundos por latido (el de la portada y la lente: 40 por minuto)
const RADIO_LENTE = 1.6;      // radio en el mundo, en el fondo del embudo, que hace de «radio» de la lente
const ELEV = 26;              // grados por encima del plano
const DIST = 22;              // distancia de la cámara en horizontal (en vertical, más)

// Niveles de detalle: cuántas líneas, cuántas muestras por línea y cuántos píxeles por punto.
// 2 = escritorio (la malla de la portada: 49 líneas por lado y 320 muestras), 1 = móvil, 0 = mínimo.
// Siempre por debajo de 65 536 vértices: índices de 16 bits, que valen en todas partes.
export const NIVELES = [
  { dpr: 1, L: 16, muestras: 96 },
  { dpr: 1.5, L: 24, muestras: 192 },
  { dpr: 2, L: 24, muestras: 320 },
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
// La masa es la misma curva que en la lente: a 0 la malla es plana; a 1, embudo hondo con sombra.
export function parametros(t, reloj, ctx, nivel, ancho, alto) {
  const mm = ctx.menosMovimiento;
  const rl = mm ? 0 : reloj;
  const masa = suave((t - 0.1) / 0.5);
  const sombra = suave((t - 0.4) / 0.35);
  const retuerce = suave((t - 0.6) / 0.4);
  const prof = PROF * masa;

  // De lado y por encima del plano, mirando a media altura del embudo; luego la imagen se corre (sin
  // girar la cámara) para que el fondo del embudo caiga en el centro de la zona libre (ctx.centro()).
  // En vertical (móvil) la cámara se aleja para que el embudo llene el ancho, como en la portada.
  const aspecto = ancho / alto;
  const fovy = (40 * Math.PI) / 180;
  const elev = (ELEV * Math.PI) / 180;
  const dist = aspecto < 1 ? DIST * 1.1 * Math.sqrt(0.462 / Math.max(0.4, aspecto)) : DIST;
  const obj = [0, 0, -prof * 0.5];
  const ojo = [0, -dist * Math.cos(elev), obj[2] + dist * Math.sin(elev)];
  const vista = mirar(ojo, obj, [0, 0, 1]);
  const [nx, ny] = ndc(por(perspectiva(fovy, aspecto, 0.1, 200, 0, 0), vista), 0, 0, -prof);
  const c = ctx.centro();
  const vp = por(perspectiva(fovy, aspecto, 0.1, 200, (2 * c.x) / ancho - 1 - nx, 1 - (2 * c.y) / alto - ny), vista);

  // La lente, en el fondo del embudo: su centro y su radio en pantalla salen de proyectar el fondo
  const [px, py] = proyectar(vp, 0, 0, -prof, ancho, alto);
  const [qx] = proyectar(vp, RADIO_LENTE, 0, -prof, ancho, alto);
  const R = Math.max(8, Math.abs(qx - px));
  const lente = parametrosLente(t, reloj, { menosMovimiento: mm, centro: () => ({ x: px, y: py }), radio: () => R }, 1);

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
    lente,
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
out float vR;
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
vec4 mundo(vec2 p) {
  float r0 = length(p);
  float a = uGiro / (1.0 + r0 * 0.55);
  float c = cos(a), s = sin(a);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  return uVP * vec4(q, pozo(r0) + ondaEn(r0) * 0.45, 1.0);
}
void main() {
  vec2 tg = aInfo.x < 0.5 ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
  vec4 c0 = mundo(aP);
  vec4 c1 = mundo(aP + tg * 0.02);
  vec2 s0 = c0.xy / c0.w * uRes, s1 = c1.xy / c1.w * uRes;
  vec2 d = s1 - s0;
  d = length(d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  c0.xy += n * aInfo.y * uMedio / uRes * c0.w;
  vR = length(aP);
  vOnda = ondaEn(vR);
  vLado = aInfo.y;
  gl_Position = c0;
}`;

export const GLSL_FS_MALLA = `#version 300 es
precision highp float;
in float vR;
in float vOnda;
in float vLado;
uniform float uLatido, uAltoPx, uMedio, uL, uCalor;
out vec4 color;
void main() {
  float l = clamp((1.0 - abs(vLado)) * uMedio, 0.0, 1.0);
  float cerca = exp(-vR / 1.4) * uCalor;
  float luz = 0.55 + 0.75 * cerca * (0.75 + 0.4 * uLatido) + vOnda * 0.8;
  luz *= smoothstep(uL * 0.98, uL * 0.42, vR);
  float y = gl_FragCoord.y / uAltoPx;
  luz *= mix(0.32, 1.0, smoothstep(0.06, 0.42, y));
  vec3 frio = vec3(0.70, 0.73, 0.80);
  vec3 calido = vec3(1.0, 0.86, 0.66);
  vec3 col = mix(frio, calido, clamp(cerca * 1.3 + vOnda * 0.5, 0.0, 1.0));
  float a = clamp(0.62 * l * luz, 0.0, 1.0);
  color = vec4(col * a, a);
}`;

export const GLSL_VS_LENTE = `#version 300 es
in vec2 aP;
void main() { gl_Position = vec4(aP, 0.0, 1.0); }`;

// La lente sin rejilla ni estrellas (eso ya lo pone la malla): el punto dorado, la bruma, la sombra
// y el anillo de fotones de ../charlie-lente/lente.js, con las mismas cuentas. Sale con alfa
// premultiplicado: la sombra tapa la malla y fuera de la lente la malla se ve tal cual.
export const GLSL_FS_LENTE = `#version 300 es
precision highp float;
uniform vec4 uA;  // ancho, alto (px CSS), centro x, centro y (px CSS, y hacia abajo)
uniform vec4 uB;  // px del lienzo por px CSS, radio de Einstein, radio de la sombra, giro del arrastre
uniform vec4 uC;  // anillo, lado brillante, bruma, latido
uniform vec4 uD;  // reloj, punto dorado: desplazamiento x, y y radio (px)
out vec4 color;
const vec3 ORO = vec3(0.95, 0.74, 0.36);
const vec3 BRASA = vec3(1.0, 0.46, 0.16);
const vec3 SANGRE = vec3(0.55, 0.08, 0.05);
void main() {
  vec2 p = vec2(gl_FragCoord.x, uA.y * uB.x - gl_FragCoord.y) / uB.x;
  vec2 d = p - uA.zw;
  float r = length(d);
  float thE = uB.y, rs = uB.z;
  float k = thE * thE / max(r * r, 1e-2);
  vec2 s = d * (1.0 - k);
  float sw = uB.w * min(k, 6.0);
  s = mat2(cos(sw), sin(sw), -sin(sw), cos(sw)) * s;
  vec3 col = vec3(0.0);
  vec2 fs = s - uD.yz;
  float f2 = dot(fs, fs) / (uD.w * uD.w);
  col += ORO * (0.9 * exp(-f2) + 0.9 * exp(-f2 * 9.0)) * (1.0 + 0.35 * uC.w);
  float hz = uC.z * exp(-max(r - rs, 0.0) / (rs * 0.9 + 1.0)) * (0.7 + 0.3 * sin(atan(d.y, d.x) * 3.0 - uD.x * 2.0));
  col += SANGRE * 0.35 * hz + ORO * 0.05 * hz;
  float tapa = 0.0;
  if (rs > 0.0) {
    float fuera = smoothstep(rs - 1.2, rs + 1.2, r);
    col *= fuera;
    tapa = 1.0 - fuera;
    float dop = 0.55 + 0.45 * cos(atan(d.y, d.x) - uC.y);
    float x = r - rs;
    float nucleo = exp(-x * x / (2.0 * 1.3 * 1.3)) * step(-2.5, x);
    float brillo = exp(-max(x, 0.0) / (5.0 + rs * 0.05)) * smoothstep(-2.0, 0.5, x);
    float ancho = exp(-max(x, 0.0) / (rs * 0.35 + 8.0)) * smoothstep(-2.0, 2.0, x);
    float x2 = r - rs * 1.045;
    float segundo = exp(-x2 * x2 / 1.2);
    vec3 anillo = vec3(1.9, 1.45, 1.05) * nucleo * (0.45 + 0.8 * dop)
                + BRASA * 0.95 * brillo * (0.35 + dop)
                + ORO * 0.3 * ancho * (0.4 + dop)
                + vec3(1.2, 0.7, 0.4) * segundo * 0.5 * dop;
    col += anillo * uC.x * (1.0 + 0.5 * uC.w);
  }
  col = 1.0 - exp(-col * 1.15);
  float a = max(tapa, max(col.r, max(col.g, col.b)));
  color = vec4(col, a);
}`;

// Las mismas dos pasadas en WGSL, en dos módulos. Dos diferencias de plataforma, nada más: en WebGPU la
// profundidad del recorte va de 0 a 1 (en WebGL de -1 a 1), y la y del píxel cuenta desde arriba.
export const WGSL_MALLA = /* wgsl */ `
struct UM {
  vp: mat4x4f,
  res: vec2f, prof: f32, giro: f32,
  fase: f32, onda: f32, medio: f32, latido: f32,
  altoPx: f32, L: f32, calor: f32, _r: f32,
};
@group(0) @binding(0) var<uniform> um: UM;

struct SalMalla {
  @builtin(position) pos: vec4f,
  @location(0) vR: f32,
  @location(1) vOnda: f32,
  @location(2) vLado: f32,
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
fn mundo(p: vec2f) -> vec4f {
  let r0 = length(p);
  let a = um.giro / (1.0 + r0 * 0.55);
  let c = cos(a);
  let s = sin(a);
  let q = vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
  return um.vp * vec4f(q, pozo(r0) + ondaEn(r0) * 0.45, 1.0);
}

@vertex fn vsMalla(@location(0) aP: vec2f, @location(1) aInfo: vec2f) -> SalMalla {
  let tg = select(vec2f(1.0, 0.0), vec2f(0.0, 1.0), aInfo.x < 0.5);
  var c0 = mundo(aP);
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
  return o;
}

@fragment fn fsMalla(i: SalMalla) -> @location(0) vec4f {
  let l = clamp((1.0 - abs(i.vLado)) * um.medio, 0.0, 1.0);
  let cerca = exp(-i.vR / 1.4) * um.calor;
  var luz = 0.55 + 0.75 * cerca * (0.75 + 0.4 * um.latido) + i.vOnda * 0.8;
  luz *= smoothstep(um.L * 0.98, um.L * 0.42, i.vR);
  let y = (um.altoPx - i.pos.y) / um.altoPx;
  luz *= mix(0.32, 1.0, smoothstep(0.06, 0.42, y));
  let frio = vec3f(0.70, 0.73, 0.80);
  let calido = vec3f(1.0, 0.86, 0.66);
  let col = mix(frio, calido, clamp(cerca * 1.3 + i.vOnda * 0.5, 0.0, 1.0));
  let a = clamp(0.62 * l * luz, 0.0, 1.0);
  return vec4f(col * a, a);
}
`;

export const WGSL_LENTE = /* wgsl */ `
struct UL { a: vec4f, b: vec4f, c: vec4f, d: vec4f };
@group(0) @binding(0) var<uniform> ul: UL;
const ORO = vec3f(0.95, 0.74, 0.36);
const BRASA = vec3f(1.0, 0.46, 0.16);
const SANGRE = vec3f(0.55, 0.08, 0.05);

@vertex fn vsLente(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}

@fragment fn fsLente(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = fc.xy / ul.b.x;
  let d = p - ul.a.zw;
  let r = length(d);
  let thE = ul.b.y;
  let rs = ul.b.z;
  let k = thE * thE / max(r * r, 1e-2);
  var s = d * (1.0 - k);
  let sw = ul.b.w * min(k, 6.0);
  s = mat2x2f(cos(sw), sin(sw), -sin(sw), cos(sw)) * s;
  var col = vec3f(0.0);
  let fs = s - ul.d.yz;
  let f2 = dot(fs, fs) / (ul.d.w * ul.d.w);
  col += ORO * (0.9 * exp(-f2) + 0.9 * exp(-f2 * 9.0)) * (1.0 + 0.35 * ul.c.w);
  let hz = ul.c.z * exp(-max(r - rs, 0.0) / (rs * 0.9 + 1.0)) * (0.7 + 0.3 * sin(atan2(d.y, d.x) * 3.0 - ul.d.x * 2.0));
  col += SANGRE * 0.35 * hz + ORO * 0.05 * hz;
  var tapa = 0.0;
  if (rs > 0.0) {
    let fuera = smoothstep(rs - 1.2, rs + 1.2, r);
    col *= fuera;
    tapa = 1.0 - fuera;
    let dop = 0.55 + 0.45 * cos(atan2(d.y, d.x) - ul.c.y);
    let x = r - rs;
    let nucleo = exp(-x * x / (2.0 * 1.3 * 1.3)) * step(-2.5, x);
    let brillo = exp(-max(x, 0.0) / (5.0 + rs * 0.05)) * smoothstep(-2.0, 0.5, x);
    let ancho = exp(-max(x, 0.0) / (rs * 0.35 + 8.0)) * smoothstep(-2.0, 2.0, x);
    let x2 = r - rs * 1.045;
    let segundo = exp(-x2 * x2 / 1.2);
    let anillo = vec3f(1.9, 1.45, 1.05) * nucleo * (0.45 + 0.8 * dop)
               + BRASA * 0.95 * brillo * (0.35 + dop)
               + ORO * 0.3 * ancho * (0.4 + dop)
               + vec3f(1.2, 0.7, 0.4) * segundo * 0.5 * dop;
    col += anillo * ul.c.x * (1.0 + 0.5 * ul.c.w);
  }
  col = 1.0 - exp(-col * 1.15);
  let a = max(tapa, max(col.r, max(col.g, col.b)));
  return vec4f(col, a);
}
`;

// Los uniformes de las dos pasadas, empaquetados igual para las dos versiones
export function datosMalla(F, lienzo, dpr, L, datos = new Float32Array(28)) {
  datos.set(F.vp, 0);
  datos[16] = lienzo.width / 2; datos[17] = lienzo.height / 2; datos[18] = F.prof; datos[19] = F.giro;
  datos[20] = F.fase; datos[21] = F.onda; datos[22] = 0.65 * dpr + 0.75; datos[23] = F.latido;
  datos[24] = lienzo.height; datos[25] = L; datos[26] = F.calor; datos[27] = 0;
  return datos;
}
export function datosLente(F, ancho, alto, escala, datos = new Float32Array(16)) {
  const P = F.lente;
  datos[0] = ancho; datos[1] = alto; datos[2] = P.c.x; datos[3] = P.c.y;
  datos[4] = escala; datos[5] = P.thE; datos[6] = P.rs; datos[7] = P.swirl;
  datos[8] = P.ring; datos[9] = P.ringPh; datos[10] = P.heat; datos[11] = P.kick;
  datos[12] = P.time; datos[13] = P.fuente[0]; datos[14] = P.fuente[1]; datos[15] = P.fuente[2];
  return datos;
}
