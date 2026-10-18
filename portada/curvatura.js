// singularity· · escena 0, «Todo empieza con un punto» (Miles).
//
// El espacio-tiempo se curva hacia el punto: una malla que se hunde en un pozo, un disco de luz
// alrededor y el punto blanco en el fondo, que late. Cada latido manda una onda por la malla.
// Al deslizar, la malla gira y cae dentro del punto, y el big bang (bigbang.min.js) sale de ahí.
//
// WebGL sin dependencias, unos 12 KB: se carga con import() nada más abrir y no espera a three.js.
// Todo lo que se ve es función de dos números: t (el desplazamiento, 0 a 1 en la escena 0) y el
// reloj del latido, que solo avanza mientras late. Sin Math.random ni Date.now.
// Accesibilidad: el lienzo va con aria-hidden; con «reducir movimiento» se pinta un fotograma fijo
// que al desplazar solo se funde; el latido se puede pausar (WCAG 2.2.2) y nunca pasa de un destello por segundo (2.3.1).
// Si no hay WebGL, se pierde el contexto o baja de 30 fps sin remedio, queda el cartel estático.

const L = 24;            // media anchura de la malla (unidades de mundo; una celda = 1)
const SEG = 200;         // segmentos por lado: 201² vértices, índices de 16 bits
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

const VS_MALLA = `
attribute vec2 aP;
uniform mat4 uVP;
uniform float uProf, uEncoge, uGiro, uFase, uOnda;
varying vec2 vG;
varying float vR, vOnda;
float pozo(float r) { return -uProf / sqrt(1.0 + r * r / ${(GARGANTA * GARGANTA).toFixed(3)}); }
void main() {
  float r0 = length(aP);
  float a = uGiro / (1.0 + r0 * 0.55);
  float c = cos(a), s = sin(a);
  vec2 q = vec2(c * aP.x - s * aP.y, s * aP.x + c * aP.y) * uEncoge;
  float r = length(q);
  float onda = 0.0;
  for (int k = 0; k < 3; k++) {
    float edad = uFase + float(k) * ${PERIODO.toFixed(2)};
    float frente = 1.1 + edad * 4.2;
    onda += exp(-pow((r0 - frente) / 0.65, 2.0)) * exp(-edad * 0.75);
  }
  onda *= uOnda / (1.0 + 0.06 * r0);
  vG = aP;
  vR = r0;
  vOnda = onda;
  gl_Position = uVP * vec4(q, pozo(r) + onda * 0.45, 1.0);
}`;

