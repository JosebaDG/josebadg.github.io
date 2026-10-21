// Desmontar un shader (Miles, apartado de innovación del laboratorio; MVP 1).
//
// El shader original es de una sola línea, escrito para twigl en modo «geekest» (FC, r, t, o).
// Por el estilo, casi seguro de Yohei Nishitsuji (#つぶやきGLSL); no encontramos la publicación
// exacta ni licencia, así que se cita con su nombre y solo para enseñar.
// hsv() y rotate3D() son las de twigl (github.com/doxas/twigl, src/shader_snippet/noise.glsl, MIT).
//
// Aquí el mismo cálculo va en dos idiomas, WGSL (WebGPU) y GLSL (WebGL2), con un mando más:
// «etapa» enseña lo que vale cada pieza por dentro (1 coordenadas, 2 zoom, 3 giro, 4 pliegue,
// 5 profundidad, 6 color final). Con etapa 6, 98 pasos, 19 pliegues y k = 7,1 sale el original.
//
// Sin azar y sin reloj del sistema en lo que se pinta: un enlace es un fotograma exacto.
// ?etapa=1..6&pasos=1..98&pliegues=0..19&k=2..12&t=0..62.8&motor=gpu|gl&nivel=0|1|2&ui=0
// Solo se pinta cuando algo cambia (o mientras el reloj se mueve), para no gastar batería.
//
// Diferencias de idioma que importan aquí:
// - @builtin(position) tiene el origen arriba; gl_FragCoord, abajo. En WGSL se da la vuelta a y.
// - vec3 * mat3 multiplica «por la izquierda» en los dos (igual a transpose(M) * p).
// - Las variables sin valor inicial del original valen 0: aquí se escriben.

export const ETAPAS = 6;
export const MAX_PASOS = 98;   // ++i<99. con i desde 0: el cuerpo corre 98 veces
export const MAX_PLIEGUES = 19; // i++<19 con i desde 0: 19 veces
export const NIVELES = [0.5, 0.75, 1]; // px del lienzo por px de pantalla (tope 2) en cada nivel

export const ORIGINAL = 'for(float i,g,e,s;++i<99.;o.rgb+=.01-hsv(.1,g*.016-e*.3,s/2e2)){vec3 p=vec3((FC.xy-.5*r)/r.y*5.+vec2(0,9),g)*rotate3D(-1.1-cos(t*.15)*.1,vec3(1,11.+sin(t)*.15,-1.5));s=2.;for(int i;i++<19;p=vec3(.08,4,-1)-abs(abs(p)*e-vec3(3,4,3)))s*=e=7.1/dot(p,p*.51);g+=p.y/s;s=log2(s)/exp(e);}';

