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
  python3 lab/charlie-video/exportar.py intro
  python3 lab/charlie-video/exportar.py vuelta --perfil vertical --calidad master
  python3 lab/charlie-video/exportar.py bigbang --perfil horizontal --fps 60 --salida /tmp/clips

Perfiles (--perfil): movil (el de siempre: ventana 390 × 844 a escala 2, vídeo de 540 px de ancho),
vertical 1080 × 1920, horizontal 1920 × 1080, cuadrado 1080 × 1080 y 4k 3840 × 2160. Cada perfil fija
la ventana del navegador, la escala de la foto y el tamaño exacto del vídeo; --ancho, --alto, --escala y
--ancho-video lo cambian a mano.

Calidades (--calidad): web (H.264 CRF 26 y VP9 de respaldo, para la página) y master (H.264 CRF 16 con
aq-mode=3 contra las bandas en los degradados, solo MP4, para guardar o volver a editar). Las dos van
etiquetadas BT.709 en rango de vídeo y con +faststart, para que Safari, iOS y Chrome pinten los mismos
colores y el vídeo arranque antes de bajarse entero.

Los fotogramas van a ffmpeg por una tubería, sin pasar por el disco: en JPEG (calidad 92) con web y en
PNG con master. Solo se guardan en una carpeta temporal los 12 de la hoja (y, en la intro, todos, porque
el vídeo repite el tramo lento).

Saca en lab/charlie-video/clips/ (o en --salida): <nombre>.mp4 (H.264, el que abre el iPhone),
<nombre>.webm (VP9, solo con web), <nombre>-poster.jpg y <nombre>-hoja.jpg (12 momentos en 4 × 3, con
su t). <nombre> es la escena, con -<perfil> si no es movil, -<fps>fps si no va a 30 y -master si es master:
los vídeos de la página (movil, web y 30 fps) se siguen llamando igual. Añade la entrada a clips.json con los t y el reloj de cada
momento, para enlazarlos al visor, y lo que dice ffprobe del vídeo.

