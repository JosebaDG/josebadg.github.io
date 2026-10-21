#!/usr/bin/env python3
"""Compara el shader WGSL de lente-gpu.js con el GLSL de ../charlie-lente/lente.js, píxel a píxel.

WebGPU se pinta en una textura y se lee, sin lienzo: así funciona también en Chromium sin pantalla
(SwiftShader), donde un lienzo WebGPU no se puede presentar. WebGL2 se lee con readPixels.
Siete fotogramas (t, reloj y nivel) a 390 × 844, escala 2. Sale 1 si algún píxel difiere en más de 16
de 255 en algún canal (el ruido de 1/255 contra escalones es distinto en cada uno, por eso no es 0).
Necesita Playwright, numpy y Pillow. Sirve la raíz del repo en local: no sale nada a internet.

  python3 lab/charlie-lente-gpu/prueba_shader.py [--imagenes carpeta]
"""
import argparse, asyncio, json, os, sys
import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(AQUI), 'charlie-video'))
from exportar import servir  # noqa: E402

JS = r"""
async ({t, r, nivel}) => {
  const gl2 = await import('/lab/charlie-lente/lente.js');
  const gpu = await import('/lab/charlie-lente-gpu/lente-gpu.js');
  const ctx = (lienzo) => ({ lienzo, centro: () => ({ x: innerWidth / 2, y: innerHeight * 0.42 }),
    radio: () => Math.min(innerWidth, innerHeight) * 0.26, menosMovimiento: false, movil: true, nivel,
    pedir() {}, fallo() {} });
  // WebGL2
  const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
  const i = await gl2.iniciar(ctx(c));
  i.pintar(t, r);
  const W = c.width, H = c.height;
  const g = c.getContext('webgl2');
  const a = new Uint8Array(W * H * 4);
  g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, a);
  // WebGPU en una textura
  const ad = await navigator.gpu.requestAdapter();
  const d = await ad.requestDevice();
  const m = d.createShaderModule({ code: gpu.WGSL });
  const info = await m.getCompilationInfo();
  const msgs = info.messages.map((x) => `${x.type} ${x.lineNum}:${x.linePos} ${x.message}`);
  if (info.messages.some((x) => x.type === 'error')) return { msgs };
  const tp = d.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' },
    fragment: { module: m, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] } });
  const P = gl2.parametros(t, r, ctx(null), nivel);
  const datos = gpu.datosU(P, innerWidth, innerHeight, W / innerWidth);
  const bu = d.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  d.queue.writeBuffer(bu, 0, datos);
  const bg = d.createBindGroup({ layout: tp.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bu } }] });
  const tex = d.createTexture({ size: [W, H], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  const fila = Math.ceil(W * 4 / 256) * 256;
  const sal = d.createBuffer({ size: fila * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const e = d.createCommandEncoder();
  const pa = e.beginRenderPass({ colorAttachments: [{ view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
  pa.setPipeline(tp); pa.setBindGroup(0, bg); pa.draw(3); pa.end();
  e.copyTextureToBuffer({ texture: tex }, { buffer: sal, bytesPerRow: fila }, [W, H]);
  d.queue.submit([e.finish()]);
  await sal.mapAsync(GPUMapMode.READ);
  const b = new Uint8Array(sal.getMappedRange());
  const toB64 = (u8) => { let s = ''; for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000)); return btoa(s); };
  const gpuPx = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) gpuPx.set(b.subarray(y * fila, y * fila + W * 4), y * W * 4);
  return { W, H, msgs, gl: toB64(a), gpu: toB64(gpuPx) };
}
"""


async def main(a):
    import base64
    from playwright.async_api import async_playwright
    srv, base = servir()
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'])
        p = await b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        await p.goto(base + '/portada/marca/favicon.svg')
        malos = 0
        for t, r, nivel in [(0.0, 0, 1), (0.3, 1.0, 1), (0.6, 2.0, 1), (0.85, 3.2, 1), (1.0, 7.0, 1), (0.85, 3.2, 0), (0.85, 3.2, 2)]:
            res = await p.evaluate(JS, {'t': t, 'r': r, 'nivel': nivel})
            if 'gl' not in res:
                print(json.dumps({'t': t, 'msgs': res['msgs']}, ensure_ascii=False)); malos += 1; continue
            W, H = res['W'], res['H']
            gl = np.frombuffer(base64.b64decode(res['gl']), np.uint8).reshape(H, W, 4)[::-1, :, :3].astype(int)
            gp = np.frombuffer(base64.b64decode(res['gpu']), np.uint8).reshape(H, W, 4)[:, :, :3].astype(int)
            dif = np.abs(gl - gp).max(axis=2)
            if a.imagenes:
                os.makedirs(a.imagenes, exist_ok=True)
                Image.fromarray(np.concatenate([gl, gp], axis=1).astype(np.uint8)).save(os.path.join(a.imagenes, f't{t}_n{nivel}.png'))
            malos += int((dif > 16).any())
            print(json.dumps({'t': t, 'r': r, 'nivel': nivel, 'px': f'{W}x{H}', 'avisos': res['msgs'],
                              'brillo_gl': round(gl.mean(), 2), 'brillo_gpu': round(gp.mean(), 2),
                              'dif_media': round(dif.mean(), 3), 'px_dif_mas_3': round((dif > 3).mean() * 100, 3),
                              'px_dif_mas_16': round((dif > 16).mean() * 100, 3), 'dif_max': int(dif.max())}, ensure_ascii=False), flush=True)
        await b.close()
    srv.shutdown()
    print('igual' if not malos else f'{malos} fotogramas distintos')
    return 1 if malos else 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--imagenes', help='guarda cada par (WebGL2 | WebGPU) en esta carpeta')
    sys.exit(asyncio.run(main(ap.parse_args())))