export const WGSL = /* wgsl */ `
struct U {
  res: vec2f,      // tamaño del lienzo en px (r en twigl)
  t: f32,          // tiempo en segundos (t)
  etapa: f32,      // qué pieza se enseña: 1..6
  pasos: f32,      // vueltas del bucle de fuera (1..98)
  pliegues: f32,   // vueltas del bucle de dentro (0..19)
  k: f32,          // el 7.1 del original
  dens: f32,       // px del lienzo por px de pantalla (para el grosor de las líneas)
};
@group(0) @binding(0) var<uniform> u: U;

const FONDO = vec3f(0.035, 0.032, 0.03);
const HUESO = vec3f(0.93, 0.89, 0.82);
const ORO = vec3f(0.95, 0.81, 0.59);
const ROJO = vec3f(0.92, 0.36, 0.28);
const VERDE = vec3f(0.45, 0.78, 0.47);

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn hsv(h: f32, s: f32, v: f32) -> vec3f {
  let t = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(vec3f(h) + t.xyz) * 6.0 - vec3f(t.w));
  return v * mix(vec3f(t.x), clamp(p - vec3f(t.x), vec3f(0.0), vec3f(1.0)), s);
}

fn rotate3D(angle: f32, axis: vec3f) -> mat3x3f {
  let a = normalize(axis);
  let s = sin(angle);
  let c = cos(angle);
  let r = 1.0 - c;
  return mat3x3f(
    a.x * a.x * r + c, a.y * a.x * r + a.z * s, a.z * a.x * r - a.y * s,
    a.x * a.y * r - a.z * s, a.y * a.y * r + c, a.z * a.y * r + a.x * s,
    a.x * a.z * r + a.y * s, a.y * a.z * r - a.x * s, a.z * a.z * r + c);
}

// Cuánto cae el píxel sobre una línea de la rejilla de paso 1 (d = unidades por píxel).
fn rejilla(v: f32, d: f32) -> f32 {
  let dist = abs(fract(v + 0.5) - 0.5);
  return 1.0 - smoothstep(0.5 * d, 1.5 * d, dist);
}
fn eje(v: f32, d: f32) -> f32 {
  return 1.0 - smoothstep(0.8 * d, 2.0 * d, abs(v));
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let FC = vec2f(pos.x, u.res.y - pos.y);           // origen abajo, como gl_FragCoord
  let uv = (FC - 0.5 * u.res) / u.res.y;              // paso 1
  let q = uv * 5.0 + vec2f(0.0, 9.0);                 // paso 2
  let R = rotate3D(-1.1 - cos(u.t * 0.15) * 0.1, vec3f(1.0, 11.0 + sin(u.t) * 0.15, -1.5)); // paso 3
  let d1 = u.dens / u.res.y;                          // unidades de uv por px de pantalla
  var col = FONDO;

  if (u.etapa < 1.5) {
    // 1. Cada píxel sabe dónde está: x en rojo, y en verde, rejilla cada 0,1
    let x = clamp(0.5 + uv.x, 0.0, 1.0);
    let y = clamp(0.5 + uv.y, 0.0, 1.0);
    col = FONDO + 0.55 * (ROJO * x + VERDE * y);
    let g = max(rejilla(uv.x * 10.0, d1 * 10.0), rejilla(uv.y * 10.0, d1 * 10.0));
    col = mix(col, HUESO * 0.5, 0.35 * g);
    col = mix(col, HUESO, max(eje(uv.x, d1), eje(uv.y, d1)));
  } else if (u.etapa < 2.5) {
    // 2. Zoom (×5) y desplazamiento (+9 en y): rejilla de 1 unidad, línea dorada en y = 9
    let d = d1 * 5.0;
    let g = max(rejilla(q.x, d), rejilla(q.y, d));
    col = mix(FONDO + vec3f(0.03, 0.028, 0.025) * (q.y - 6.5), HUESO * 0.55, 0.6 * g);
    col = mix(col, HUESO, eje(q.x, d));
    col = mix(col, ORO, eje(q.y - 9.0, d));
  } else if (u.etapa < 3.5) {
    // 3. El punto pasa a 3D (profundidad g = 0) y se gira: corte de un tablero de cubos de 1 unidad
    let p = vec3f(q, 0.0) * R;
    let c = floor(p);
    let par = abs(c.x + c.y + c.z) - 2.0 * floor(abs(c.x + c.y + c.z) * 0.5);
    let d = d1 * 5.0;
    col = mix(FONDO + 0.05, ORO * 0.42, par) * (0.75 + 0.25 * fract(p.z));
    let g = max(max(rejilla(p.x, d), rejilla(p.y, d)), rejilla(p.z, d));
    col = mix(col, HUESO * 0.8, 0.5 * g);
  } else if (u.etapa < 4.5) {
    // 4. El pliegue sobre ese mismo corte: cuánto se ha estirado el espacio (log2 s)
    var p = vec3f(q, 0.0) * R;
    var s = 2.0;
    var e = 0.0;
    for (var j = 0; j < 19; j++) {
      if (f32(j) >= u.pliegues) { break; }
      e = u.k / dot(p, p * 0.51);
      s *= e;
      p = vec3f(0.08, 4.0, -1.0) - abs(abs(p) * e - vec3f(3.0, 4.0, 3.0));
    }
    let l = log2(max(s, 1e-30));
    let v = clamp((l + 3.2) / 4.4, 0.0, 1.0);
    col = mix(FONDO, ORO, v * v);
    let curva = rejilla(l * 3.0, 0.06);
    col = mix(col, HUESO, 0.22 * curva);
  } else {
    // 5 y 6. El original: avanzar por el rayo y sumar color en cada paso
    var g = 0.0;
    var e = 0.0;
    var s = 0.0;
    var o = vec3f(0.0);
    for (var i = 1; i < 99; i++) {
      if (f32(i) > u.pasos) { break; }
      var p = vec3f(uv * 5.0 + vec2f(0.0, 9.0), g) * R;
      s = 2.0;
      for (var j = 0; j < 19; j++) {
        if (f32(j) >= u.pliegues) { break; }
        e = u.k / dot(p, p * 0.51);
        s *= e;
        p = vec3f(0.08, 4.0, -1.0) - abs(abs(p) * e - vec3f(3.0, 4.0, 3.0));
      }
      g += p.y / s;
      s = log2(s) / exp(e);
      o += 0.01 - hsv(0.1, g * 0.016 - e * 0.3, s / 2e2);
    }
    if (u.etapa < 5.5) {
      // 5. Profundidad: claro = el rayo se paró cerca; oscuro = siguió lejos
      let v = 1.0 - clamp(g / 70.0, 0.0, 1.0);
      col = mix(FONDO, HUESO, v * v);
      col = mix(col, ORO, 0.35 * rejilla(g / 5.0, 0.08));
    } else {
      col = clamp(o, vec3f(0.0), vec3f(1.0));
    }
  }
  return vec4f(col, 1.0);
}
`;

