#!/usr/bin/env python3
"""Prueba del muelle en T: cuántos fotogramas dura el big bang con un desplazamiento brusco, con y sin muelle.

Sirve la raíz del repo en local (no sale nada a internet), abre /lab/charlie-muelle/?registro=1 con el reloj falso
de Playwright (performance.now, Date y requestAnimationFrame avanzan solo cuando se pide, 60 cuadros por segundo
exactos) y repite dos gestos con cada modo:

  golpe: de T 0,2 a T 1 en 4 cuadros (un dedo muy rápido que para en las cinco nubes).
  flick: el empujón con inercia de iOS, 6000 px/s que se frenan con τ = 0,325 s, desde T 0,2 (acaba hacia T 2,5).

El big bang explota de T 0,42 (PUNTO.entrega) a T 1. Cuenta los cuadros pintados con el T del motor dentro de
ese tramo, el primero y el último, y cuánto tarda el motor en alcanzar al desplazamiento.

Comprueba además:
  - sin muelle, el T del motor es el del desplazamiento en todos los cuadros (como /motor/);
  - con «reducir movimiento» y con la pausa, lo mismo aunque el muelle esté encendido;
  - el reloj del latido avanza lo mismo que el tiempo durante el golpe, con y sin muelle (siempre hay una escena
    con latido activa): el muelle no lo toca;
  - la página carga sin errores ni desbordes en WebKit (390 × 844 y 320 × 640) y Chromium (1280 × 800).

  python3 lab/charlie-muelle/prueba_muelle.py               # WebKit y Chromium
  python3 lab/charlie-muelle/prueba_muelle.py --navegador webkit --json resultado.json
  AXE=/ruta/axe.min.js python3 lab/charlie-muelle/prueba_muelle.py   # añade axe (WCAG 2.2 AA)

Sale con código 1 si falla alguna comprobación. Necesita Playwright (WebKit y Chromium).
"""
import argparse, asyncio, functools, http.server, json, math, os, sys, threading

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
ENTREGA, NUBES = 0.42, 1.0          # el big bang explota en este tramo de T (motor/relevos.js)
CUADRO_MS = 1000 / 60
MODOS = [('sin muelle', 'muelle=0'), ('suave', 'preset=suave'), ('medio', 'preset=medio'), ('firme', 'preset=firme')]
# Chromium sin GPU: SwiftShader, para que el big bang cargue y su latido cuente como en un móvil
ARGS = {'chromium': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], 'webkit': []}
INTRO_VISTA = "try { localStorage.setItem('motor-intro-vista', '1') } catch (e) {}"   # sin intro: no tapa nada


def servir():
    class Callado(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Callado, directory=RAIZ))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}'


Y_DE = '''(T) => { const c = [...document.querySelectorAll('[data-escena]')].map(e => e.offsetTop + e.offsetHeight * 0.5);
  const i = Math.min(Math.floor(T), c.length - 2); return Math.max(0, c[i] + (c[i + 1] - c[i]) * (T - i) - innerHeight * 0.5); }'''


class Reloj:
    """Cuadros de 1/60 s exactos en milisegundos enteros (16, 17, 17, 16…) sobre el reloj falso."""
    def __init__(self, p):
        self.p, self.n, self.ms = p, 0, 0

    async def cuadro(self):
        self.n += 1
        sig = round(self.n * CUADRO_MS)
        await self.p.clock.run_for(sig - self.ms)
        self.ms = sig


async def abrir(pw, nav, base, consulta, ancho=390, alto=844, reducido=False):
    b = await getattr(pw, nav).launch(args=ARGS[nav])
    ctx = await b.new_context(viewport={'width': ancho, 'height': alto}, device_scale_factor=2 if ancho < 600 else 1,
                              reduced_motion='reduce' if reducido else 'no-preference', has_touch=ancho < 600)
    await ctx.add_init_script(INTRO_VISTA)
    p = await ctx.new_page()
    errores = []
    p.on('pageerror', lambda e: errores.append(f'pageerror: {e}'))
    p.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
    p.on('response', lambda rs: errores.append(f'{rs.status} {rs.url}') if rs.status >= 400 else None)
    await p.clock.install(time=1_800_000_000_000)
    await p.clock.pause_at(1_800_000_000_500)
    await p.goto(f'{base}/lab/charlie-muelle/?registro=1&{consulta}', wait_until='load')
    return b, p, errores


