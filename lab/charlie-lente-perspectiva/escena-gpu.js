// Lente en perspectiva, versión WebGPU (Charlie, laboratorio). La misma escena que escena-gl.js,
// con los mismos números (comun.js) y las mismas dos pasadas: primero la lente, sobre negro, y encima
// la malla con suma de luz. Misma interfaz, para que pagina.js las trate igual.

import { tramo, late, NIVELES, limitar, construirMalla, parametros, datosMalla, datosLente, WGSL_MALLA, WGSL_LENTE } from './comun.js';

export { tramo, late, NIVELES };

const ESPERA_MAX = 3000; // ms: si la GPU no contesta en este tiempo, la medida se da por perdida

async function modulo(device, code) {
  const m = device.createShaderModule({ code });
  const info = await m.getCompilationInfo();
  const errores = info.messages.filter((x) => x.type === 'error');
  if (errores.length) throw new Error('shader: ' + errores.map((x) => `${x.lineNum}:${x.linePos} ${x.message}`).join('; '));
  return m;
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
  const [mMalla, mLente] = await Promise.all([modulo(device, WGSL_MALLA), modulo(device, WGSL_LENTE)]);
  const suma = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
  const tubMalla = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: mMalla, entryPoint: 'vsMalla',
      buffers: [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }, { shaderLocation: 1, offset: 8, format: 'float32x2' }] }],
    },
    fragment: { module: mMalla, entryPoint: 'fsMalla', targets: [{ format: formato, blend: suma }] },
    primitive: { topology: 'triangle-list' },
  });
  const tubLente = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mLente, entryPoint: 'vsLente' },
    fragment: { module: mLente, entryPoint: 'fsLente', targets: [{ format: formato }] },
    primitive: { topology: 'triangle-list' },
  });
  const dm = new Float32Array(36), dl = new Float32Array(36);
  const bufM = device.createBuffer({ size: dm.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bufL = device.createBuffer({ size: dl.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const grupoM = device.createBindGroup({ layout: tubMalla.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufM } }] });
  const grupoL = device.createBindGroup({ layout: tubLente.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufL } }] });
  const errorValidacion = await device.popErrorScope();
  if (errorValidacion) throw new Error('WebGPU: ' + errorValidacion.message);

  let retirada = false, perdida = null;
  device.lost.then((info) => {
    perdida = info && info.message ? info.message : 'sin detalle';
    if (!retirada && ctx.fallo) ctx.fallo(info && info.message ? info.message : '');
  });

  let nivel = limitar(Number.isInteger(ctx.nivel) ? ctx.nivel : (ctx.movil ? 1 : 2), 0, NIVELES.length - 1);
  let bufV = null, bufI = null, cuantos = 0, L = 0, deNivel = -1;
  // La malla de cada nivel se sube al cambiar de nivel, nunca dentro de pintar()
  function cargarMalla() {
    if (deNivel === nivel) return;
    const m = construirMalla(nivel);
    if (bufV) bufV.destroy();
    if (bufI) bufI.destroy();
    bufV = device.createBuffer({ size: m.v.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(bufV, 0, m.v);
    // Seis índices por tramo: el tamaño siempre es múltiplo de 4 bytes, como pide writeBuffer
    bufI = device.createBuffer({ size: m.idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(bufI, 0, m.idx);
    cuantos = m.idx.length; L = m.L; deNivel = nivel;
  }

  let ancho = 0, alto = 0, dpr = 1;
  function medir() {
    dpr = Math.min(devicePixelRatio || 1, NIVELES[nivel].dpr);
    ancho = innerWidth; alto = innerHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    cargarMalla();
  }

  function pintar(t, reloj) {
    const F = parametros(t, reloj, ctx, nivel, ancho, alto);
    const escala = lienzo.width / ancho;
    device.queue.writeBuffer(bufM, 0, datosMalla(F, lienzo, escala, L, dm));
    device.queue.writeBuffer(bufL, 0, datosLente(F, lienzo, dl));
    const cod = device.createCommandEncoder();
    const pase = cod.beginRenderPass({
      colorAttachments: [{ view: gpu.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pase.setPipeline(tubLente);
    pase.setBindGroup(0, grupoL);
    pase.draw(3);
    pase.setPipeline(tubMalla);
    pase.setBindGroup(0, grupoM);
    pase.setVertexBuffer(0, bufV);
    pase.setIndexBuffer(bufI, 'uint16');
    pase.drawIndexed(cuantos);
    pase.end();
    device.queue.submit([cod.finish()]);
  }

  // Cuadro vacío: el mismo pase sobre el mismo lienzo, solo borrando, sin dibujar
  function pintarVacio() {
    const cod = device.createCommandEncoder();
    const pase = cod.beginRenderPass({
      colorAttachments: [{ view: gpu.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
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

  // Espera a que la GPU acabe lo enviado, con tiempo máximo (como en ../charlie-lente-gpu/)
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
    pintar, pintarVacio, medir, bajar, retirar, sincronizar, ponerNivel,
    get nivel() { return nivel; },
    get resolucion() { return { ancho: lienzo.width, alto: lienzo.height, dpr }; },
  };
}
