// singularity· · escena del motor: el espacio-tiempo curvado hacia el punto (Miles; adaptada al motor por Charlie).
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT
//
// Es curvatura.js de la vista previa con el contrato del motor: aquí solo se dibuja. El bucle, el
// reloj, el vigilante de fps, la pausa y «reducir movimiento» los pone el motor (../motor.js), uno
// para todas las escenas. Lo que se ve depende solo de t (0..1 en su tramo) y del reloj; sin azar.
// El relevo con el big bang se lee de ../relevos.js: la malla se ha ido en PUNTO.entrega y su luz
// se apaga de PUNTO.aparece a PUNTO.apagado.
// WebGL sin dependencias, unos 12 KB: es la apertura y no espera a three.js.

import { PUNTO } from '../relevos.js';

// En T del motor: desde la primera sección hasta poco después de apagarse la luz
export const tramo = [0, PUNTO.apagado + 0.04];
// Tiene movimiento propio (el latido): el motor solo hace correr el reloj si una escena activa lo pide
export const late = true;

const L = 24;            // media anchura de la malla (unidades de mundo; una celda = 1)
const MUESTRAS = 320;    // muestras por línea de la rejilla: 2·49·320·2 vértices, índices de 16 bits
const GARGANTA = 1.0;    // anchura del pozo
const PROF = 6.0;        // profundidad del pozo en reposo
const DISCO = 1.6;       // radio del disco de luz
const PERIODO = 1.5;     // segundos por latido (40 por minuto: lento, nunca estroboscópico)
const FPS_MIN = 30;

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const suave = (x) => { x = limitar(x, 0, 1); return x * x * (3 - 2 * x); };

// Latido «pum-pum»: dos golpes suaves por periodo. Devuelve 0..1.
export function latido(reloj) {
  const f = (reloj % PERIODO) / PERIODO;
  return Math.exp(-(((f - 0.03) / 0.05) ** 2)) + 0.55 * Math.exp(-(((f - 0.2) / 0.06) ** 2));
}

// La malla son líneas de verdad, no un patrón pintado sobre triángulos: cada línea de la rejilla es una
// tira de 320 muestras (más juntas cerca del pozo) que el vertex shader hunde y engorda en pantalla.
// Así baja curvada y sin cortes hasta el punto, también en WebKit (antes, la línea salía de fwidth()
// sobre la superficie y se rompía en la pared empinada del embudo).
const VS_MALLA = `
attribute vec2 aP;
attribute vec2 aInfo;   // x: familia (0 = x fija, 1 = y fija), y: lado de la tira (-1 o 1)
uniform mat4 uVP;
uniform vec2 uRes;      // píxeles del lienzo
uniform float uProf, uEncoge, uGiro, uFase, uOnda, uMedio;
varying float vR, vOnda, vLado;
float pozo(float r) { return -uProf / sqrt(1.0 + r * r / ${(GARGANTA * GARGANTA).toFixed(3)}); }
float ondaEn(float r0) {
  float o = 0.0;
  for (int k = 0; k < 3; k++) {
    float edad = uFase + float(k) * ${PERIODO.toFixed(2)};
    float frente = 1.1 + edad * 4.2;
    o += exp(-pow((r0 - frente) / 0.65, 2.0)) * exp(-edad * 0.75);
  }
  return o * uOnda / (1.0 + 0.06 * r0);
}
vec4 mundo(vec2 p) {
  float r0 = length(p);
  float a = uGiro / (1.0 + r0 * 0.55);
  float c = cos(a), s = sin(a);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) * uEncoge;
  return uVP * vec4(q, pozo(length(q)) + ondaEn(r0) * 0.45, 1.0);
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
  float r0 = length(aP);
  vR = r0;
  vOnda = ondaEn(r0);
  vLado = aInfo.y;
  gl_Position = c0;
}`;

const FS_MALLA = `
precision highp float;
varying float vR, vOnda, vLado;
uniform float uAlfa, uLatido, uAltoPx, uMedio;
void main() {
  // Borde suave de un píxel: la línea mide lo mismo en cualquier pantalla
  float l = clamp((1.0 - abs(vLado)) * uMedio, 0.0, 1.0);
  float cerca = exp(-vR / 1.4);
  float luz = 0.55 + 0.75 * cerca * (0.75 + 0.4 * uLatido) + vOnda * 0.8;
  luz *= smoothstep(${(L * 0.98).toFixed(2)}, ${(L * 0.42).toFixed(2)}, vR);
  float y = gl_FragCoord.y / uAltoPx;
  luz *= mix(0.32, 1.0, smoothstep(0.06, 0.42, y));
  vec3 frio = vec3(0.70, 0.73, 0.80);
  vec3 calido = vec3(1.0, 0.86, 0.66);
  vec3 col = mix(frio, calido, clamp(cerca * 1.3 + vOnda * 0.5, 0.0, 1.0));
  float a = clamp(0.62 * l * luz * uAlfa, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}`;

