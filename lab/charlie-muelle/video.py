#!/usr/bin/env python3
"""Vídeo comparativo del muelle en T: el mismo gesto brusco sin muelle y con él, lado a lado.

Como exportar.py de lab/charlie-video/ (idea de render.ts de pdoom-video, Giacomo Magnanini, MIT): no se graba
la pantalla. Abre /lab/charlie-muelle/?ui=0 dos veces con el reloj falso de Playwright, hace el gesto «golpe»
(de T 0,2 a T 1 en 4 cuadros de 1/60 s) y fotografía cada cuadro de 1/60 s. Saca en clips/:

  muelle-golpe.mp4   lado a lado: el gesto a velocidad real (30 fps) y, detrás, el mismo tramo a 1/4
  muelle-poster.jpg  el cuadro en que la versión sin muelle ya ha llegado y la otra está en plena explosión

  python3 lab/charlie-muelle/video.py [--preset medio] [--navegador chromium]

Necesita Playwright, ffmpeg y Pillow. Chromium usa SwiftShader para que el big bang se pinte sin GPU.
"""
import argparse, asyncio, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prueba_muelle as pm   # noqa: E402  (servidor, reloj falso y gesto: los mismos que la prueba)

AQUI = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(AQUI, 'clips')
ANTES, DESPUES = 20, 96          # cuadros de 1/60 s antes y después del gesto
LENTA = (ANTES - 2, ANTES + 50)  # el tramo que se repite a 1/4


def fuente(px):
    for ruta in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/Library/Fonts/Arial Bold.ttf'):
        if os.path.exists(ruta):
            return ImageFont.truetype(ruta, px)
    return ImageFont.load_default()


async def grabar(pw, base, consulta, carpeta, a):
    b, p, errores = await pm.abrir(pw, a.navegador, base, f'ui=0&{consulta}', ancho=a.ancho, alto=a.alto)
    reloj = pm.Reloj(p)
    est = await pm.esperar_bigbang(p, reloj)
    if est != 'viva':
        raise RuntimeError(f'el big bang no ha cargado ({est})')
    await p.evaluate(f'scrollTo(0, ({pm.Y_DE})(0.2)); dispatchEvent(new Event("scroll"))')
    for _ in range(90):
        await reloj.cuadro()
    y0 = await p.evaluate(f'({pm.Y_DE})(0.2)')
    y1 = await p.evaluate(f'({pm.Y_DE})(1)')
    ys = [y0] * ANTES + [y0 + (y1 - y0) * k / 4 for k in range(1, 5)] + [y1] * DESPUES
    fotos, Ts = [], []
    for i, y in enumerate(ys):
        await p.evaluate(f'scrollTo(0, {y}); dispatchEvent(new Event("scroll"))')
        await reloj.cuadro()
        ruta = os.path.join(carpeta, f'{i:05d}.png')
        await p.screenshot(path=ruta)
        fotos.append(ruta)
        Ts.append(await p.evaluate('motor.T()'))
    await b.close()
    if errores:
        raise RuntimeError(f'errores en la página: {errores[:3]}')
    return fotos, Ts


def rotular(ruta, titulo, T, letra, chica, e):
    im = Image.open(ruta).convert('RGB')
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, im.width, 64 * e), fill=(0, 0, 0))
    d.text((14 * e, 10 * e), titulo, font=letra, fill=(240, 240, 240))
    d.text((14 * e, 38 * e), f'T del motor {T:.2f}'.replace('.', ','), font=chica, fill=(71, 214, 207))
    return im


async def principal(a):
    from playwright.async_api import async_playwright
    srv, base = pm.servir()
    tmp = tempfile.mkdtemp(prefix='muelle-video-')
    try:
        async with async_playwright() as pw:
            for sub in ('a', 'b'):
                os.makedirs(os.path.join(tmp, sub))
            izq, Ti = await grabar(pw, base, 'muelle=0', os.path.join(tmp, 'a'), a)
            der, Td = await grabar(pw, base, f'preset={a.preset}', os.path.join(tmp, 'b'), a)
    finally:
        srv.shutdown()
    e = round(Image.open(izq[0]).width / a.ancho)   # escala del dispositivo (2 en móvil)
    letra, chica = fuente(22 * e), fuente(17 * e)
    lado = os.path.join(tmp, 'lado')
    os.makedirs(lado)
    hueco = 8 * e
    juntas = []
    for i, (fa, fb) in enumerate(zip(izq, der)):
        ia = rotular(fa, 'Sin muelle', Ti[i], letra, chica, e)
        ib = rotular(fb, f'Con muelle · {a.preset}', Td[i], letra, chica, e)
        im = Image.new('RGB', (ia.width + ib.width + hueco, ia.height), (40, 40, 48))
        im.paste(ia, (0, 0))
        im.paste(ib, (ia.width + hueco, 0))
        ruta = os.path.join(lado, f'{i:05d}.png')
        im.save(ruta)
        juntas.append(ruta)
    # Velocidad real a 30 fps (uno de cada dos cuadros de 1/60 s) y el tramo del gesto a 1/4 (cada cuadro dos veces)
    secuencia = juntas[::2] + [juntas[k] for k in range(*LENTA) for _ in range(2)]
    seq = os.path.join(tmp, 'seq')
    os.makedirs(seq)
    for j, ruta in enumerate(secuencia):
        os.symlink(ruta, os.path.join(seq, f'{j:05d}.png'))
    os.makedirs(CLIPS, exist_ok=True)
    mp4 = os.path.join(CLIPS, 'muelle-golpe.mp4')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '30', '-i', os.path.join(seq, '%05d.png'),
                    '-vf', f'scale={a.ancho_video}:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow',
                    '-crf', '27', '-profile:v', 'high', '-movflags', '+faststart', '-an', mp4], check=True)
    # Póster: el primer cuadro en que la de la izquierda ya está en las nubes y la de la derecha va por la mitad
    k = next((i for i in range(len(Td)) if Ti[i] >= 0.999 and Td[i] >= 0.6), ANTES + 8)
    poster = os.path.join(CLIPS, 'muelle-poster.jpg')
    im = Image.open(juntas[k])
    im.resize((a.ancho_video, round(a.ancho_video * im.height / im.width / 2) * 2), Image.LANCZOS).save(poster, quality=80, optimize=True, progressive=True)
    shutil.rmtree(tmp)
    sin = sum(1 for t in Ti if pm.ENTREGA < t < pm.NUBES)
    con = sum(1 for t in Td if pm.ENTREGA < t < pm.NUBES)
    print(f'muelle-golpe.mp4: {len(secuencia)} fotogramas ({len(secuencia) / 30:.1f} s), {os.path.getsize(mp4) // 1024} KB; '
          f'big bang {sin} cuadros sin muelle y {con} con muelle ({a.preset}); póster en el cuadro {k}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--preset', default='medio', choices=['suave', 'medio', 'firme', 'rebote'])
    ap.add_argument('--navegador', default='chromium', choices=['chromium', 'webkit'])
    ap.add_argument('--ancho', type=int, default=390)
    ap.add_argument('--alto', type=int, default=844)
    ap.add_argument('--ancho-video', type=int, default=720, help='ancho del vídeo lado a lado (px)')
    if not shutil.which('ffmpeg'):
        sys.exit('Falta ffmpeg.')
    asyncio.run(principal(ap.parse_args()))
