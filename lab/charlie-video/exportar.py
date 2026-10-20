#!/usr/bin/env python3
"""Exporta una escena del motor a vídeo y a hoja de contacto, fotograma a fotograma.

Basado en la idea de render.ts de pdoom-video (Giacomo Magnanini, github.com/mexicat/pdoom-video, MIT):
no se graba la pantalla, se avanza t a mano y se fotografía cada fotograma. Como una escena del motor
solo depende de t y del reloj, el resultado es el mismo en cualquier equipo, vaya rápido o lento.

Usa el visor (/lab/charlie-visor/?ui=0) y su visor.fotograma(t, r). Necesita Playwright (con WebKit o
Chromium), ffmpeg y Pillow. Sirve la raíz del repo en local, así que no sale nada a internet.

  python3 lab/charlie-video/exportar.py curvatura
  python3 lab/charlie-video/exportar.py bigbang --segundos 6 --fps 30 --navegador webkit
  python3 lab/charlie-video/exportar.py todas

Saca en lab/charlie-video/clips/: <escena>.mp4 (H.264, el que abre el iPhone), <escena>.webm (VP9),
<escena>-poster.jpg y <escena>-hoja.jpg (12 momentos en 4 × 3, con su t). Añade la escena a clips.json
con los t y el reloj de cada momento, para enlazarlos al visor.
"""
import argparse, asyncio, functools, http.server, json, os, shutil, subprocess, sys, tempfile, threading
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))   # la raíz del sitio (lab/ y motor/ cuelgan de aquí)
CLIPS = os.path.join(AQUI, 'clips')
ESCENAS = {'curvatura': 6, 'bigbang': 6, 'vuelta': 5}   # segundos de vídeo por defecto
MOMENTOS = 12   # la hoja de contacto: 4 columnas × 3 filas


def servir():
    """Servidor local de la raíz del repo en un puerto libre."""
    class Callado(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    manejador = functools.partial(Callado, directory=RAIZ)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), manejador)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}'


def fuente(px):
    for ruta in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/Library/Fonts/Arial.ttf'):
        if os.path.exists(ruta):
            return ImageFont.truetype(ruta, px)
    return ImageFont.load_default()


def coma(x, d):
    return f'{x:.{d}f}'.replace('.', ',')