const VS_LUZ = `
attribute vec2 aP;
void main() { gl_Position = vec4(aP, 0.0, 1.0); }`;

const FS_LUZ = `
precision highp float;
uniform vec2 uCentro, uEje;
uniform float uDpr, uLatido, uAlfa, uIntens, uReloj;
void main() {
  vec2 p = gl_FragCoord.xy - uCentro;
  float d = length(p) / uDpr;
  float s = 1.0 + 0.35 * uLatido;
  float nucleo = smoothstep(5.0 * s, 2.6 * s, d);
  float halo = 0.75 * exp(-d / (11.0 * s)) + 0.28 * exp(-d / (46.0 * (1.0 + 0.2 * uLatido)));
  vec2 e2 = p / uEje;
  float e = length(e2);
  float ang = atan(e2.y, e2.x);
  float anillo = 0.35 * exp(-pow((e - 0.55) / 0.25, 2.0)) + exp(-pow((e - 0.86) / 0.1, 2.0));
  anillo *= 1.0 - smoothstep(1.05, 1.45, e);
  // Simétrico arriba y abajo: el punto queda en el centro del anillo (antes brillaba más por debajo)
  float lado = 0.8 + 0.2 * cos(ang - 3.14159);
  float estrias = 0.82 + 0.18 * sin(ang * 7.0 + e * 9.0 - uReloj * 0.9);
  float disco = anillo * lado * estrias * (0.42 + 0.18 * uLatido);
  // Anillo de fotones: un círculo fino y redondo alrededor del punto, que marca su centro
  float foton = 0.5 * exp(-pow((length(p) - uEje.x * 0.48) / (1.4 * uDpr), 2.0)) * (0.8 + 0.3 * uLatido);
  vec3 ambar = vec3(0.95, 0.70, 0.38);
  vec3 col = vec3(1.0) * (nucleo + halo * 0.9) + mix(vec3(1.0, 0.93, 0.82), ambar, smoothstep(0.5, 1.1, e)) * disco
           + vec3(1.0, 0.9, 0.75) * foton;
  col *= uIntens * uAlfa;
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  gl_FragColor = vec4(min(col, vec3(a)), a);
}`;

function programa(gl, vs, fs) {
  const sh = (tipo, src) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aP');
  gl.bindAttribLocation(p, 1, 'aInfo');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const nom = gl.getActiveUniform(p, i).name; u[nom] = gl.getUniformLocation(p, nom); }
  return { p, u };
}

const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norma = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const punto3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function mirar(ojo, obj, arriba) {
  const z = norma(resta(ojo, obj)), x = norma(cruz(arriba, z)), y = cruz(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -punto3(x, ojo), -punto3(y, ojo), -punto3(z, ojo), 1];
}
function perspectiva(fovy, aspecto, cerca, lejos, desplY) {
  const f = 1 / Math.tan(fovy / 2);
  return [f / aspecto, 0, 0, 0, 0, f, 0, 0, 0, -desplY, (lejos + cerca) / (cerca - lejos), -1, 0, 0, (2 * lejos * cerca) / (cerca - lejos), 0];
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
function proyectar(m, x, y, z, ancho, alto) {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(cx / cw * 0.5 + 0.5) * ancho, (1 - (cy / cw * 0.5 + 0.5)) * alto];
}


