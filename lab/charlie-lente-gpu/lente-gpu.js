// Lente gravitacional en WebGPU (Charlie, laboratorio de animación y vídeo; paso 3 de la ruta).
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT:
// la idea y las cuentas de app/src/scenes/spacetime-lens.ts.
//
// Es la misma escena que ../charlie-lente/lente.js (WebGL2), con el shader portado de GLSL a WGSL
// línea a línea, para medir las dos en el mismo móvil y decidir con el dato. Las cuentas en JS
// (qué pasa con cada t y con el reloj) se comparten: vienen de lente.js, no se copian.
//
// Mismo contrato que las escenas de /motor/ (tramo, late e iniciar(ctx) → { pintar(t, reloj),
// medir(), bajar(), retirar() }), más sincronizar() (devuelve una promesa: la GPU ha acabado; se
// rechaza si se pierde el dispositivo o tarda más de ESPERA_MAX) y ponerNivel() para medir. Sin azar: un enlace es un fotograma exacto.
//
// Diferencias con GLSL que importan aquí:
// - @builtin(position) tiene el origen arriba a la izquierda, así que no hay que dar la vuelta a y.
// - dFdx/dFdy pasan a dpdx/dpdy, y WGSL exige que se llamen en flujo uniforme: se calculan antes
//   de cualquier if que dependa del píxel.
// - pow() con base negativa no está definido en WGSL: los cuadrados van como x * x.

import { NIVELES, latido, parametros } from '../charlie-lente/lente.js';

export const tramo = [0, 1];
export const late = true;
export { NIVELES };

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
// Tiempo máximo de sincronizar(): un cuadro en el móvil tarda unos 2 ms y por software unos cientos;
// 3 s solo se pasan si la GPU no va a contestar.
const ESPERA_MAX = 3000;

// Los 80 bytes del struct U del shader, en su orden (ancho y alto en px CSS, escala = px del lienzo por px CSS)
export function datosU(P, ancho, alto, escala, datos = new Float32Array(20)) {
  datos.set([ancho, alto, P.c.x, P.c.y, P.fuente[0], P.fuente[1], P.fuente[2], escala,
    P.thE, P.rs, P.swirl, P.ring, P.ringPh, P.heat, P.kick, P.time, P.paso, P.menor, P.estrellas, 0]);
  return datos;
}