La intro (motor/escenas/intro.js) no va con t sino con el tiempo real, así que tiene su propio modo:
abre /motor/ con el reloj falso de Playwright parado, lo adelanta 1/fps s por fotograma y fotografía.
Saca intro.mp4 (los segundos a velocidad real y luego el fogonazo y la onda a 1/4), intro-poster.jpg
y intro-hoja.jpg (12 momentos de los 2,4 s, con su segundo). Solo MP4: H.264 lo abre todo.
"""
import argparse, asyncio, functools, http.server, json, os, shutil, subprocess, sys, tempfile, threading
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))   # la raíz del sitio (lab/ y motor/ cuelgan de aquí)
CLIPS = os.path.join(AQUI, 'clips')
ESCENAS = {'curvatura': 6, 'bigbang': 6, 'vuelta': 5}   # segundos de vídeo por defecto
MOMENTOS = 12   # la hoja de contacto: 4 columnas × 3 filas

# Ventana del navegador (px CSS), escala de la foto, vídeo final (alto None = el que salga a ese ancho)
# y ancho de cada momento en la hoja. La ventana × escala da justo el vídeo, salvo en movil, que se reduce.
PERFILES = {
    'movil':      {'ancho': 390,  'alto': 844,  'escala': 2, 'video': (540, None),   'celda': 240},
    'vertical':   {'ancho': 540,  'alto': 960,  'escala': 2, 'video': (1080, 1920),  'celda': 240},
    'horizontal': {'ancho': 960,  'alto': 540,  'escala': 2, 'video': (1920, 1080),  'celda': 400},
    'cuadrado':   {'ancho': 540,  'alto': 540,  'escala': 2, 'video': (1080, 1080),  'celda': 300},
    '4k':         {'ancho': 1920, 'alto': 1080, 'escala': 2, 'video': (3840, 2160),  'celda': 400},
}
# web: lo de siempre para la página. master: para guardar; CRF 16 como pdoom y anabology.
CALIDADES = {
    'web':    {'crf': 26, 'webm': True,  'fotos': 'jpeg', 'x264': ''},
    'master': {'crf': 16, 'webm': False, 'fotos': 'png',  'x264': ':aq-mode=3'},
}
JPEG_CALIDAD = 92
# BT.709 en rango de vídeo: la matriz al pasar a YUV y las etiquetas en el filtro (setparams) y en x264.
# Con este ffmpeg, -color_primaries como opción de salida deja color_primaries=unknown en el MP4.
COLOR = ('out_color_matrix=bt709:out_range=tv',
         'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv')
X264_COLOR = 'colorprim=bt709:transfer=bt709:colormatrix=bt709'


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


def hoja(fotos, momentos, ancho_celda, salida, rotulo=None):
    """12 fotogramas en 4 × 3, cada uno con su t del motor (o el rótulo que se pida) abajo a la izquierda."""
    im0 = Image.open(fotos[0])
    alto_celda = round(ancho_celda * im0.height / im0.width)
    hueco = 6
    lienzo = Image.new('RGB', (4 * ancho_celda + 5 * hueco, 3 * alto_celda + 4 * hueco), (11, 12, 16))
    letra = fuente(max(12, ancho_celda // 11))
    for i, (ruta, m) in enumerate(zip(fotos, momentos)):
        celda = Image.open(ruta).convert('RGB').resize((ancho_celda, alto_celda), Image.LANCZOS)
        dib = ImageDraw.Draw(celda)
        texto = rotulo(m) if rotulo else f't {coma(m["t"], 3)}'
        caja = dib.textbbox((0, 0), texto, font=letra)
        x, y = 8, alto_celda - (caja[3] - caja[1]) - 12
        dib.rectangle((x - 4, y - 3, x + caja[2] - caja[0] + 4, y + caja[3] - caja[1] + 6), fill=(0, 0, 0))
        dib.text((x - caja[0], y - caja[1]), texto, font=letra, fill=(240, 240, 240))
        col, fila = i % 4, i // 4
        lienzo.paste(celda, (hueco + col * (ancho_celda + hueco), hueco + fila * (alto_celda + hueco)))
    lienzo.save(salida, quality=82, optimize=True, progressive=True)
    return lienzo.size


def tam_video(a):
    """Ancho y alto del vídeo final; si el perfil no fija el alto, el de la ventana a ese ancho, par."""
    w, h = a.video
    return w, h if h else round(w * a.alto / a.ancho / 2) * 2


class Codificador:
    """Un solo ffmpeg que recibe los fotogramas por la tubería y escribe el MP4 (y el WebM con web).

    Los fotogramas entran en JPEG o PNG tal cual los da Playwright, sin tocar el disco."""

    def __init__(self, a, fps, mp4, webm=None):
        w, h = tam_video(a)
        filtro = f'scale={w}:{h}:flags=lanczos:{COLOR[0]},format=yuv420p,{COLOR[1]}'
        decod = 'mjpeg' if a.fotos == 'jpeg' else 'png'
        cal = CALIDADES[a.calidad]
        args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                '-f', 'image2pipe', '-framerate', str(fps), '-c:v', decod, '-i', 'pipe:0',
                '-map', '0:v', '-vf', filtro, '-c:v', 'libx264', '-preset', 'slow', '-crf', str(cal['crf']),
                '-profile:v', 'high', '-x264-params', X264_COLOR + cal['x264'],
                '-movflags', '+faststart', '-an', mp4]
        if webm:
            args += ['-map', '0:v', '-vf', filtro, '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1',
                     '-deadline', 'good', '-cpu-used', '2', '-an', webm]
        self.err = tempfile.TemporaryFile()
        self.proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=self.err)
        self.n = 0

    def meter(self, datos):
        try:
            self.proc.stdin.write(datos)
        except BrokenPipeError:
            self.cerrar()   # ffmpeg se ha caído: cerrar() lanza el error con su mensaje
        self.n += 1

    def cerrar(self):
        try:
            self.proc.stdin.close()
        except BrokenPipeError:
            pass
        if self.proc.wait() != 0:
            self.err.seek(0)
            raise RuntimeError('ffmpeg ha fallado: ' + self.err.read().decode(errors='replace')[-800:])


def sondear(ruta):
    """Lo que dice ffprobe del vídeo: tamaño, fps, fotogramas y etiquetas de color."""
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries',
                        'stream=codec_name,width,height,r_frame_rate,nb_read_packets,pix_fmt,color_range,'
                        'color_space,color_transfer,color_primaries', '-of', 'json', ruta],
                       capture_output=True, text=True, check=True)
    s = json.loads(r.stdout)['streams'][0]
    num, den = (int(x) for x in s['r_frame_rate'].split('/'))
    return {'codec': s['codec_name'], 'px': f"{s['width']}x{s['height']}", 'fps': round(num / den, 3),
            'fotogramas': int(s.get('nb_read_packets', 0)), 'pix_fmt': s['pix_fmt'],
            'color': '/'.join(s.get(k, '?') for k in ('color_space', 'color_transfer', 'color_primaries', 'color_range'))}


def nombre_de(escena, a):
    """Los vídeos de la página (movil, web, 30 fps) se llaman como siempre; el resto lleva perfil, fps y calidad."""
    return (escena + ('' if a.perfil == 'movil' else f'-{a.perfil}') + ('' if a.fps == 30 else f'-{a.fps}fps')
            + ('' if a.calidad == 'web' else '-master'))


async def foto(p, a):
    if a.fotos == 'jpeg':
        return await p.screenshot(type='jpeg', quality=JPEG_CALIDAD)
    return await p.screenshot(type='png')


def guardar_poster(origen, a, salida):
    Image.open(origen).convert('RGB').resize(tam_video(a), Image.LANCZOS) \
        .save(salida, quality=80, optimize=True, progressive=True)


async def exportar(pw, base, escena, a):
    nombre = nombre_de(escena, a)
    os.makedirs(a.salida, exist_ok=True)
    mp4 = os.path.join(a.salida, f'{nombre}.mp4')
    webm = os.path.join(a.salida, f'{nombre}.webm') if CALIDADES[a.calidad]['webm'] else None

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
    # 12 momentos repartidos por todo el tramo, del primer fotograma al último: solo esos se guardan
    idx = [round(k * (n - 1) / (MOMENTOS - 1)) for k in range(MOMENTOS)]
    tmp = tempfile.mkdtemp(prefix=f'video-{escena}-')
    ext = 'jpg' if a.fotos == 'jpeg' else 'png'
    fotos = {}
    cod = Codificador(a, a.fps, mp4, webm)
    try:
        for i in range(n):
            t = tramo['desde'] + (tramo['hasta'] - tramo['desde']) * i / (n - 1)
            r = i / a.fps if tramo['late'] else 0   # el latido, a su velocidad real
            if not await p.evaluate('([t, r]) => visor.fotograma(t, r)', [t, r]):
                raise RuntimeError(f'{escena}: el fotograma {i} ha fallado')
            datos = await foto(p, a)
            cod.meter(datos)
            if i in idx:
                fotos[i] = os.path.join(tmp, f'{i:05d}.{ext}')
                with open(fotos[i], 'wb') as f:
                    f.write(datos)
    finally:
        await nav.close()
        cod.cerrar()

    momentos = []
    for k in idx:
        t = tramo['desde'] + (tramo['hasta'] - tramo['desde']) * k / (n - 1)
        momentos.append({'t': round(t, 3), 'r': round(k / a.fps if tramo['late'] else 0, 2), 'segundo': round(k / a.fps, 2)})
    hoja_ruta = os.path.join(a.salida, f'{nombre}-hoja.jpg')
    tam_hoja = hoja([fotos[k] for k in idx], momentos, a.celda, hoja_ruta)

    # Póster: el momento más lleno de luz de la hoja, para que la tarjeta no salga negra
    def luz(ruta):
        h = Image.open(ruta).convert('L').resize((96, 208)).histogram()
        return sum(h[41:])
    mejor = max(idx, key=lambda k: luz(fotos[k]))
    poster = os.path.join(a.salida, f'{nombre}-poster.jpg')
    guardar_poster(fotos[mejor], a, poster)
    shutil.rmtree(tmp)

    kb = {'mp4': round(os.path.getsize(mp4) / 1024)}
    if webm:
        kb['webm'] = round(os.path.getsize(webm) / 1024)
    kb.update(poster=round(os.path.getsize(poster) / 1024), hoja=round(os.path.getsize(hoja_ruta) / 1024))
    w, h = tam_video(a)
    return {
        'escena': escena, 'perfil': a.perfil, 'calidad': a.calidad, 'navegador': a.navegador,
        'fps': a.fps, 'fotogramas': n, 'segundos': round(n / a.fps, 2),
        'tramo': [tramo['desde'], tramo['hasta']], 'late': tramo['late'],
        'vista': f'{a.ancho}x{a.alto}@{a.escala:g}', 'video': f'{w}x{h}', 'fotos': a.fotos,
        'crf': CALIDADES[a.calidad]['crf'], 'ffprobe': sondear(mp4),
        'kb': kb, 'hoja': {'columnas': 4, 'filas': 3, 'px': list(tam_hoja)},
        'poster_t': round(tramo['desde'] + (tramo['hasta'] - tramo['desde']) * mejor / (n - 1), 3),
        'momentos': momentos, 'errores': errores,
    }


# La intro: lo que dura y el tramo que se repite a cámara lenta (en segundos, para cualquier fps)
INTRO_DURA = 2.4                # DURA en motor/escenas/intro.js
INTRO_LENTA = (10 / 30, 51 / 30)  # del punto que se enciende a la onda saliendo de pantalla
INTRO_FACTOR = 4                # la cámara lenta va a 1/4
INTRO_POSTER = 22 / 30          # la onda, bien visible


async def exportar_intro(pw, base, a):
    """Graba la intro de /motor/ con el reloj falso: tiempo real, pero avanzado a mano."""
    nombre = nombre_de('intro', a)
    nav = await getattr(pw, a.navegador).launch()
    ctx = await nav.new_context(viewport={'width': a.ancho, 'height': a.alto}, device_scale_factor=a.escala,
                                reduced_motion='no-preference')   # con «reducir movimiento» no sale
    p = await ctx.new_page()
    errores = []
    p.on('pageerror', lambda e: errores.append(str(e)))
    # El reloj falso cubre performance.now(), Date y requestAnimationFrame. Parado, la intro no corre sola.
    await p.clock.install(time=1_800_000_000_000)
    await p.clock.pause_at(1_800_000_000_500)
    await p.goto(f'{base}/motor/', wait_until='load')   # contexto nuevo: localStorage vacío y página arriba
    await p.wait_for_timeout(1500)   # módulos y curvatura cargados, en tiempo de verdad
    n = round(a.segundos * a.fps)
    tmp = tempfile.mkdtemp(prefix='video-intro-')
    ext = 'jpg' if a.fotos == 'jpeg' else 'png'
    fotos, acumulado = [], 0.0
    for i in range(n):
        ruta = os.path.join(tmp, f'{i:05d}.{ext}')
        with open(ruta, 'wb') as f:
            f.write(await foto(p, a))
        fotos.append(ruta)
        # 1/fps s exacto en milisegundos enteros: a 30, 33, 33, 34…
        siguiente = round((i + 1) * 1000 / a.fps)
        await p.clock.run_for(siguiente - round(acumulado))
        acumulado = siguiente
    vista = await p.evaluate("localStorage.getItem('motor-intro-vista')")
    await nav.close()
    if vista != '1':
        raise RuntimeError('la intro no ha terminado: localStorage no marca motor-intro-vista')

    # Vídeo: los segundos a velocidad real y, detrás, el fogonazo y la onda a cámara lenta
    a0, a1 = (min(n - 1, round(s * a.fps)) for s in INTRO_LENTA)
    secuencia = list(range(n)) + [k for k in range(a0, a1 + 1) for _ in range(INTRO_FACTOR)]
    os.makedirs(a.salida, exist_ok=True)
    mp4 = os.path.join(a.salida, f'{nombre}.mp4')
    cod = Codificador(a, a.fps, mp4)
    try:
        for k in secuencia:
            with open(fotos[k], 'rb') as f:
                cod.meter(f.read())
    finally:
        cod.cerrar()

    # 12 momentos repartidos por los 2,4 s que dura la intro
    ultimo = min(n - 1, round(INTRO_DURA * a.fps))
    idx = [round(k * ultimo / (MOMENTOS - 1)) for k in range(MOMENTOS)]
    momentos = [{'fotograma': k, 'segundo': round(k / a.fps, 2)} for k in idx]
    hoja_ruta = os.path.join(a.salida, f'{nombre}-hoja.jpg')
    tam_hoja = hoja([fotos[k] for k in idx], momentos, a.celda, hoja_ruta,
                    rotulo=lambda m: f'{coma(m["segundo"], 2)} s')
    poster = os.path.join(a.salida, f'{nombre}-poster.jpg')
    k_poster = min(n - 1, round(INTRO_POSTER * a.fps))
    guardar_poster(fotos[k_poster], a, poster)
    shutil.rmtree(tmp)

    w, h = tam_video(a)
    return {
        'escena': 'intro', 'modo': 'reloj real (reloj falso de Playwright)', 'pagina': '/motor/',
        'perfil': a.perfil, 'calidad': a.calidad, 'navegador': a.navegador,
        'fps': a.fps, 'fotogramas': n, 'dura': INTRO_DURA,
        'lenta': {'fotogramas': [a0, a1], 'factor': INTRO_FACTOR},
        'segundos': round(len(secuencia) / a.fps, 2),
        'vista': f'{a.ancho}x{a.alto}@{a.escala:g}', 'video': f'{w}x{h}', 'fotos': a.fotos,
        'crf': CALIDADES[a.calidad]['crf'], 'ffprobe': sondear(mp4),
        'kb': {'mp4': round(os.path.getsize(mp4) / 1024), 'poster': round(os.path.getsize(poster) / 1024),
               'hoja': round(os.path.getsize(hoja_ruta) / 1024)},
        'hoja': {'columnas': 4, 'filas': 3, 'px': list(tam_hoja)},
        'poster_segundo': round(k_poster / a.fps, 2),
        'momentos': momentos, 'errores': errores,
    }


def resumen(nombre, r):
    partes = [f"{r['fotogramas']} fotogramas", f"vídeo {r['video']} a {r['fps']} fps, {r['segundos']} s",
              f"mp4 {r['kb']['mp4']} KB"]
    if 'webm' in r['kb']:
        partes.append(f"webm {r['kb']['webm']} KB")
    partes += [f"hoja {r['kb']['hoja']} KB", f"color {r['ffprobe']['color']}"]
    return f'{nombre}: ' + ', '.join(partes)


async def principal(a):
    from playwright.async_api import async_playwright
    ruta_json = os.path.join(AQUI, 'clips.json') if a.salida == CLIPS else os.path.join(a.salida, 'clips.json')
    datos = json.load(open(ruta_json)) if os.path.exists(ruta_json) else {}
    escenas = ['intro'] if a.escena == 'intro' else list(ESCENAS) if a.escena == 'todas' else [a.escena]
    srv, base = servir()
    try:
        async with async_playwright() as pw:
            for e in escenas:
                if e == 'intro':
                    a.segundos = a.segundos_pedidos or 3
                    r = await exportar_intro(pw, base, a)
                else:
                    a.segundos = a.segundos_pedidos or ESCENAS[e]
                    r = await exportar(pw, base, e, a)
                nombre = nombre_de(e, a)
                datos[nombre] = r
                print(resumen(nombre, r))
    finally:
        srv.shutdown()
        os.makedirs(os.path.dirname(ruta_json), exist_ok=True)
        with open(ruta_json, 'w') as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write('\n')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('escena', choices=[*ESCENAS, 'todas', 'intro'], help='una escena, todas, o la intro de /motor/ (reloj real)')
    ap.add_argument('--perfil', choices=list(PERFILES), default='movil', help='tamaño del vídeo (por defecto, movil: el de la página)')
    ap.add_argument('--calidad', choices=list(CALIDADES), default='web', help='web (CRF 26, MP4 y WebM) o master (CRF 16, solo MP4)')
    ap.add_argument('--segundos', dest='segundos_pedidos', type=float, default=0, help='duración del vídeo (por defecto, la de cada escena; la intro, 3 s a velocidad real)')
    ap.add_argument('--fps', type=int, default=30, help='fotogramas por segundo (30 por defecto; 60 para pantallas rápidas)')
    ap.add_argument('--navegador', choices=['webkit', 'chromium'], default='webkit', help='WebKit, como Safari y Chrome en el iPhone')
    ap.add_argument('--ancho', type=int, help='ancho de la ventana (px CSS); por defecto, el del perfil')
    ap.add_argument('--alto', type=int, help='alto de la ventana (px CSS); por defecto, el del perfil')
    ap.add_argument('--escala', type=float, help='píxeles por px CSS al fotografiar; por defecto, la del perfil')
    ap.add_argument('--ancho-video', type=int, help='ancho del vídeo final (px); el alto sale de la ventana')
    ap.add_argument('--celda', type=int, help='ancho de cada momento en la hoja (px); por defecto, el del perfil')
    ap.add_argument('--fotos', choices=['jpeg', 'png'], help='formato de los fotogramas en la tubería; por defecto, jpeg con web y png con master')
    ap.add_argument('--salida', default=CLIPS, help='carpeta de salida (por defecto, clips/ junto a la página)')
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        sys.exit('Faltan ffmpeg y ffprobe.')
    a = ap.parse_args()
    perfil = PERFILES[a.perfil]
    a.salida = os.path.abspath(a.salida)
    a.fotos = a.fotos or CALIDADES[a.calidad]['fotos']
    a.celda = a.celda or perfil['celda']
    a.video = (a.ancho_video, None) if a.ancho_video else perfil['video']
    a.ancho, a.alto, a.escala = a.ancho or perfil['ancho'], a.alto or perfil['alto'], a.escala or perfil['escala']
    if a.ancho_video is None and (a.ancho, a.alto, a.escala) != (perfil['ancho'], perfil['alto'], perfil['escala']):
        # ventana cambiada a mano: el vídeo, a la foto entera (en movil, al ancho de 540 de siempre)
        a.video = perfil['video'] if a.perfil == 'movil' else (round(a.ancho * a.escala / 2) * 2, None)
    asyncio.run(principal(a))