export function iniciar(ctx) {
  const { lienzo, centro } = ctx;
  const gl = lienzo.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('sin WebGL');

  const malla = programa(gl, VS_MALLA, FS_MALLA);
  const luz = programa(gl, VS_LUZ, FS_LUZ);

  // Tiras de la malla: por cada línea de la rejilla (x = n o y = n), MUESTRAS puntos con dos vértices
  const pos = (u) => L * Math.sign(u) * Math.abs(u) ** 1.6;
  const lineas = 2 * L + 1;
  const v = new Float32Array(2 * lineas * MUESTRAS * 2 * 4);
  let o = 0;
  for (let fam = 0; fam < 2; fam++) for (let n = -L; n <= L; n++) for (let j = 0; j < MUESTRAS; j++) {
    const m = pos(-1 + (2 * j) / (MUESTRAS - 1));
    const x = fam === 0 ? n : m, y = fam === 0 ? m : n;
    for (const lado of [-1, 1]) { v.set([x, y, fam, lado], o); o += 4; }
  }
  const idx = new Uint16Array(2 * lineas * (MUESTRAS - 1) * 6);
  let k = 0;
  for (let ln = 0; ln < 2 * lineas; ln++) for (let j = 0; j < MUESTRAS - 1; j++) {
    const a = (ln * MUESTRAS + j) * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.set([a, b, c, b, d, c], k); k += 6;
  }
  const bufMalla = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufMalla);
  gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
  const bufIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  const bufTri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufTri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  let ancho = 0, alto = 0, dpr = 1, dprTope = 2;
  function medir() {
    dpr = Math.min(devicePixelRatio || 1, dprTope);
    ancho = innerWidth; alto = innerHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
  }


  function pintar(t, reloj) {
    // t va de 0 a 1 en el tramo; s es el t de la sección 0, el que usan todas las cuentas
    const s = t * tramo[1];
    const menosMovimiento = ctx.menosMovimiento;
    const b = menosMovimiento ? 0.6 : latido(reloj);
    const fase = menosMovimiento ? 0.55 : reloj % PERIODO;
    // Con «reducir movimiento» la escena aparece ya formada: ni cae ni gira al desplazar, solo se funde
    const caida = menosMovimiento ? 0 : suave(s / 0.45);
    const alfaMalla = 1 - suave((s - 0.08) / (PUNTO.entrega - 0.08));
    const alfaLuz = 1 - suave((s - PUNTO.aparece) / (PUNTO.apagado - PUNTO.aparece));
    const encoge = 1 - 0.9 * caida;
    // El fondo del pozo no se mueve con el latido: así el punto queda clavado en centro(), donde nace el big bang
    const prof = PROF * (1 + 2.2 * caida);

    const aspecto = ancho / alto;
    const fovy = (42 * Math.PI) / 180;
    const elev = (42 * Math.PI) / 180;
    // En vertical (móvil) el pozo llena el ancho: cuanto más estrecha la pantalla, más lejos la cámara.
    // En horizontal se acerca, para que en escritorio también presida.
    const dist = aspecto < 1 ? 16 * Math.sqrt(0.462 / Math.max(0.4, aspecto)) : 11.5;
    const obj = [0, 0, -prof];
    const ojo = [0, -dist * Math.cos(elev), obj[2] + dist * Math.sin(elev)];
    const c = centro();
    const desplY = 1 - (2 * c.y) / alto;
    const vp = por(perspectiva(fovy, aspecto, 0.1, 200, desplY), mirar(ojo, obj, [0, 0, 1]));

    gl.viewport(0, 0, lienzo.width, lienzo.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    if (alfaMalla <= 0 && alfaLuz <= 0) return;

    if (alfaMalla > 0) {
      gl.useProgram(malla.p);
      const u = malla.u;
      gl.uniformMatrix4fv(u.uVP, false, vp);
      gl.uniform1f(u.uProf, prof);
      gl.uniform1f(u.uEncoge, encoge);
      gl.uniform1f(u.uGiro, 0.35 + 3.2 * caida);
      gl.uniform1f(u.uFase, fase);
      gl.uniform1f(u.uOnda, menosMovimiento ? 0.6 : 1);
      gl.uniform2f(u.uRes, lienzo.width / 2, lienzo.height / 2);
      gl.uniform1f(u.uMedio, 0.65 * dpr + 0.75);
      gl.uniform1f(u.uAlfa, alfaMalla);
      gl.uniform1f(u.uLatido, b);
      gl.uniform1f(u.uAltoPx, lienzo.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufMalla);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(1);
    }

    if (alfaLuz > 0) {
      const z = -prof;
      const [px, py] = proyectar(vp, 0, 0, z, ancho, alto);
      const rd = DISCO * encoge;
      const [ax] = proyectar(vp, rd, 0, z, ancho, alto);
      const [, ayF] = proyectar(vp, 0, rd, z, ancho, alto);
      const [, ayN] = proyectar(vp, 0, -rd, z, ancho, alto);
      gl.useProgram(luz.p);
      const u = luz.u;
      gl.uniform2f(u.uCentro, px * dpr, (alto - py) * dpr);
      gl.uniform2f(u.uEje, Math.max(1, Math.abs(ax - px)) * dpr, Math.max(1, Math.abs(ayN - ayF) / 2) * dpr);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform1f(u.uLatido, b);
      gl.uniform1f(u.uAlfa, alfaLuz);
      gl.uniform1f(u.uIntens, 1 + 1.6 * caida);
      gl.uniform1f(u.uReloj, menosMovimiento ? 0 : reloj);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufTri);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }


  // Si va lento, primero menos resolución (2 → 1,5 → 1); después el motor para el latido
  function bajar() {
    if (dprTope <= 1) return false;
    dprTope = dprTope > 1.5 ? 1.5 : 1;
    medir();
    return true;
  }

  function perdido(e) { e.preventDefault(); ctx.fallo(); }
  lienzo.addEventListener('webglcontextlost', perdido);

  function retirar() {
    lienzo.removeEventListener('webglcontextlost', perdido);
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }

  medir();
  return { pintar, medir, bajar, retirar };
}