def hoja(fotos, momentos, ancho_celda, salida):
    """12 fotogramas en 4 × 3, cada uno con su t del motor abajo a la izquierda."""
    im0 = Image.open(fotos[0])
    alto_celda = round(ancho_celda * im0.height / im0.width)
    hueco = 6
    lienzo = Image.new('RGB', (4 * ancho_celda + 5 * hueco, 3 * alto_celda + 4 * hueco), (11, 12, 16))
    letra = fuente(max(12, ancho_celda // 11))
    for i, (ruta, m) in enumerate(zip(fotos, momentos)):
        celda = Image.open(ruta).convert('RGB').resize((ancho_celda, alto_celda), Image.LANCZOS)
        dib = ImageDraw.Draw(celda)
        texto = f't {coma(m["t"], 3)}'
        caja = dib.textbbox((0, 0), texto, font=letra)
        x, y = 8, alto_celda - (caja[3] - caja[1]) - 12
        dib.rectangle((x - 4, y - 3, x + caja[2] - caja[0] + 4, y + caja[3] - caja[1] + 6), fill=(0, 0, 0))
        dib.text((x - caja[0], y - caja[1]), texto, font=letra, fill=(240, 240, 240))
        col, fila = i % 4, i // 4
        lienzo.paste(celda, (hueco + col * (ancho_celda + hueco), hueco + fila * (alto_celda + hueco)))
    lienzo.save(salida, quality=82, optimize=True, progressive=True)
    return lienzo.size


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


async def exportar(pw, base, escena, a):
    nav = await getattr(pw, a.navegador).launch()
    ctx = await nav.new_context(viewport={'width': a.ancho, 'height': a.alto}, device_scale_factor=a.escala,
                                reduced_motion='no-preference')
    p = await ctx.new_page()
    errores = []
    p.on('pageerror', lambda e: errores.append(str(e)))
    await p.goto(f'{base}/lab/charlie-visor/?escena={escena}&ui=0&mm=0')
    await p.wait_for_function("['1', 'fallo'].includes(document.documentElement.dataset.listo)", timeout=90000)
    if await p.evaluate('document.documentElement.dataset.listo') == 'fallo':
        await nav.close()
        raise RuntimeError(f'{escena} no ha cargado en {a.navegador}: ' + await p.evaluate("document.getElementById('estado').textContent"))
    tramo = await p.evaluate('visor.tramo()')
    n = round(a.segundos * a.fps)
    tmp = tempfile.mkdtemp(prefix=f'video-{escena}-')
    fotos = []
    for i in range(n):
        t = tramo['desde'] + (tramo['hasta'] - tramo['desde']) * i / (n - 1)
        r = i / a.fps if tramo['late'] else 0   # el latido, a su velocidad real
        if not await p.evaluate('([t, r]) => visor.fotograma(t, r)', [t, r]):
            raise RuntimeError(f'{escena}: el fotograma {i} ha fallado')
        ruta = os.path.join(tmp, f'{i:05d}.png')
        await p.screenshot(path=ruta)
        fotos.append(ruta)
    await nav.close()

    os.makedirs(CLIPS, exist_ok=True)
    ancho = a.ancho_video
    escala = f'scale={ancho}:-2:flags=lanczos,format=yuv420p'
    entrada = ['-framerate', str(a.fps), '-i', os.path.join(tmp, '%05d.png')]
    mp4 = os.path.join(CLIPS, f'{escena}.mp4')
    webm = os.path.join(CLIPS, f'{escena}.webm')
    ffmpeg(*entrada, '-vf', escala, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'high',
           '-movflags', '+faststart', '-an', mp4)
    ffmpeg(*entrada, '-vf', escala, '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1',
           '-deadline', 'good', '-cpu-used', '2', '-an', webm)

    # 12 momentos repartidos por todo el tramo, del primer fotograma al último
    idx = [round(k * (n - 1) / (MOMENTOS - 1)) for k in range(MOMENTOS)]
    momentos = []
    for k in idx:
        t = tramo['desde'] + (tramo['hasta'] - tramo['desde']) * k / (n - 1)
        momentos.append({'t': round(t, 3), 'r': round(k / a.fps if tramo['late'] else 0, 2), 'segundo': round(k / a.fps, 2)})
    hoja_ruta = os.path.join(CLIPS, f'{escena}-hoja.jpg')
    tam_hoja = hoja([fotos[k] for k in idx], momentos, a.celda, hoja_ruta)

    # Póster: el momento más lleno de luz de la hoja, para que la tarjeta no salga negra
    def luz(ruta):
        h = Image.open(ruta).convert('L').resize((96, 208)).histogram()
        return sum(h[41:])
    mejor = max(idx, key=lambda k: luz(fotos[k]))
    poster = os.path.join(CLIPS, f'{escena}-poster.jpg')
    Image.open(fotos[mejor]).convert('RGB').resize((ancho, round(ancho * a.alto / a.ancho)), Image.LANCZOS) \
        .save(poster, quality=80, optimize=True, progressive=True)
    shutil.rmtree(tmp)

    return {
        'escena': escena, 'navegador': a.navegador, 'fps': a.fps, 'fotogramas': n, 'segundos': round(n / a.fps, 2),
        'tramo': [tramo['desde'], tramo['hasta']], 'late': tramo['late'],
        'vista': f'{a.ancho}x{a.alto}@{a.escala}', 'video': f'{ancho}x{round(ancho * a.alto * a.escala / (a.ancho * a.escala) / 2) * 2}',
        'kb': {'mp4': round(os.path.getsize(mp4) / 1024), 'webm': round(os.path.getsize(webm) / 1024),
               'poster': round(os.path.getsize(poster) / 1024), 'hoja': round(os.path.getsize(hoja_ruta) / 1024)},
        'hoja': {'columnas': 4, 'filas': 3, 'px': list(tam_hoja)},
        'poster_t': round(tramo['desde'] + (tramo['hasta'] - tramo['desde']) * mejor / (n - 1), 3),
        'momentos': momentos, 'errores': errores,
    }


async def principal(a):
    from playwright.async_api import async_playwright
    srv, base = servir()
    escenas = list(ESCENAS) if a.escena == 'todas' else [a.escena]
    ruta_json = os.path.join(AQUI, 'clips.json')
    datos = json.load(open(ruta_json)) if os.path.exists(ruta_json) else {}
    try:
        async with async_playwright() as pw:
            for e in escenas:
                a.segundos = a.segundos_pedidos or ESCENAS[e]
                r = await exportar(pw, base, e, a)
                datos[e] = r
                print(f"{e}: {r['fotogramas']} fotogramas, mp4 {r['kb']['mp4']} KB, webm {r['kb']['webm']} KB, hoja {r['kb']['hoja']} KB")
    finally:
        srv.shutdown()
        with open(ruta_json, 'w') as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write('\n')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('escena', choices=[*ESCENAS, 'todas'])
    ap.add_argument('--segundos', dest='segundos_pedidos', type=float, default=0, help='duración del vídeo (por defecto, la de cada escena)')
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--navegador', choices=['webkit', 'chromium'], default='webkit', help='WebKit, como Safari y Chrome en el iPhone')
    ap.add_argument('--ancho', type=int, default=390, help='ancho de la ventana (CSS px)')
    ap.add_argument('--alto', type=int, default=844, help='alto de la ventana (CSS px)')
    ap.add_argument('--escala', type=float, default=2, help='píxeles por px CSS al fotografiar')
    ap.add_argument('--ancho-video', type=int, default=540, help='ancho del vídeo final (px)')
    ap.add_argument('--celda', type=int, default=240, help='ancho de cada momento en la hoja (px)')
    if not shutil.which('ffmpeg'):
        sys.exit('Falta ffmpeg.')
    asyncio.run(principal(ap.parse_args()))