// Exportado para poder probar el shader sin lienzo (pintando en una textura y leyéndola).
export const WGSL = /* wgsl */ `
struct U {
  res: vec2f,        // tamaño en px CSS
  c: vec2f,          // centro de la lente (px CSS, y hacia abajo)
  fuente: vec3f,     // punto dorado detrás: desplazamiento desde el centro (px) y radio (px)
  dpr: f32,          // px del lienzo por px CSS
  thE: f32,          // radio de Einstein (px)
  rs: f32,           // radio de la sombra (px)
  swirl: f32,        // giro del arrastre en el anillo de Einstein (rad)
  ring: f32,         // intensidad del anillo de fotones
  ringPh: f32,       // ángulo del lado brillante (Doppler)
  heat: f32,         // bruma cálida pegada al agujero
  kick: f32,         // latido
  time: f32,         // reloj (s)
  paso: f32,         // px por división de la rejilla
  menor: f32,        // subdivisiones de la rejilla (nivel)
  estrellas: f32,    // campo de estrellas (nivel)
  _relleno: f32,
};
@group(0) @binding(0) var<uniform> u: U;

const HUESO = vec3f(0.93, 0.89, 0.82);
const ORO = vec3f(0.95, 0.74, 0.36);
const BRASA = vec3f(1.0, 0.46, 0.16);
const SANGRE = vec3f(0.55, 0.08, 0.05);

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  // Un triángulo que cubre la pantalla, sin búfer de vértices
  let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}

// Cobertura de una rejilla de líneas de anchura relativa 1/N, filtrada por caja (I. Quilez).
// w = ancho del píxel en unidades de p (de dpdx/dpdy, calculado fuera).
fn gridCov(p: vec2f, N: f32, w: vec2f) -> f32 {
  let a = p + 0.5 * w;
  let b = p - 0.5 * w;
  let i = (floor(a) + min(fract(a) * N, vec2f(1.0)) - floor(b) - min(fract(b) * N, vec2f(1.0))) / (N * w);
  return 1.0 - (1.0 - i.x) * (1.0 - i.y);
}
fn lineCov(p: f32, N: f32, w: f32) -> f32 {
  let a = p + 0.5 * w;
  let b = p - 0.5 * w;
  return (floor(a) + min(fract(a) * N, 1.0) - floor(b) - min(fract(b) * N, 1.0)) / (N * w);
}
fn hash(q: vec2f) -> f32 {
  var p = fract(q * vec2f(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Estrellas fijas en el plano de la fuente (igual que en WebGL2)
fn estrellas(s: vec2f, tam: f32) -> f32 {
  let CEL = 26.0;
  let c = floor(s / CEL);
  let rad = clamp(0.8 * tam, 0.8, CEL * 0.4);
  let flujo = 0.64 / (rad * rad);
  var lum = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let k = c + vec2f(f32(i), f32(j));
      let h = hash(k);
      let pos = (k + 0.15 + 0.7 * vec2f(hash(k + 7.1), hash(k + 3.7))) * CEL;
      let dd = s - pos;
      let b = step(0.45, h) * (0.25 + 1.6 * pow(hash(k + 1.3), 5.0));
      lum += b * exp(-dot(dd, dd) / (rad * rad));
    }
  }
  return lum * min(flujo, 1.0);
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let p = frag.xy / u.dpr;
  let d = p - u.c;
  let r = length(d);

  // ---- lente: de la imagen al plano de la fuente
  let k = u.thE * u.thE / max(r * r, 1e-2);
  let sw = u.swirl * min(k, 6.0);
  let s = mat2x2f(cos(sw), sin(sw), -sin(sw), cos(sw)) * (d * (1.0 - k));

  // ---- rejilla, con los ejes más marcados y apagándose hacia fuera
  let q = s / u.paso;
  let N = u.paso / 1.1;
  let wq = max(abs(dpdx(q)), abs(dpdy(q))) + 1e-5;
  let wl = abs(dpdx(q)) + abs(dpdy(q)) + 1e-5;
  let g = gridCov(q, N, wq);
  let Na = N * 0.55;
  let ax = max(lineCov(q.x + 0.5 / Na, Na, wl.x) * step(abs(q.x), 0.5),
               lineCov(q.y + 0.5 / Na, Na, wl.y) * step(abs(q.y), 0.5));
  let mn = gridCov(q * 5.0, N / 5.0, wq * 5.0);
  let lejos = exp(-length(q) / 7.0);
  let lum = (0.24 * g + 0.34 * ax + 0.07 * mn * u.menor) * lejos;
  let ws = fwidth(s);
  let tam = max(ws.x, ws.y);

  var col = vec3f(0.025, 0.022, 0.03) * (1.0 - smoothstep(0.0, max(u.res.x, u.res.y) * 0.7, r));
  col += mix(HUESO * 0.6, ORO, 0.3) * lum;
  if (u.estrellas > 0.0) { col += HUESO * 0.85 * estrellas(s, tam) * u.estrellas; }

  // ---- el punto dorado, detrás del agujero: alineado con él, se vuelve el anillo de Einstein
  let fs2 = s - u.fuente.xy;
  let f2 = dot(fs2, fs2) / (u.fuente.z * u.fuente.z);
  col += ORO * (0.9 * exp(-f2) + 0.9 * exp(-f2 * 9.0)) * (1.0 + 0.35 * u.kick);

  // ---- bruma cálida pegada al agujero
  let ang = atan2(d.y, d.x);
  let hz = u.heat * exp(-max(r - u.rs, 0.0) / (u.rs * 0.9 + 1.0)) * (0.7 + 0.3 * sin(ang * 3.0 - u.time * 2.0));
  col += SANGRE * 0.35 * hz + ORO * 0.05 * hz;

  // ---- sombra y anillo de fotones
  if (u.rs > 0.0) {
    let aa = 1.2;
    col *= smoothstep(u.rs - aa, u.rs + aa, r);
    let dop = 0.55 + 0.45 * cos(ang - u.ringPh);
    let x = r - u.rs;
    let nucleo = exp(-x * x / (2.0 * 1.3 * 1.3)) * step(-2.5, x);
    let brillo = exp(-max(x, 0.0) / (5.0 + u.rs * 0.05)) * smoothstep(-2.0, 0.5, x);
    let ancho = exp(-max(x, 0.0) / (u.rs * 0.35 + 8.0)) * smoothstep(-2.0, 2.0, x);
    let x2 = r - u.rs * 1.045;
    let segundo = exp(-(x2 * x2) / 1.2);
    let anillo = vec3f(1.9, 1.45, 1.05) * nucleo * (0.45 + 0.8 * dop)
               + BRASA * 0.95 * brillo * (0.35 + dop)
               + ORO * 0.3 * ancho * (0.4 + dop)
               + vec3f(1.2, 0.7, 0.4) * segundo * 0.5 * dop;
    col += anillo * u.ring * (1.0 + 0.5 * u.kick);
  }

  // Recorte suave de las luces y un poco de ruido para que el degradado no haga escalones
  col = 1.0 - exp(-col * 1.15);
  col += (hash(frag.xy) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
`;