async def esperar_bigbang(p, reloj, segundos=20):
    """El big bang se pide con el primer desplazamiento; carga en tiempo de verdad (el falso está parado)."""
    await p.evaluate(f'scrollTo(0, ({Y_DE})(0.2))')
    for _ in range(segundos * 4):
        await reloj.cuadro()
        est = await p.evaluate("(motor.escenas().find(e => e.nombre === 'bigbang') || {}).estado")
        if est in ('viva', 'fallo', 'retirada'):
            return est
        await p.wait_for_timeout(250)
    return est


async def gesto(p, reloj, cual, cuadros_tras=90):
    """Coloca en T 0,2, deja que el motor se quede quieto, vacía el registro y hace el gesto cuadro a cuadro."""
    await p.evaluate(f'scrollTo(0, ({Y_DE})(0.2)); dispatchEvent(new Event("scroll"))')
    for _ in range(90):
        await reloj.cuadro()
    await p.evaluate('motor.vaciarRegistro()')
    y0 = await p.evaluate(f'({Y_DE})(0.2)')
    if cual == 'golpe':
        y1 = await p.evaluate(f'({Y_DE})(1)')
        ys = [y0 + (y1 - y0) * k / 4 for k in range(1, 5)]
    else:   # flick con inercia: y(t) = y0 + v0 · τ · (1 − e^(−t/τ)), hasta que va a menos de 10 px/s
        v0, tau = 6000.0, 0.325
        ys, k = [], 1
        while v0 * math.exp(-(k * CUADRO_MS / 1000) / tau) > 10:
            ys.append(y0 + v0 * tau * (1 - math.exp(-(k * CUADRO_MS / 1000) / tau)))
            k += 1
    for y in ys:
        # El evento scroll lo reparte el navegador en sus cuadros de verdad, no en los del reloj falso:
        # se lanza a mano para que el motor pida su cuadro como en un móvil (pedir() no duplica cuadros)
        await p.evaluate(f'scrollTo(0, {y}); dispatchEvent(new Event("scroll"))')
        await reloj.cuadro()
    for _ in range(cuadros_tras):
        await reloj.cuadro()
    reg = await p.evaluate('motor.registro()')
    return reg, len(ys)


def medir(reg, n_gesto):
    dentro = [i for i, c in enumerate(reg) if ENTREGA < c['T'] < NUBES]
    # El núcleo: del 5 % al 95 % de la explosión (el muelle se acerca a T 1 despacio, y ese final casi no se ve)
    a, b = ENTREGA + 0.05 * (NUBES - ENTREGA), ENTREGA + 0.95 * (NUBES - ENTREGA)
    nucleo = [i for i, c in enumerate(reg) if a < c['T'] < b]
    fin_gesto = n_gesto - 1
    alcanza = next((i for i in range(fin_gesto, len(reg)) if abs(reg[i]['T'] - reg[i]['Tscroll']) < 0.01), None)
    return {
        'cuadros_big_bang': len(dentro),
        'ms_big_bang': round(len(dentro) * CUADRO_MS),
        'cuadros_nucleo_5_95': len(nucleo),
        'primer_cuadro': dentro[0] if dentro else None,
        'ultimo_cuadro': dentro[-1] if dentro else None,
        'cuadros_del_gesto': n_gesto,
        'alcanza_al_dedo_ms': round((alcanza - fin_gesto) * CUADRO_MS) if alcanza is not None else None,
        'max_desfase_T': round(max(abs(c['T'] - c['Tscroll']) for c in reg), 3),
        # Lo que avanza el reloj del latido durante el gesto (el total depende de cuánto tardó en cargar el big bang)
        'reloj_avance': round(reg[-1]['reloj'] - reg[0]['reloj'], 6),
        'tiempo_transcurrido': round((reg[-1]['ms'] - reg[0]['ms']) / 1000, 6),
        'cuadros': len(reg),
    }


