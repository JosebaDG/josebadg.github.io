// Lente gravitacional en WebGL2 (Charlie, laboratorio de animación y vídeo; paso 2 de la ruta).
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT:
// la idea y las cuentas de app/src/scenes/spacetime-lens.ts, portadas a WebGL2 sin three.js.
//
// Un solo pase a pantalla completa. Cada píxel se lleva de vuelta al plano de la fuente con la
// ecuación de la lente delgada de una masa puntual,
//   beta = theta · (1 − thetaE² / |theta|²),
// y allí se mira lo que hay detrás del agujero: una rejilla (filtrada por caja, como en el
// original, que sigue a I. Quilez), un campo de estrellas fijo y el punto dorado de The Singularity.
// Dentro del anillo de Einstein sale la imagen secundaria, dada la vuelta; dentro del radio de la
// sombra todo es negro, y en su borde está el anillo de fotones, más brillante por un lado (Doppler).
// Cerca del agujero el plano de la fuente se retuerce (arrastre del espacio).
//
// Mismo contrato que las escenas de /motor/ (ver motor/README.md): tramo, late e iniciar(ctx) →
// { pintar(t, reloj), medir(), bajar(), retirar() }, más sincronizar() y nivel para medir.
// Lo que se ve depende solo de t y del reloj: sin azar, así que un enlace es un fotograma exacto.

export const tramo = [0, 1];
export const late = true;

const PERIODO = 1.5;   // segundos por latido, el mismo de la curvatura (40 por minuto)
const GIRO = 14;       // segundos por vuelta del lado brillante del anillo
export const NIVELES = [
  // 0: lo mínimo (resolución 1, sin estrellas ni subdivisiones)
  { dpr: 1, estrellas: 0, menor: 0 },
  // 1: móvil (resolución hasta 1,5, estrellas)
  { dpr: 1.5, estrellas: 1, menor: 0 },
  // 2: escritorio (resolución hasta 2, estrellas y subdivisiones de la rejilla)
  { dpr: 2, estrellas: 1, menor: 1 },
];

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const suave = (x) => { x = limitar(x, 0, 1); return x * x * (3 - 2 * x); };
export function latido(reloj) {
  const f = (reloj % PERIODO) / PERIODO;
  return Math.exp(-(((f - 0.03) / 0.05) ** 2)) + 0.55 * Math.exp(-(((f - 0.2) / 0.06) ** 2));
}

// t de 0 a 1: el punto dorado se alinea con la masa, la masa crece y dobla la luz (anillo de
// Einstein), aparece la sombra con su anillo de fotones y, al final, el espacio se retuerce.
// Lo que se manda al shader en cada fotograma. Lo comparten esta versión y la de WebGPU
// (../charlie-lente-gpu/lente-gpu.js), para que las dos pinten exactamente la misma escena.
export function parametros(t, reloj, ctx, nivel) {
  const mm = ctx.menosMovimiento;
  const rl = mm ? 0 : reloj;
  const R = ctx.radio();
  const c = ctx.centro();
  const masa = suave((t - 0.1) / 0.5);
  const sombra = suave((t - 0.4) / 0.35);
  const alinea = suave((t - 0.05) / 0.6);
  const n = NIVELES[nivel];
  const thE = R * 0.8 * masa;
  return {
    c, thE,
    rs: thE * 0.42 * sombra,
    swirl: 0.55 * suave((t - 0.6) / 0.4),
    ring: sombra,
    ringPh: -0.6 + (rl / GIRO) * Math.PI * 2,
    heat: 0.8 * suave((t - 0.55) / 0.45),
    kick: mm ? 0 : 0.25 * latido(rl) * sombra,
    time: rl,
    paso: Math.max(28, R * 0.42),
    menor: n.menor,
    estrellas: n.estrellas,
    fuente: [(1 - alinea) * R * 0.85, (1 - alinea) * -R * 0.4, Math.max(5, R * 0.07)],
  };
}

