#!/usr/bin/env python3
"""Prueba de determinismo para escenas del visor (idea de xpdesk.py check, BLISS).

Pinta N fotogramas de una escena en orden y luego barajados, en dos navegadores nuevos,
y compara el hash de cada fotograma. Si una escena guarda estado entre fotogramas
(Math.random sin semilla, reloj real, acumuladores), los hashes no coinciden.

  python3 lab/charlie-visor/determinismo.py --raiz . --escena curvatura --n 12   (desde la raíz del repo)

Sale 0 si todo coincide; 1 si algún fotograma difiere (y dice cuáles).
"""
import argparse, asyncio, functools, hashlib, http.server, random, sys, threading, time
from playwright.async_api import async_playwright


def servir(raiz):
    class Mudo(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Mudo, directory=raiz)
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{s.server_address[1]}'


async def pasada(pw, base, a, orden):
    nav = await getattr(pw, a.navegador).launch()
    ctx = await nav.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
    p = await ctx.new_page()
    await p.goto(f'{base}/lab/charlie-visor/?escena={a.escena}&ui=0&mm=0')
    await p.wait_for_function("['1','fallo'].includes(document.documentElement.dataset.listo)", timeout=90000)
    tramo = await p.evaluate('visor.tramo()')
    hashes, t0 = {}, time.time()
    for i in orden:
        t = tramo['desde'] + (tramo['hasta'] - tramo['desde']) * i / (a.n - 1)
        r = i / 30 if tramo['late'] else 0
        await p.evaluate('([t, r]) => visor.fotograma(t, r)', [t, r])
        png = await p.screenshot()
        hashes[i] = hashlib.sha256(png).hexdigest()[:16]
    ms = (time.time() - t0) * 1000 / len(orden)
    await nav.close()
    return hashes, ms


async def principal(a):
    base = servir(a.raiz)
    orden = list(range(a.n))
    barajado = orden[:]
    random.Random(7).shuffle(barajado)
    async with async_playwright() as pw:
        h1, ms1 = await pasada(pw, base, a, orden)
        h2, ms2 = await pasada(pw, base, a, barajado)
    malos = [i for i in orden if h1[i] != h2[i]]
    print(f'{a.escena} en {a.navegador}: {a.n} fotogramas, {ms1:.0f} ms/fotograma en orden, {ms2:.0f} barajados')
    print('distintos:', malos if malos else 'ninguno')
    return 1 if malos else 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--raiz', required=True)
    ap.add_argument('--escena', default='curvatura')
    ap.add_argument('--n', type=int, default=12)
    ap.add_argument('--navegador', default='chromium', choices=['chromium', 'webkit', 'firefox'])
    sys.exit(asyncio.run(principal(ap.parse_args())))