async def medidas(pw, nav, base):
    res, fallos = {}, []
    for nombre, consulta in MODOS:
        b, p, errores = await abrir(pw, nav, base, consulta)
        reloj = Reloj(p)
        est = await esperar_bigbang(p, reloj)
        res[nombre] = {'bigbang': est}
        for cual in ('golpe', 'flick'):
            reg, n = await gesto(p, reloj, cual)
            m = medir(reg, n)
            res[nombre][cual] = m
            if nombre == 'sin muelle' and m['max_desfase_T'] > 1e-9:
                fallos.append(f'{nav}: sin muelle el T del motor no es el del desplazamiento ({m["max_desfase_T"]})')
        res[nombre]['errores'] = errores[:10]
        if errores:
            fallos.append(f'{nav} {nombre}: errores {errores[:3]}')
        await b.close()
    base_golpe = res['sin muelle']['golpe']['cuadros_big_bang']
    for nombre, _ in MODOS[1:]:
        if res[nombre]['golpe']['cuadros_big_bang'] <= base_golpe:
            fallos.append(f'{nav} {nombre}: el muelle no alarga el big bang en el golpe')
    # En el golpe siempre hay una escena con latido activa (curvatura y big bang): el reloj tiene que avanzar
    # exactamente lo que avanza el tiempo, con muelle y sin él. (Comparar el total entre modos no vale: el rAF
    # falso va de 16 en 16 ms y el registro puede empezar un cuadro antes o después.)
    if all(res[n]['bigbang'] == 'viva' for n, _ in MODOS):
        for n, _ in MODOS:
            g = res[n]['golpe']
            if abs(g['reloj_avance'] - g['tiempo_transcurrido']) > 1e-6:
                fallos.append(f'{nav} {n}: el reloj del latido no sigue al tiempo ({g["reloj_avance"]} s en {g["tiempo_transcurrido"]} s)')
    return res, fallos


async def directo(pw, nav, base):
    """Con «reducir movimiento» y con la pausa, el muelle encendido no hace nada: salto directo."""
    res, fallos = {}, []
    for caso in ('reducir movimiento', 'pausa'):
        b, p, errores = await abrir(pw, nav, base, 'preset=medio', reducido=(caso == 'reducir movimiento'))
        reloj = Reloj(p)
        await reloj.cuadro()
        if caso == 'pausa':
            await p.click('#pausa')
        reg, n = await gesto(p, reloj, 'golpe', cuadros_tras=20)
        m = medir(reg, n)
        res[caso] = {'max_desfase_T': m['max_desfase_T'], 'cuadros_big_bang': m['cuadros_big_bang'],
                     'interruptor_desactivado': await p.evaluate('document.getElementById("interruptor").disabled'),
                     'errores': errores[:5]}
        if m['cuadros'] < n:
            fallos.append(f'{nav} {caso}: el motor no ha pintado cada cuadro del gesto ({m["cuadros"]} de {n})')
        if m['max_desfase_T'] > 1e-9:
            fallos.append(f'{nav} {caso}: el muelle sigue actuando ({m["max_desfase_T"]})')
        await b.close()
    return res, fallos


