#!/usr/bin/env python3
"""Compara WebGL2 y WebGPU de lab/charlie-lente-perspectiva píxel a píxel, en Chromium con WebGPU
por software (SwiftShader). El lienzo WebGPU se sustituye por una textura que se puede leer
(COPY_SRC); WebGL2 se lee con una captura del mismo tamaño. Uso: python3 lab/charlie-lente-perspectiva/comparar.py [t,...] (desde la raíz del repo)"""
import asyncio, base64, io, os, sys
import numpy as np
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RAIZ, 'lab', 'charlie-video'))
from exportar import servir  # noqa: E402

GPU = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan']
SHIM = r"""
(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) {
    if (tipo !== 'webgpu') return orig.call(this, tipo, ...resto);
    const lienzo = this; let dev = null, fmt = null, tex = null;
    window.__leerGPU = async () => {
      const w = tex.width, h = tex.height, fila = Math.ceil(w * 4 / 256) * 256;
      const buf = dev.createBuffer({ size: fila * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const cod = dev.createCommandEncoder();
      cod.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: fila }, [w, h]);
      dev.queue.submit([cod.finish()]);
      await buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buf.getMappedRange());
      const out = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) out.set(src.subarray(y * fila, y * fila + w * 4), y * w * 4);
      buf.unmap();
      let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
      return { w, h, fmt, datos: btoa(s) };
    };
    return {
      configure(o) { dev = o.device; fmt = o.format; },
      unconfigure() {},
      getCurrentTexture() {
        if (!tex || tex.width !== lienzo.width || tex.height !== lienzo.height) {
          tex = dev.createTexture({ size: [lienzo.width, lienzo.height], format: fmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        }
        return tex;
      },
    };
  };
})();
"""


async def main():
    from playwright.async_api import async_playwright
    ts = sys.argv[1] if len(sys.argv) > 1 else '0,0.35,0.6,0.85,1'
    srv, base = servir()
    peor = 0
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=GPU)
        c = await b.new_context(viewport={'width': 640, 'height': 400}, device_scale_factor=1)
        await c.add_init_script(SHIM)
        p = await c.new_page()
        err = []
        p.on('pageerror', lambda e: err.append(str(e)))
        p.on('console', lambda m: err.append(m.text) if m.type == 'error' else None)
        for t in ts.split(','):
            imgs = {}
            for motor in ('gpu', 'gl'):
                await p.goto(f'{base}/lab/charlie-lente-perspectiva/?t={t}&r=3.2&motor={motor}&nivel=2&ui=0')
                await p.wait_for_function("['1','fallo'].includes(document.documentElement.dataset.listo)", timeout=60000)
                pinta = await p.evaluate("window.lente.motores.activo")
                assert pinta == motor, (t, motor, pinta, await p.evaluate("document.getElementById('estado').textContent"))
                if motor == 'gpu':
                    r = await p.evaluate('window.__leerGPU()')
                    a = np.frombuffer(base64.b64decode(r['datos']), np.uint8).reshape(r['h'], r['w'], 4)[:, :, :3]
                    if r['fmt'].startswith('bgra'):
                        a = a[:, :, ::-1]
                else:
                    png = await p.locator('#lienzoGL').screenshot()
                    a = np.asarray(Image.open(io.BytesIO(png)).convert('RGB'))
                imgs[motor] = a.astype(int)
            d = np.abs(imgs['gpu'] - imgs['gl'])
            peor = max(peor, d.max())
            Image.fromarray(np.concatenate([imgs['gpu'], imgs['gl']], 1).astype(np.uint8)).save(f'/tmp/perspectiva_comparar_{t}.png')
            print(f't={t}: media {d.mean():.3f}, p99 {np.percentile(d, 99):.0f}, máx {d.max()}, '
                  f'píxeles con >8 de diferencia {100 * (d.max(2) > 8).mean():.3f} %, brillo gpu {imgs["gpu"].mean():.1f} gl {imgs["gl"].mean():.1f}')
        print('errores:', err[:5])
        await b.close()
    srv.shutdown()

asyncio.run(main())
