#!/usr/bin/env python3
"""Hoja de contacto de la lente en perspectiva: 12 momentos de t (0 a 1) en 4 × 3, con su t abajo.

Basado en la idea de render.ts de pdoom-video (Giacomo Magnanini, github.com/mexicat/pdoom-video, MIT):
se avanza t a mano y se fotografía cada fotograma, así que sale igual en cualquier equipo.
Copiado de lab/charlie-lente/hoja.py (sin tocar el original), con motor=gl para que salga igual
en cualquier navegador. Reutiliza servir() y hoja() de lab/charlie-video/exportar.py. Necesita Playwright y Pillow.
Sirve la raíz del repo en local: no sale nada a internet.

  python3 lab/charlie-lente-perspectiva/hoja.py                 # WebKit 390 × 844, nivel 1 (móvil)
  python3 lab/charlie-lente-perspectiva/hoja.py --nivel 2 --navegador chromium --ancho 1280 --alto 800

Saca lab/charlie-lente-perspectiva/hoja.jpg y lab/charlie-lente-perspectiva/poster.jpg (el momento t 0,85).
"""
import argparse, asyncio, json, os, sys, tempfile
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(AQUI), 'charlie-video'))
from exportar import servir, hoja  # noqa: E402

MOMENTOS = 12


async def principal(a):
    from playwright.async_api import async_playwright
    srv, base = servir()
    try:
        async with async_playwright() as pw:
            nav = await getattr(pw, a.navegador).launch()
            ctx = await nav.new_context(viewport={'width': a.ancho, 'height': a.alto}, device_scale_factor=a.escala,
                                        reduced_motion='no-preference')
            p = await ctx.new_page()
            errores = []
            p.on('pageerror', lambda e: errores.append(str(e)))
            p.on('console', lambda m: m.type == 'error' and errores.append(m.text))
            await p.goto(f'{base}/lab/charlie-lente-perspectiva/?ui=0&mm=0&motor=gl&nivel={a.nivel}&t=0')
            await p.wait_for_function("['1', 'fallo'].includes(document.documentElement.dataset.listo)", timeout=60000)
            if await p.evaluate('document.documentElement.dataset.listo') == 'fallo':
                raise SystemExit('La lente no ha cargado: ' + await p.evaluate("document.getElementById('estado').textContent"))
            tmp = tempfile.mkdtemp(prefix='perspectiva-')
            fotos, momentos = [], []
            for i in range(MOMENTOS):
                t = round(i / (MOMENTOS - 1), 3)
                r = round(i * 0.6, 2)   # el reloj también avanza: se ve girar el lado brillante del anillo y la onda de cada latido
                await p.evaluate('([t, r]) => lente.fotograma(t, r)', [t, r])
                ruta = os.path.join(tmp, f'{i:02d}.png')
                await p.screenshot(path=ruta)
                fotos.append(ruta)
                momentos.append({'t': t, 'r': r})
            await p.evaluate('([t, r]) => lente.fotograma(t, r)', [0.85, 3.0])
            poster = os.path.join(tmp, 'poster.png')
            await p.screenshot(path=poster)
            await nav.close()
    finally:
        srv.shutdown()
    tam = hoja(fotos, momentos, a.celda, os.path.join(AQUI, 'hoja.jpg'))
    ancho = 540
    im = Image.open(poster).convert('RGB')
    im.resize((ancho, round(ancho * im.height / im.width)), Image.LANCZOS).save(os.path.join(AQUI, 'poster.jpg'), quality=80, optimize=True, progressive=True)
    print(json.dumps({'hoja_px': tam, 'momentos': momentos, 'errores': errores}, ensure_ascii=False))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--navegador', choices=['webkit', 'chromium'], default='webkit')
    ap.add_argument('--ancho', type=int, default=390)
    ap.add_argument('--alto', type=int, default=844)
    ap.add_argument('--escala', type=float, default=2)
    ap.add_argument('--nivel', choices=['0', '1', '2'], default='1')
    ap.add_argument('--celda', type=int, default=240)
    asyncio.run(principal(ap.parse_args()))