async def carga(pw, nav, base, ancho, alto):
    """Reloj de verdad: carga, recorre toda la página, desbordes, consola, panel y (si hay AXE) accesibilidad."""
    b = await getattr(pw, nav).launch(args=ARGS[nav])
    ctx = await b.new_context(viewport={'width': ancho, 'height': alto}, device_scale_factor=2 if ancho < 600 else 1,
                              has_touch=ancho < 600)
    p = await ctx.new_page()
    errores = []
    p.on('pageerror', lambda e: errores.append(f'pageerror: {e}'))
    p.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
    p.on('response', lambda rs: errores.append(f'{rs.status} {rs.url}') if rs.status >= 400 else None)
    await p.goto(f'{base}/lab/charlie-muelle/', wait_until='load')
    await p.wait_for_timeout(3000)
    alto_pag = await p.evaluate('document.documentElement.scrollHeight')
    for y in range(0, alto_pag, alto // 2):
        await p.evaluate(f'scrollTo(0, {y})')
        await p.wait_for_timeout(120)
    await p.wait_for_timeout(1200)
    r = {
        'desborde_px': await p.evaluate('document.documentElement.scrollWidth - innerWidth'),
        'noindex': await p.evaluate('document.querySelector("meta[name=robots]").content'),
        'escenas': await p.evaluate('motor.escenas().map(e => e.nombre + ":" + e.estado)'),
        'muelle': await p.evaluate('({activo: motor.muelle.activo, w: motor.muelle.w, z: motor.muelle.z})'),
        'T_final': await p.evaluate('[motor.T(), motor.Tscroll()]'),
        'panel_alto_px': await p.evaluate('document.getElementById("panel").offsetHeight'),
    }
    # El interruptor responde y deja la URL compartible
    await p.click('#interruptor')
    r['tras_interruptor'] = await p.evaluate('[motor.muelle.activo, location.search]')
    if os.environ.get('AXE'):
        await p.evaluate('scrollTo(0, 0)')
        await p.add_script_tag(path=os.environ['AXE'])
        r['axe'] = await p.evaluate("axe.run(document, {runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']})"
                                    ".then(r => r.violations.map(v => v.id + ':' + v.nodes.length))")
    if os.environ.get('CAPTURAS'):
        await p.evaluate('scrollTo(0, 0)')
        await p.wait_for_timeout(400)
        await p.screenshot(path=os.path.join(os.environ['CAPTURAS'], f'{nav}-{ancho}.png'))
    r['errores'] = errores[:10]
    await b.close()
    fallos = []
    if r['desborde_px'] > 0:
        fallos.append(f'{nav} {ancho}: desborde de {r["desborde_px"]} px')
    if errores:
        fallos.append(f'{nav} {ancho}: errores {errores[:3]}')
    if r['tras_interruptor'][0] is not False or 'muelle=0' not in r['tras_interruptor'][1]:
        fallos.append(f'{nav} {ancho}: el interruptor no apaga el muelle')
    if r.get('axe'):
        fallos.append(f'{nav} {ancho}: axe {r["axe"]}')
    return r, fallos


async def principal(a):
    from playwright.async_api import async_playwright
    srv, base = servir()
    salida, fallos = {}, []
    try:
        async with async_playwright() as pw:
            for nav in a.navegadores:
                salida[nav] = {}
                r, f = await medidas(pw, nav, base); salida[nav]['medidas'] = r; fallos += f
                r, f = await directo(pw, nav, base); salida[nav]['salto_directo'] = r; fallos += f
                tamanos = [(390, 844), (320, 640)] if nav == 'webkit' else [(1280, 800), (390, 844)]
                for ancho, alto in tamanos:
                    r, f = await carga(pw, nav, base, ancho, alto); salida[nav][f'carga_{ancho}'] = r; fallos += f
    finally:
        srv.shutdown()
    salida['fallos'] = fallos
    if a.json:
        with open(a.json, 'w') as fh:
            json.dump(salida, fh, ensure_ascii=False, indent=1)
    for nav in a.navegadores:
        print(f'== {nav}')
        for nombre, _ in MODOS:
            m = salida[nav]['medidas'][nombre]
            print(f"  {nombre:10s} big bang {m['bigbang']:8s} golpe: {m['golpe']['cuadros_big_bang']:3d} cuadros "
                  f"({m['golpe']['ms_big_bang']} ms), núcleo {m['golpe']['cuadros_nucleo_5_95']}, alcanza al dedo en {m['golpe']['alcanza_al_dedo_ms']} ms · "
                  f"flick: {m['flick']['cuadros_big_bang']:3d} cuadros ({m['flick']['ms_big_bang']} ms), núcleo {m['flick']['cuadros_nucleo_5_95']}")
    print('FALLOS:' if fallos else 'Todo bien.', *fallos, sep='\n  ')
    return 1 if fallos else 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--navegador', dest='navegadores', action='append', choices=['webkit', 'chromium'])
    ap.add_argument('--json', help='guarda todas las cifras en este archivo')
    a = ap.parse_args()
    a.navegadores = a.navegadores or ['webkit', 'chromium']
    sys.exit(asyncio.run(principal(a)))