const VS = `#version 300 es
in vec2 aP;
void main() { gl_Position = vec4(aP, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;        // tamaño en px CSS
uniform float uDpr;       // px del lienzo por px CSS
uniform vec2 uC;          // centro de la lente (px CSS, y hacia abajo)
uniform float uThE;       // radio de Einstein (px)
uniform float uRs;        // radio de la sombra (px)
uniform float uSwirl;     // giro del arrastre en el anillo de Einstein (rad)
uniform float uRing;      // intensidad del anillo de fotones
uniform float uRingPh;    // ángulo del lado brillante (Doppler)
uniform float uHeat;      // bruma cálida pegada al agujero
uniform float uKick;      // latido
uniform float uTime;      // reloj (s)
uniform float uPaso;      // px por división de la rejilla
uniform float uMenor;     // subdivisiones de la rejilla (nivel)
uniform float uEstrellas; // campo de estrellas (nivel)
uniform vec3 uFuente;     // punto dorado detrás: desplazamiento desde el centro (px) y radio (px)
out vec4 color;

const vec3 HUESO = vec3(0.93, 0.89, 0.82);
const vec3 ORO = vec3(0.95, 0.74, 0.36);
const vec3 BRASA = vec3(1.0, 0.46, 0.16);
const vec3 SANGRE = vec3(0.55, 0.08, 0.05);

// Cobertura de una rejilla de líneas de anchura relativa 1/N, filtrada por caja (I. Quilez)
float gridCov(vec2 p, float N) {
  vec2 w = max(abs(dFdx(p)), abs(dFdy(p))) + 1e-5;
  vec2 a = p + 0.5 * w, b = p - 0.5 * w;
  vec2 i = (floor(a) + min(fract(a) * N, 1.0) - floor(b) - min(fract(b) * N, 1.0)) / (N * w);
  return 1.0 - (1.0 - i.x) * (1.0 - i.y);
}
float lineCov(float p, float N) {
  float w = abs(dFdx(p)) + abs(dFdy(p)) + 1e-5;
  float a = p + 0.5 * w, b = p - 0.5 * w;
  return (floor(a) + min(fract(a) * N, 1.0) - floor(b) - min(fract(b) * N, 1.0)) / (N * w);
}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Estrellas fijas en el plano de la fuente. tam: px de fuente por px de pantalla (de fuera del bucle,
// porque las derivadas no valen dentro de un bucle con saltos). Donde la lente encoge, la estrella
// no baja de un píxel y conserva su brillo total; donde amplía, crece en arco, como en el cielo.
float estrellas(vec2 s, float tam) {
  const float CEL = 26.0;
  vec2 c = floor(s / CEL);
  float rad = clamp(0.8 * tam, 0.8, CEL * 0.4);
  float flujo = 0.64 / (rad * rad);
  float lum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 k = c + vec2(float(i), float(j));
      float h = hash(k);
      vec2 pos = (k + 0.15 + 0.7 * vec2(hash(k + 7.1), hash(k + 3.7))) * CEL;
      vec2 dd = s - pos;
      float b = step(0.45, h) * (0.25 + 1.6 * pow(hash(k + 1.3), 5.0));
      lum += b * exp(-dot(dd, dd) / (rad * rad));
    }
  }
  return lum * min(flujo, 1.0);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 d = p - uC;
  float r = length(d);

  // ---- lente: de la imagen al plano de la fuente
  float k = uThE * uThE / max(r * r, 1e-2);
  vec2 s = d * (1.0 - k);
  float sw = uSwirl * min(k, 6.0);
  s = mat2(cos(sw), sin(sw), -sin(sw), cos(sw)) * s;

  // ---- rejilla, con los ejes más marcados y apagándose hacia fuera
  vec2 q = s / uPaso;
  float N = uPaso / 1.1;
  float g = gridCov(q, N);
  float ax = max(lineCov(q.x + 0.5 / (N * 0.55), N * 0.55) * step(abs(q.x), 0.5),
                 lineCov(q.y + 0.5 / (N * 0.55), N * 0.55) * step(abs(q.y), 0.5));
  float mn = gridCov(q * 5.0, N / 5.0);
  float lejos = exp(-length(q) / 7.0);
  float lum = (0.24 * g + 0.34 * ax + 0.07 * mn * uMenor) * lejos;
  vec2 ws = fwidth(s);
  float tam = max(ws.x, ws.y);

  vec3 col = vec3(0.025, 0.022, 0.03) * (1.0 - smoothstep(0.0, max(uRes.x, uRes.y) * 0.7, r));
  col += mix(HUESO * 0.6, ORO, 0.3) * lum;
  if (uEstrellas > 0.0) col += HUESO * 0.85 * estrellas(s, tam) * uEstrellas;

  // ---- el punto dorado, detrás del agujero: alineado con él, se vuelve el anillo de Einstein
  vec2 fs = s - uFuente.xy;
  float f2 = dot(fs, fs) / (uFuente.z * uFuente.z);
  col += ORO * (0.9 * exp(-f2) + 0.9 * exp(-f2 * 9.0)) * (1.0 + 0.35 * uKick);

  // ---- bruma cálida pegada al agujero
  float hz = uHeat * exp(-max(r - uRs, 0.0) / (uRs * 0.9 + 1.0)) * (0.7 + 0.3 * sin(atan(d.y, d.x) * 3.0 - uTime * 2.0));
  col += SANGRE * 0.35 * hz + ORO * 0.05 * hz;

  // ---- sombra y anillo de fotones
  if (uRs > 0.0) {
    float aa = 1.2;
    col *= smoothstep(uRs - aa, uRs + aa, r);
    float ang = atan(d.y, d.x);
    float dop = 0.55 + 0.45 * cos(ang - uRingPh);
    float x = r - uRs;
    float nucleo = exp(-x * x / (2.0 * 1.3 * 1.3)) * step(-2.5, x);
    float brillo = exp(-max(x, 0.0) / (5.0 + uRs * 0.05)) * smoothstep(-2.0, 0.5, x);
    float ancho = exp(-max(x, 0.0) / (uRs * 0.35 + 8.0)) * smoothstep(-2.0, 2.0, x);
    float segundo = exp(-pow(r - uRs * 1.045, 2.0) / 1.2);
    vec3 anillo = vec3(1.9, 1.45, 1.05) * nucleo * (0.45 + 0.8 * dop)
                + BRASA * 0.95 * brillo * (0.35 + dop)
                + ORO * 0.3 * ancho * (0.4 + dop)
                + vec3(1.2, 0.7, 0.4) * segundo * 0.5 * dop;
    col += anillo * uRing * (1.0 + 0.5 * uKick);
  }

  // Recorte suave de las luces y un poco de ruido para que el degradado no haga escalones
  col = 1.0 - exp(-col * 1.15);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  color = vec4(col, 1.0);
}`;