const FS_MALLA = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vG;
varying float vR, vOnda;
uniform float uDpr, uAlfa, uLatido, uAltoPx;
void main() {
  vec2 fw = max(fwidth(vG), vec2(1e-4));
  vec2 d = abs(fract(vG - 0.5) - 0.5) / fw;
  float medio = 0.65 * uDpr;
  float linea = clamp(medio + 0.5 - min(d.x, d.y), 0.0, 1.0);
  float densidad = max(fw.x, fw.y);
  float nitidez = clamp(1.25 - densidad * 2.2, 0.0, 1.0);
  float velo = clamp(densidad * 0.6, 0.0, 0.16);
  float l = linea * nitidez + velo * (1.0 - nitidez);
  float cerca = exp(-vR / 1.6);
  float luz = 0.62 + 1.1 * cerca * (0.75 + 0.4 * uLatido) + vOnda * 0.8;
  luz *= smoothstep(${(L * 0.98).toFixed(2)}, ${(L * 0.42).toFixed(2)}, vR);
  float y = gl_FragCoord.y / uAltoPx;
  luz *= mix(0.32, 1.0, smoothstep(0.06, 0.42, y));
  vec3 frio = vec3(0.70, 0.73, 0.80);
  vec3 calido = vec3(1.0, 0.86, 0.66);
  vec3 col = mix(frio, calido, clamp(cerca * 1.6 + vOnda * 0.5, 0.0, 1.0));
  float a = clamp(l * luz * uAlfa, 0.0, 1.0);
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
  float lado = 0.55 + 0.45 * cos(ang + 0.5);
  float estrias = 0.82 + 0.18 * sin(ang * 7.0 + e * 9.0 - uReloj * 0.9);
  float disco = anillo * lado * estrias * (0.42 + 0.18 * uLatido);
  vec3 ambar = vec3(0.95, 0.70, 0.38);
  vec3 col = vec3(1.0) * (nucleo + halo * 0.9) + mix(vec3(1.0, 0.93, 0.82), ambar, smoothstep(0.5, 1.1, e)) * disco;
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

export function init(api) {
  const { lienzo, progreso, centro, menosMovimiento, boton, alFallar } = api;
  const gl = lienzo.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'high-performance' });
  if (!gl || !gl.getExtension('OES_standard_derivatives')) throw new Error('sin WebGL');

  const malla = programa(gl, VS_MALLA, FS_MALLA);
  const luz = programa(gl, VS_LUZ, FS_LUZ);

  const lado = SEG + 1;
  const v = new Float32Array(lado * lado * 2);
  const pos = (u) => L * Math.sign(u) * Math.abs(u) ** 1.6;
  for (let j = 0; j < lado; j++) for (let i = 0; i < lado; i++) {
    v[(j * lado + i) * 2] = pos(-1 + (2 * i) / SEG);
    v[(j * lado + i) * 2 + 1] = pos(-1 + (2 * j) / SEG);
  }
  const idx = new Uint16Array(SEG * SEG * 6);
  let k = 0;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * lado + i, b = a + 1, c = a + lado, d = c + 1;
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

  let reloj = 0;
  let pausado = false;
  let visible = true;

  function pintar(t) {
    const b = menosMovimiento ? 0.6 : latido(reloj);
    const fase = menosMovimiento ? 0.55 : reloj % PERIODO;
    // Con «reducir movimiento» la escena aparece ya formada: ni cae ni gira al desplazar, solo se funde
    const caida = menosMovimiento ? 0 : suave(t / 0.45);
    const alfaMalla = 1 - suave((t - 0.08) / 0.34);
    const alfaLuz = 1 - suave((t - 0.3) / 0.28);
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
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform1f(u.uAlfa, alfaMalla);
      gl.uniform1f(u.uLatido, b);
      gl.uniform1f(u.uAltoPx, lienzo.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufMalla);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
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

  function tEscena() {
    const { i, t } = progreso();
    return i === 0 ? t : 1;
  }

  let pendiente = false, previo = 0, retirado = false;
  let ventana = { t0: 0, frames: 0 }, lentas = 0;
  const late = () => !menosMovimiento && !pausado && !document.hidden && visible;

  function render(ahora = performance.now()) {
    if (retirado) return;
    const t = tEscena();
    visible = t < 0.62;
    lienzo.style.visibility = visible ? 'visible' : 'hidden';
    if (late()) {
      if (previo) reloj += Math.min(0.05, (ahora - previo) / 1000);
      previo = ahora;
      vigilar(ahora);
    } else previo = 0;
    if (visible) pintar(t);
  }
  function bucle(ahora) {
    pendiente = false;
    render(ahora);
    if (late()) pedir();
  }
  function pedir() { if (!pendiente && !retirado) { pendiente = true; requestAnimationFrame(bucle); } }

  function vigilar(ahora) {
    if (!ventana.t0) { ventana = { t0: ahora, frames: 0 }; return; }
    ventana.frames++;
    if (ahora - ventana.t0 < 1500) return;
    const fps = (ventana.frames * 1000) / (ahora - ventana.t0);
    ventana = { t0: ahora, frames: 0 };
    lentas = fps < FPS_MIN ? lentas + 1 : 0;
    if (lentas < 2) return;
    lentas = 0;
    if (dprTope > 1) { dprTope = dprTope > 1.5 ? 1.5 : 1; medir(); }
    else { pausado = true; ponerBoton(); }
  }

  function reset() { previo = 0; ventana = { t0: 0, frames: 0 }; pedir(); }

  function ponerBoton() {
    if (!boton) return;
    boton.setAttribute('aria-pressed', String(pausado));
    boton.setAttribute('aria-label', pausado ? 'Reanudar el latido' : 'Pausar el latido');
  }
  if (boton && !menosMovimiento) {
    boton.hidden = false;
    ponerBoton();
    boton.addEventListener('click', () => { pausado = !pausado; ponerBoton(); reset(); });
  }

  function retirar() {
    retirado = true;
    if (boton) boton.hidden = true;
    if (alFallar) alFallar();
  }
  lienzo.addEventListener('webglcontextlost', (e) => { e.preventDefault(); retirar(); });

  medir();
  addEventListener('resize', () => { medir(); pedir(); }, { passive: true });
  addEventListener('scroll', pedir, { passive: true });
  document.addEventListener('visibilitychange', reset);
  pedir();

  return { render: pedir, reset, retirar };
}
