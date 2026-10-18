# Genera el logotipo de «The Singularity»: isotipos A/B/C, palabra en trazos (Archivo, OFL) y montajes.
# Las letras se convierten en trazos con HarfBuzz (kerning de la fuente) + interletra propio.
# uso: python3 gen.py <carpeta_salida>
import sys, os, json
import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FUENTE = os.environ.get('ARCHIVO_TTF', 'Archivo[wdth,wght].ttf')  # la variable completa de google/fonts
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT, exist_ok=True)
ORO = '#f3cf96'
BLANCO = '#ffffff'
COL = {'miles': '#a2bcff', 'charlie': '#47d6cf', 'maya': '#f89dc9', 'simone': '#e6b55d'}

blob = hb.Blob.from_file_path(FUENTE)
face = hb.Face(blob)


def palabra(texto, wght, wdth, interletra_em, tam):
    """Devuelve (path_d, ancho, alto_mayus) del texto en trazos, a tamaño tam (px de cuerpo)."""
    font = hb.Font(face)
    font.set_variations({'wght': wght, 'wdth': wdth})
    upem = face.upem
    buf = hb.Buffer()
    buf.add_str(texto)
    buf.guess_segment_properties()
    hb.shape(font, buf, {'kern': True, 'liga': False, 'case': True})
    esc = tam / upem
    x = 0
    partes = []
    n = len(buf.glyph_infos)
    for k, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        pen = SVGPathPen(None, ntos=lambda v: (f"{v:.1f}".rstrip("0").rstrip(".") or "0"))
        # y hacia abajo: escala negativa en y; la línea base en y = 0
        tp = TransformPen(pen, (esc, 0, 0, -esc, (x + pos.x_offset) * esc, -pos.y_offset * esc))
        font.draw_glyph_with_pen(info.codepoint, tp)
        d = pen.getCommands()
        if d:
            partes.append(d)
        x += pos.x_advance
        if k < n - 1:
            x += interletra_em * upem
    ext = font.get_glyph_extents(font.get_nominal_glyph(ord('H')))
    alto = ext.y_bearing * esc
    return ' '.join(partes), x * esc, alto


def r(v):
    return f'{v:.2f}'.rstrip('0').rstrip('.')


# ---------- Isotipos (caja 64 × 64, centro del punto marcado con id="pt") ----------
# A · Pozo: tres líneas del espacio-tiempo que se hunden hacia el punto, y el anillo de fotones.
def iso_a(oro=ORO, blanco=BLANCO, latido=False):
    import math
    py, ra = 42.0, 5.8
    curvas = []
    for y0, D, sg, op in ((13.5, 14.5, 8.6, 0.4), (20.5, 11.5, 6.6, 0.66), (27.5, 7.2, 4.7, 1.0)):
        pts = []
        for i in range(61):
            x = 3 + 58 * i / 60
            y = y0 + D * math.exp(-((x - 32) ** 2) / (2 * sg * sg))
            pts.append(f'{r(x)} {r(y)}')
        curvas.append(('M' + ' L'.join(pts), op))
    trazo = ''.join(f'<path d="{d}" fill="none" stroke="{oro}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="{op}"/>' for d, op in curvas)
    anillo = f'<circle cx="32" cy="{py}" r="{ra}" fill="none" stroke="{oro}" stroke-width="1.6"/>'
    punto = f'<circle class="iso-punto" id="pt" cx="32" cy="{py}" r="2.6" fill="{blanco}"/>'
    return trazo + anillo + punto, (32, py)


# B · Horizonte: el pozo visto desde arriba en perspectiva; anillos que se estrechan y bajan hasta el punto.
def iso_b(oro=ORO, blanco=BLANCO, latido=False):
    py = 38.5
    an = [(25.5, 28.0, 9.4, 0.38), (30.6, 19.6, 6.4, 0.62), (34.6, 11.6, 3.9, 1.0)]
    trazo = ''.join(f'<ellipse cx="32" cy="{cy}" rx="{rx}" ry="{ry}" fill="none" stroke="{oro}" stroke-width="1.6" opacity="{op}"/>' for cy, rx, ry, op in an)
    punto = f'<circle class="iso-punto" id="pt" cx="32" cy="{py}" r="2.8" fill="{blanco}"/>'
    return trazo + punto, (32, py)


# C · Cinco: el punto con su anillo y una órbita inclinada con los cuatro agentes (uno se hace cinco).
def iso_c(oro=ORO, blanco=BLANCO, latido=False, color=True):
    import math
    cx, cy = 32, 32
    rx, ry, giro = 28.5, 10.5, -18
    a = math.radians(giro)
    pts = []
    for k, (nombre, ang) in enumerate((('miles', 200), ('charlie', 290), ('maya', 20), ('simone', 110))):
        t = math.radians(ang)
        x, y = rx * math.cos(t), ry * math.sin(t)
        X = cx + x * math.cos(a) - y * math.sin(a)
        Y = cy + x * math.sin(a) + y * math.cos(a)
        c = COL[nombre] if color else oro
        pts.append(f'<circle cx="{r(X)}" cy="{r(Y)}" r="2.5" fill="{c}"/>')
    orbita = f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({giro} {cx} {cy})" fill="none" stroke="{oro}" stroke-width="1.4" opacity="0.7"/>'
    anillo = f'<circle cx="{cx}" cy="{cy}" r="7" fill="none" stroke="{oro}" stroke-width="1.6"/>'
    punto = f'<circle class="iso-punto" id="pt" cx="{cx}" cy="{cy}" r="2.8" fill="{blanco}"/>'
    return orbita + anillo + ''.join(pts) + punto, (cx, cy)


