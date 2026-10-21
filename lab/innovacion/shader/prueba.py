#!/usr/bin/env python3
"""Compara el shader WGSL de shader.js con el GLSL, píxel a píxel, en cada etapa y con varios mandos.

WebGPU se pinta en una textura y se lee, sin lienzo (así funciona también en Chromium sin pantalla,
con SwiftShader). WebGL2 se lee con readPixels. Mismo método que lab/charlie-lente-gpu/prueba_shader.py.

Un fractal amplifica diferencias mínimas de redondeo, así que no se exige igualdad exacta:
sale 1 si en algún caso más del 0,5 % de los píxeles difiere en más de 16 de 255, o si la diferencia
media pasa de 2. También comprueba que el mismo enlace da la misma imagen dos veces (sin azar).
Necesita Playwright, numpy y Pillow. Sirve la raíz del repo en local: no sale nada a internet.

  python3 lab/innovacion/shader/prueba.py [--imagenes carpeta] [--poster]
"""
import argparse, asyncio, base64, json, os, sys
import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(AQUI)), 'charlie-video'))
from exportar import servir  # noqa: E402

W, H = 384, 288  # 384 × 4 bytes = 1536, múltiplo de 256 (lo que pide copyTextureToBuffer)

JS = r"""
async ({E, W, H}) => {
  const S = await import('/lab/innovacion/shader/shader.js');
  const msgs = [];
  const datos = new Float32Array([W, H, E.t, E.etapa, E.pasos, E.pliegues, E.k, E.dens]);
  // WebGL2
  const c = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); c.width = W; c.height = H;
  const gl = c.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  const m = S.motorGL(c);
  m.pintar(E);
  const pxgl = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pxgl);
  // WebGPU, en una textura
  let pxgpu = null;
  try {
    const ad = await navigator.gpu.requestAdapter();
    const dev = await ad.requestDevice();
    const mod = dev.createShaderModule({ code: S.WGSL });
    const info = await mod.getCompilationInfo();
    for (const x of info.messages) msgs.push(x.type + ' ' + x.lineNum + ': ' + x.message);
    const pip = await dev.createRenderPipelineAsync({ layout: 'auto',
      vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] } });
    const buf = dev.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(buf, 0, datos);
    const tex = dev.createTexture({ size: [W, H], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const sal = dev.createBuffer({ size: W * H * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder();
    const pase = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    pase.setPipeline(pip);
    pase.setBindGroup(0, dev.createBindGroup({ layout: pip.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] }));
    pase.draw(3); pase.end();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: sal, bytesPerRow: W * 4 }, [W, H]);
    dev.queue.submit([enc.finish()]);
    await sal.mapAsync(GPUMapMode.READ);
    pxgpu = new Uint8Array(sal.getMappedRange().slice(0));
    dev.destroy();
  } catch (e) { msgs.push(String(e)); }
  const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
  return { msgs, gl: b64(pxgl), gpu: pxgpu ? b64(pxgpu) : null };
}
"""

CASOS = [
    {'etapa': 1}, {'etapa': 2}, {'etapa': 3}, {'etapa': 3, 't': 7.3},
    {'etapa': 4, 'pliegues': 0}, {'etapa': 4, 'pliegues': 1}, {'etapa': 4, 'pliegues': 3}, {'etapa': 4},
    {'etapa': 4, 'k': 5.0},
    {'etapa': 5, 'pasos': 10}, {'etapa': 5},
    {'etapa': 6, 'pasos': 1}, {'etapa': 6, 'pasos': 20}, {'etapa': 6}, {'etapa': 6, 't': 12.5},
    {'etapa': 6, 'pliegues': 8}, {'etapa': 6, 'k': 9.0},
]


def caso(c):
    E = {'etapa': 6, 'pasos': 98, 'pliegues': 19, 'k': 7.1, 't': 0.0, 'dens': 1.0}
    E.update(c)
    return E


async def main(a):
    from playwright.async_api import async_playwright
    srv, base = servir()
    malos = 0
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'])
        p = await b.new_page()
        await p.goto(base + '/portada/marca/favicon.svg')
        for c in CASOS:
            E = caso(c)
            res = await p.evaluate(JS, {'E': E, 'W': W, 'H': H})
            gl = np.frombuffer(base64.b64decode(res['gl']), np.uint8).reshape(H, W, 4)[::-1, :, :3].astype(int)
            if not res['gpu']:
                print(json.dumps({'caso': c, 'avisos': res['msgs']}, ensure_ascii=False)); malos += 1; continue
            gp = np.frombuffer(base64.b64decode(res['gpu']), np.uint8).reshape(H, W, 4)[:, :, :3].astype(int)
            dif = np.abs(gl - gp).max(axis=2)
            mal = (dif > 16).mean() > 0.005 or dif.mean() > 2
            malos += int(mal)
            if a.imagenes:
                os.makedirs(a.imagenes, exist_ok=True)
                nombre = '_'.join(f'{k}{v}' for k, v in c.items())
                Image.fromarray(np.concatenate([gl, gp], axis=1).astype(np.uint8)).save(os.path.join(a.imagenes, nombre + '.png'))
            print(json.dumps({'caso': c, 'avisos': res['msgs'], 'brillo_gl': round(gl.mean(), 1), 'brillo_gpu': round(gp.mean(), 1),
                              'dif_media': round(dif.mean(), 3), 'px_dif_mas_16': round((dif > 16).mean() * 100, 3),
                              'dif_max': int(dif.max()), 'bien': not mal}, ensure_ascii=False), flush=True)
        # Sin azar: el mismo caso dos veces da lo mismo
        r1 = await p.evaluate(JS, {'E': caso({}), 'W': W, 'H': H})
        r2 = await p.evaluate(JS, {'E': caso({}), 'W': W, 'H': H})
        igual = r1['gl'] == r2['gl'] and r1['gpu'] == r2['gpu']
        print(json.dumps({'mismo_enlace_misma_imagen': igual}))
        malos += int(not igual)
        if a.poster:
            # Póster sin JavaScript: el original (etapa 6) a 1200 × 900, pintado en WebGL2
            res = await p.evaluate(JS, {'E': caso({'dens': 2.0}), 'W': 1200, 'H': 900})
            im = np.frombuffer(base64.b64decode(res['gl']), np.uint8).reshape(900, 1200, 4)[::-1, :, :3]
            Image.fromarray(im).save(os.path.join(AQUI, 'poster.jpg'), quality=82, optimize=True, progressive=True)
            print(json.dumps({'poster': os.path.getsize(os.path.join(AQUI, 'poster.jpg'))}))
        await b.close()
    srv.shutdown()
    print('igual' if not malos else f'{malos} casos distintos')
    return 1 if malos else 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--imagenes', help='guarda cada par (WebGL2 | WebGPU) en esta carpeta')
    ap.add_argument('--poster', action='store_true', help='rehace poster.jpg (el original, sin JavaScript)')
    sys.exit(asyncio.run(main(ap.parse_args())))