export const GLSL_VS = `#version 300 es
void main(){
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const GLSL = `#version 300 es
precision highp float;
uniform vec2 res;      // r en twigl
uniform float t;       // t
uniform float etapa;   // 1..6
uniform float pasos;   // 1..98
uniform float pliegues;// 0..19
uniform float k;       // el 7.1
uniform float dens;    // px del lienzo por px de pantalla
out vec4 o_;

const vec3 FONDO = vec3(0.035, 0.032, 0.03);
const vec3 HUESO = vec3(0.93, 0.89, 0.82);
const vec3 ORO = vec3(0.95, 0.81, 0.59);
const vec3 ROJO = vec3(0.92, 0.36, 0.28);
const vec3 VERDE = vec3(0.45, 0.78, 0.47);

vec3 hsv(float h, float s, float v){
  vec4 t = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(vec3(h) + t.xyz) * 6.0 - vec3(t.w));
  return v * mix(vec3(t.x), clamp(p - vec3(t.x), 0.0, 1.0), s);
}
mat3 rotate3D(float angle, vec3 axis){
  vec3 a = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float r = 1.0 - c;
  return mat3(
    a.x * a.x * r + c, a.y * a.x * r + a.z * s, a.z * a.x * r - a.y * s,
    a.x * a.y * r - a.z * s, a.y * a.y * r + c, a.z * a.y * r + a.x * s,
    a.x * a.z * r + a.y * s, a.y * a.z * r - a.x * s, a.z * a.z * r + c);
}
float rejilla(float v, float d){
  float dist = abs(fract(v + 0.5) - 0.5);
  return 1.0 - smoothstep(0.5 * d, 1.5 * d, dist);
}
float eje(float v, float d){
  return 1.0 - smoothstep(0.8 * d, 2.0 * d, abs(v));
}