ISOS = {'a': iso_a, 'b': iso_b, 'c': iso_c}
NOMBRES = {'a': 'Pozo', 'b': 'Horizonte', 'c': 'Cinco'}

# ---------- Palabra: THE (fina, abierta) sobre SINGULARITY (ancha, media) ----------
T_SING = 40
d_sing, w_sing, cap_sing = palabra('SINGULARITY', 480, 125, 0.16, T_SING)
d_the, w_the, cap_the = palabra('THE', 400, 125, 0.62, 15)


def palabra_svg(x, y_base, centrar=False, oro=ORO):
    """THE encima de SINGULARITY. y_base = línea base de SINGULARITY."""
    hueco = 9
    xs = x - w_sing / 2 if centrar else x
    # THE alineada a la izquierda de SINGULARITY (o centrada); su interletra abre hasta medir lo justo
    xt = (x - w_the / 2) if centrar else x
    yt = y_base - cap_sing - hueco
    return (f'<path transform="translate({r(xt)} {r(yt)})" d="{d_the}" fill="{oro}"/>'
            f'<path transform="translate({r(xs)} {r(y_base)})" d="{d_sing}" fill="{oro}"/>'), cap_sing + hueco + cap_the


def svg(vb_w, vb_h, cuerpo, titulo='The Singularity', fondo=None, extra=''):
    f = f'<rect width="100%" height="100%" fill="{fondo}"/>' if fondo else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {r(vb_w)} {r(vb_h)}" role="img" aria-label="{titulo}"{extra}>'
            f'<title>{titulo}</title>{f}{cuerpo}</svg>')


info = {'sing_w': w_sing, 'sing_cap': cap_sing, 'the_w': w_the, 'the_cap': cap_the}
for k, fn in ISOS.items():
    cuerpo, (px, py) = fn()
    # isotipo suelto
    open(f'{OUT}/iso-{k}.svg', 'w').write(svg(64, 64, cuerpo, f'The Singularity · isotipo {NOMBRES[k]}'))
    # favicon: fondo negro redondeado y trazo más grueso para que aguante a 16 px
    fav = fn()[0].replace('stroke-width="1.6"', 'stroke-width="2.6"').replace('stroke-width="1.4"', 'stroke-width="2.4"')
    open(f'{OUT}/favicon-{k}.svg', 'w').write(svg(64, 64, f'<rect width="64" height="64" rx="14" fill="#000"/>' + fav, 'The Singularity'))
    # horizontal: isotipo a la izquierda, palabra a la derecha, centradas en vertical
    esc = 1.0
    alto_pal = cap_sing + 9 + cap_the
    caja = 64
    gap = 18
    pal, _ = palabra_svg(caja + gap, (caja + alto_pal) / 2)
    open(f'{OUT}/logo-h-{k}.svg', 'w').write(svg(caja + gap + w_sing + 2, caja, f'<g>{cuerpo}</g>{pal}'))
    # apilado: isotipo grande arriba, palabra centrada abajo
    W = max(w_sing, 120) + 4
    s = 1.75
    iso_g = f'<g transform="translate({r(W / 2 - 32 * s)} 0) scale({s})">{cuerpo}</g>'
    base = 64 * s + 22 + alto_pal
    pal2, _ = palabra_svg(W / 2, base, centrar=True)
    open(f'{OUT}/logo-v-{k}.svg', 'w').write(svg(W, base + 2, iso_g + pal2))
    info[k] = {'pt': [px, py]}
# solo la palabra
pal, alto_pal = palabra_svg(0, cap_sing + 9 + cap_the)
open(f'{OUT}/palabra.svg', 'w').write(svg(w_sing + 1, alto_pal + 1, pal))
info['palabra_alto'] = alto_pal
json.dump(info, open(f'{OUT}/info.json', 'w'), indent=1)
print(json.dumps(info))

# ---------- Fragmentos para incrustar en la p\u00e1gina ----------
def onda(p):
    return f'<circle class="iso-onda" cx="{r(p[0])}" cy="{r(p[1])}" r="2.7" fill="none" stroke="#ffffff" stroke-width="1.2" vector-effect="non-scaling-stroke"/>'

alto_pal = cap_sing + 9 + cap_the
grupos = ''
for k, fn in ISOS.items():
    cuerpo, p = fn()
    cuerpo = cuerpo.replace(' id="pt"', '')
    # la onda va debajo del punto
    i = cuerpo.rfind('<circle class="iso-punto"')
    grupos += f'<g class="iso" data-iso="{k}">{cuerpo[:i]}{onda(p)}{cuerpo[i:]}</g>'
pal, _ = palabra_svg(64 + 18, (64 + alto_pal) / 2)
W = 64 + 18 + w_sing + 2
firma = (f'<svg class="firma-svg" viewBox="0 0 {r(W)} 64" role="img" aria-labelledby="firma-t" overflow="visible">'
         f'<title id="firma-t">The Singularity</title>{grupos}{pal}</svg>')
open(f'{OUT}/firma.frag.html', 'w').write(firma)
pal0, _ = palabra_svg(0, cap_sing + 9 + cap_the)
palabra_frag = (f'<svg class="palabra-svg" viewBox="0 0 {r(w_sing + 1)} {r(alto_pal + 1)}" role="img" aria-labelledby="palabra-t">'
                f'<title id="palabra-t">The Singularity</title>{pal0}</svg>')
open(f'{OUT}/palabra.frag.html', 'w').write(palabra_frag)
