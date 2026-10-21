#!/usr/bin/env python3
"""Prueba de determinismo para escenas del visor (idea de xpdesk.py check, BLISS).

Pinta N fotogramas de una escena en orden y luego barajados, en dos navegadores nuevos,
y compara el hash de cada fotograma. Si una escena guarda estado entre fotogramas
(Math.random sin semilla, reloj real, acumuladores), los hashes no coinciden.

  python3 lab/charlie-visor/determinismo.py --raiz . --escena curvatura --n 12   (desde la raíz del repo)

Sale 0 si todo coincide; 1 si algún fotograma difiere (y dice cuáles); 2 si la escena no carga,
si el visor no la conoce o si todos los fotogramas salen iguales (una pantalla vacía también «coincide», y eso no prueba nada).
Contrato que comprueba: lab/charlie-visor/CONTRATO.md. En cada PR la corre .github/workflows/escenas.yml.
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
    if await p.evaluate('document.documentElement.dataset.listo') == 'fallo':
        motivo = await p.text_content('#estado')
        await nav.close()
        raise NoCarga(motivo or 'sin detalle')
    # El visor abre «curvatura» si no conoce el nombre: sin esto, una escena que falte en ESCENAS pasaría probando otra
    viva = await p.evaluate('visor.estado().escena')
    if viva != a.escena:
        await nav.close()
        raise NoCarga(f'el visor ha abierto «{viva}»; falta «{a.escena}» en ESCENAS de visor.js')
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


class NoCarga(Exception):
    pass


async def principal(a):
    base = servir(a.raiz)
    orden = list(range(a.n))
    barajado = orden[:]
    random.Random(7).shuffle(barajado)
    async with async_playwright() as pw:
        try:
            h1, ms1 = await pasada(pw, base, a, orden)
            h2, ms2 = await pasada(pw, base, a, barajado)
        except NoCarga as e:
            print(f'{a.escena} en {a.navegador}: no ha cargado ({e})')
            return 2
    if len(set(h1.values())) == 1:
        print(f'{a.escena} en {a.navegador}: los {a.n} fotogramas son iguales; la escena no se está pintando')
        return 2
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