void main(){
  vec2 FC = gl_FragCoord.xy;
  vec2 uv = (FC - 0.5 * res) / res.y;
  vec2 q = uv * 5.0 + vec2(0.0, 9.0);
  mat3 R = rotate3D(-1.1 - cos(t * 0.15) * 0.1, vec3(1.0, 11.0 + sin(t) * 0.15, -1.5));
  float d1 = dens / res.y;
  vec3 col = FONDO;

  if (etapa < 1.5) {
    float x = clamp(0.5 + uv.x, 0.0, 1.0);
    float y = clamp(0.5 + uv.y, 0.0, 1.0);
    col = FONDO + 0.55 * (ROJO * x + VERDE * y);
    float g = max(rejilla(uv.x * 10.0, d1 * 10.0), rejilla(uv.y * 10.0, d1 * 10.0));
    col = mix(col, HUESO * 0.5, 0.35 * g);
    col = mix(col, HUESO, max(eje(uv.x, d1), eje(uv.y, d1)));
  } else if (etapa < 2.5) {
    float d = d1 * 5.0;
    float g = max(rejilla(q.x, d), rejilla(q.y, d));
    col = mix(FONDO + vec3(0.03, 0.028, 0.025) * (q.y - 6.5), HUESO * 0.55, 0.6 * g);
    col = mix(col, HUESO, eje(q.x, d));
    col = mix(col, ORO, eje(q.y - 9.0, d));
  } else if (etapa < 3.5) {
    vec3 p = vec3(q, 0.0) * R;
    vec3 c = floor(p);
    float par = abs(c.x + c.y + c.z) - 2.0 * floor(abs(c.x + c.y + c.z) * 0.5);
    float d = d1 * 5.0;
    col = mix(FONDO + 0.05, ORO * 0.42, par) * (0.75 + 0.25 * fract(p.z));
    float g = max(max(rejilla(p.x, d), rejilla(p.y, d)), rejilla(p.z, d));
    col = mix(col, HUESO * 0.8, 0.5 * g);
  } else if (etapa < 4.5) {
    vec3 p = vec3(q, 0.0) * R;
    float s = 2.0;
    float e = 0.0;
    for (int j = 0; j < 19; j++) {
      if (float(j) >= pliegues) break;
      e = k / dot(p, p * 0.51);
      s *= e;
      p = vec3(0.08, 4.0, -1.0) - abs(abs(p) * e - vec3(3.0, 4.0, 3.0));
    }
    float l = log2(max(s, 1e-30));
    float v = clamp((l + 3.2) / 4.4, 0.0, 1.0);
    col = mix(FONDO, ORO, v * v);
    float curva = rejilla(l * 3.0, 0.06);
    col = mix(col, HUESO, 0.22 * curva);
  } else {
    float g = 0.0, e = 0.0, s = 0.0;
    vec3 o = vec3(0.0);
    for (int i = 1; i < 99; i++) {
      if (float(i) > pasos) break;
      vec3 p = vec3(uv * 5.0 + vec2(0.0, 9.0), g) * R;
      s = 2.0;
      for (int j = 0; j < 19; j++) {
        if (float(j) >= pliegues) break;
        e = k / dot(p, p * 0.51);
        s *= e;
        p = vec3(0.08, 4.0, -1.0) - abs(abs(p) * e - vec3(3.0, 4.0, 3.0));
      }
      g += p.y / s;
      s = log2(s) / exp(e);
      o += 0.01 - hsv(0.1, g * 0.016 - e * 0.3, s / 2e2);
    }
    if (etapa < 5.5) {
      float v = 1.0 - clamp(g / 70.0, 0.0, 1.0);
      col = mix(FONDO, HUESO, v * v);
      col = mix(col, ORO, 0.35 * rejilla(g / 5.0, 0.08));
    } else {
      col = clamp(o, 0.0, 1.0);
    }
  }
  o_ = vec4(col, 1.0);
}`;

// ---------- Motores: los dos tienen la misma forma { nombre, pintar(estado), sincronizar(), retirar() }

export async function hayWebGPU() {
  if (!('gpu' in navigator)) return false;
  try { return !!(await navigator.gpu.requestAdapter()); } catch { return false; }
}

export async function motorGPU(lienzo) {
  const adaptador = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adaptador) throw new Error('sin adaptador WebGPU');
  const device = await adaptador.requestDevice();
  const ctx = lienzo.getContext('webgpu');
  const formato = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: formato, alphaMode: 'opaque' });
  const modulo = device.createShaderModule({ code: WGSL });
  const info = await modulo.getCompilationInfo();
  const errores = info.messages.filter((m) => m.type === 'error');
  if (errores.length) throw new Error('WGSL: ' + errores.map((m) => m.lineNum + ': ' + m.message).join(' | '));
  const pipeline = await device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: { module: modulo, entryPoint: 'vs' },
    fragment: { module: modulo, entryPoint: 'fs', targets: [{ format: formato }] },
    primitive: { topology: 'triangle-list' },
  });
  const bufer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const grupo = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufer } }] });
  const datos = new Float32Array(8);
  return {
    nombre: 'WebGPU',
    pintar(E) {
      datos.set([lienzo.width, lienzo.height, E.t, E.etapa, E.pasos, E.pliegues, E.k, E.dens]);
      device.queue.writeBuffer(bufer, 0, datos); // los 32 bytes viajan de JS a la GPU (una copia)
      const cmd = device.createCommandEncoder();
      const pase = cmd.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pase.setPipeline(pipeline);
      pase.setBindGroup(0, grupo);
      pase.draw(3);
      pase.end();
      device.queue.submit([cmd.finish()]);
    },
    sincronizar() { return device.queue.onSubmittedWorkDone(); },
    retirar() { try { ctx.unconfigure(); } catch { /* ya no estaba */ } bufer.destroy(); device.destroy(); },
  };
}

export function motorGL(lienzo) {
  const gl = lienzo.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('sin WebGL2');
  const compilar = (tipo, fuente) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, fuente);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('GLSL: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compilar(gl.VERTEX_SHADER, GLSL_VS));
  gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, GLSL));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('GLSL: ' + gl.getProgramInfoLog(prog));
  const vao = gl.createVertexArray();
  const loc = {};
  for (const n of ['res', 't', 'etapa', 'pasos', 'pliegues', 'k', 'dens']) loc[n] = gl.getUniformLocation(prog, n);
  return {
    nombre: 'WebGL2',
    pintar(E) {
      gl.viewport(0, 0, lienzo.width, lienzo.height);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(loc.res, lienzo.width, lienzo.height);
      gl.uniform1f(loc.t, E.t);
      gl.uniform1f(loc.etapa, E.etapa);
      gl.uniform1f(loc.pasos, E.pasos);
      gl.uniform1f(loc.pliegues, E.pliegues);
      gl.uniform1f(loc.k, E.k);
      gl.uniform1f(loc.dens, E.dens);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    sincronizar() {
      const px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // obliga a terminar
      return Promise.resolve();
    },
    retirar() { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); },
  };
}