function compilar(gl, tipo, fuente) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fuente);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
  return s;
}

export async function iniciar(ctx) {
  const lienzo = ctx.lienzo;
  const gl = lienzo.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('este navegador no tiene WebGL 2');
  const prog = gl.createProgram();
  gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(prog, 0, 'aP');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('programa: ' + gl.getProgramInfoLog(prog));
  const u = {};
  for (const n of ['uRes', 'uDpr', 'uC', 'uThE', 'uRs', 'uSwirl', 'uRing', 'uRingPh', 'uHeat', 'uKick', 'uTime', 'uPaso', 'uMenor', 'uEstrellas', 'uFuente']) u[n] = gl.getUniformLocation(prog, n);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  let nivel = limitar(Number.isInteger(ctx.nivel) ? ctx.nivel : (ctx.movil ? 1 : 2), 0, NIVELES.length - 1);
  let ancho = 0, alto = 0, dpr = 1;
  function medir() {
    dpr = Math.min(devicePixelRatio || 1, NIVELES[nivel].dpr);
    ancho = innerWidth; alto = innerHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
  }

  function pintar(t, reloj) {
    const P = parametros(t, reloj, ctx, nivel);
    gl.viewport(0, 0, lienzo.width, lienzo.height);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(u.uRes, ancho, alto);
    gl.uniform1f(u.uDpr, lienzo.width / ancho);
    gl.uniform2f(u.uC, P.c.x, P.c.y);
    gl.uniform1f(u.uThE, P.thE);
    gl.uniform1f(u.uRs, P.rs);
    gl.uniform1f(u.uSwirl, P.swirl);
    gl.uniform1f(u.uRing, P.ring);
    gl.uniform1f(u.uRingPh, P.ringPh);
    gl.uniform1f(u.uHeat, P.heat);
    gl.uniform1f(u.uKick, P.kick);
    gl.uniform1f(u.uTime, P.time);
    gl.uniform1f(u.uPaso, P.paso);
    gl.uniform1f(u.uMenor, P.menor);
    gl.uniform1f(u.uEstrellas, P.estrellas);
    gl.uniform3f(u.uFuente, P.fuente[0], P.fuente[1], P.fuente[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Si va lento, baja un nivel: 2 → 1 (menos resolución y sin subdivisiones) → 0 (resolución 1, sin estrellas)
  function bajar() {
    if (nivel <= 0) return false;
    nivel--;
    medir();
    return true;
  }
  function ponerNivel(x) { nivel = limitar(x, 0, NIVELES.length - 1); medir(); }

  // Espera a que la GPU acabe el cuadro (lee un píxel): para medir milisegundos por fotograma
  const px = new Uint8Array(4);
  function sincronizar() { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }

  function perdido(e) { e.preventDefault(); ctx.fallo(); }
  lienzo.addEventListener('webglcontextlost', perdido);
  function retirar() {
    lienzo.removeEventListener('webglcontextlost', perdido);
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }

  medir();
  return {
    pintar, medir, bajar, retirar, sincronizar, ponerNivel,
    get nivel() { return nivel; },
    get resolucion() { return { ancho: lienzo.width, alto: lienzo.height, dpr }; },
  };
}