// ¿Hay WebGPU de verdad? (navigator.gpu puede existir y no dar adaptador)
export async function hayWebGPU() {
  if (!('gpu' in navigator)) return false;
  try { return !!(await navigator.gpu.requestAdapter()); } catch { return false; }
}

export async function iniciar(ctx) {
  const lienzo = ctx.lienzo;
  if (!('gpu' in navigator)) throw new Error('este navegador no tiene WebGPU');
  const adaptador = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adaptador) throw new Error('WebGPU no da adaptador en este equipo');
  const device = await adaptador.requestDevice();
  const gpu = lienzo.getContext('webgpu');
  if (!gpu) throw new Error('el lienzo no da contexto WebGPU');
  const formato = navigator.gpu.getPreferredCanvasFormat();
  gpu.configure({ device, format: formato, alphaMode: 'opaque' });

  device.pushErrorScope('validation');
  const modulo = device.createShaderModule({ code: WGSL });
  const info = await modulo.getCompilationInfo();
  const errores = info.messages.filter((m) => m.type === 'error');
  if (errores.length) throw new Error('shader: ' + errores.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('; '));
  const tuberia = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: modulo, entryPoint: 'vs' },
    fragment: { module: modulo, entryPoint: 'fs', targets: [{ format: formato }] },
    primitive: { topology: 'triangle-list' },
  });
  const datos = new Float32Array(20); // 80 bytes: el struct U
  const bufU = device.createBuffer({ size: datos.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const grupo = device.createBindGroup({ layout: tuberia.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufU } }] });
  const errorValidacion = await device.popErrorScope();
  if (errorValidacion) throw new Error('WebGPU: ' + errorValidacion.message);

  let retirada = false, perdida = null;
  device.lost.then((info) => {
    perdida = info && info.message ? info.message : 'sin detalle';
    if (!retirada) ctx.fallo(info && info.message ? info.message : '');
  });

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
    datosU(P, ancho, alto, lienzo.width / ancho, datos);
    device.queue.writeBuffer(bufU, 0, datos);
    const cod = device.createCommandEncoder();
    const pase = cod.beginRenderPass({
      colorAttachments: [{ view: gpu.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pase.setPipeline(tuberia);
    pase.setBindGroup(0, grupo);
    pase.draw(3);
    pase.end();
    device.queue.submit([cod.finish()]);
  }

  function bajar() {
    if (nivel <= 0) return false;
    nivel--;
    medir();
    return true;
  }
  function ponerNivel(x) { nivel = limitar(x, 0, NIVELES.length - 1); medir(); }

  // Espera a que la GPU acabe lo enviado: para medir milisegundos por fotograma.
  // Con tiempo máximo: si el dispositivo se pierde a mitad, onSubmittedWorkDone() puede no volver
  // nunca (con WebGPU por software, en un equipo de pruebas, se cae el proceso de la GPU y «Medir las dos» se
  // quedaba colgado). Se rechaza si se pierde el dispositivo o si pasan ms milisegundos sin respuesta,
  // y quien mide lo da por «sin dato».
  function sincronizar(ms = ESPERA_MAX) {
    if (perdida !== null) return Promise.reject(new Error(`se ha perdido la GPU (${perdida})`));
    let reloj = 0;
    const tope = new Promise((_, mal) => {
      reloj = setTimeout(() => {
        const e = new Error(`la GPU no ha contestado en ${(ms / 1000).toLocaleString('es-ES')} s`);
        e.name = 'TimeoutError';
        mal(e);
      }, ms);
    });
    const perdido = device.lost.then((info) => { throw new Error(`se ha perdido la GPU (${info && info.message ? info.message : 'sin detalle'})`); });
    return Promise.race([device.queue.onSubmittedWorkDone(), perdido, tope]).finally(() => clearTimeout(reloj));
  }

  function retirar() {
    retirada = true;
    try { gpu.unconfigure(); } catch { /* ya no estaba */ }
    device.destroy();
  }

  medir();
  return {
    pintar, medir, bajar, retirar, sincronizar, ponerNivel,
    get nivel() { return nivel; },
    get resolucion() { return { ancho: lienzo.width, alto: lienzo.height, dpr }; },
  };
}
