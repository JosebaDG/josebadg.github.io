// Un punto: prototipo de portada. Canvas 2D, sin dependencias.
// Las partículas pasan de una forma a otra según el desplazamiento:
// un punto, cinco puntos, hilos (pull requests reales), columnas (datos públicos reales del día),
// un cielo de fondo y otra vez un punto.

const DATOS = 'https://josebadg.github.io/Pvpc-bridge/datos/';
const menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

const lienzo = document.querySelector('.lienzo');
const ctx = lienzo.getContext('2d');
const escenas = [...document.querySelectorAll('[data-escena]')];

// Colores: los tokens --c-* de punto.css (una sola fuente). Si falta uno, blanco.
const estilo = getComputedStyle(document.documentElement);
const rgb = (v) => {
  const m = estilo.getPropertyValue(v).trim().match(/^#([0-9a-f]{6})$/i);
  return m ? [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)) : [255, 255, 255];
};
const COLORES = {
  persona: rgb('--c-persona'),
  Miles: rgb('--c-miles'),
  Charlie: rgb('--c-charlie'),
  Maya: rgb('--c-maya'),
  Simone: rgb('--c-simone'),
  barato: rgb('--c-dato-bajo'),
  medio: rgb('--c-dato-medio'),
  caro: rgb('--c-dato-alto'),
};
const AGENTES = ['Miles', 'Charlie', 'Maya', 'Simone'];

let ancho = 0, alto = 0, dpr = 1;
let N = 1200;
let P = [];            // partículas: { x, y, c:[r,g,b], a }
let formas = [];       // por escena: Float32Array de destinos [x, y, r, g, b, a] por partícula
let prs = null;        // { total, porAutor: Map }
let luz = null;        // [{ hora, precio, tramo }]
let hilos = [];        // un hilo por pull request: { c, ang0, r0, r1, giro }
let geoHilos = null;   // { c5 }
let barras = null;     // geometría de las 24 columnas, con la sección centrada

// Punto s (0 a 1) de un hilo: sale del agente y se abre a su órbita alrededor de la persona
function puntoHilo(h, s) {
  const c5 = geoHilos.c5;
  const ang = h.ang0 + h.giro * s;
  const rr = h.r0 + (h.r1 - h.r0) * suave(Math.min(1, s * 1.5));
  return [c5.x + Math.cos(ang) * rr, c5.y + Math.sin(ang) * rr];
}

const azar = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const suave = (t) => t * t * (3 - 2 * t);

function medir() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  ancho = innerWidth; alto = innerHeight;
  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const potente = (navigator.hardwareConcurrency || 4) >= 8;
  N = ancho < 600 ? (potente ? 1600 : 1000) : (potente ? 4000 : 2400);
  if (P.length !== N) P = Array.from({ length: N }, () => ({ x: ancho / 2, y: alto / 2, c: [255, 255, 255], a: 1 }));
  construirFormas();
}

// Centro de la composición: algo por encima del texto, que va abajo
const centro = () => ({ x: ancho / 2, y: alto * 0.42 });
const radio = () => Math.min(ancho, alto) * 0.26;

// Los cinco van un poco más arriba que el punto, para que el brillo de los dos de abajo no toque el título
const centroCinco = () => ({ x: ancho / 2, y: alto * (ancho < 600 ? 0.34 : 0.38) });

function posicionesCinco() {
  const c = centroCinco(), r = radio();
  return [
    { quien: 'persona', x: c.x, y: c.y },
    ...AGENTES.map((a, i) => {
      const ang = -Math.PI / 2 + (i * Math.PI) / 2 + Math.PI / 4;
      return { quien: a, x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r };
    }),
  ];
}

function forma(fn) {
  const f = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const [x, y, col, a] = fn(i);
    f.set([x, y, col[0], col[1], col[2], a], i * 6);
  }
  return f;
}

function construirFormas() {
  const c = centro(), r = radio();
  const cinco = posicionesCinco();

  // 0 · Un punto
  const punto = forma(() => {
    const ang = azar() * Math.PI * 2, d = Math.pow(azar(), 2) * 2.2;
    return [c.x + Math.cos(ang) * d, c.y + Math.sin(ang) * d, COLORES.persona, 1];
  });

  // 1 · Cinco puntos: la persona en el centro, los cuatro agentes alrededor
  const dueno = (i) => cinco[i % 5];
  const cincoF = forma((i) => {
    const p = dueno(i), ang = azar() * Math.PI * 2, d = Math.pow(azar(), 2) * 3;
    return [p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, COLORES[p.quien], 1];
  });

  // 2 · Hilos: un hilo por pull request fusionado. Sale del agente que lo hizo y gira en órbita
  // alrededor de la persona. Ninguno pasa por el centro: antes iban del agente al centro y formaban una X.
  // Las partículas se posan sobre los hilos y, encima, cada hilo se dibuja como una línea (pintarHilos).
  const c5 = centroCinco();
  const cuenta = prs ? prs.porAutor : new Map(AGENTES.map((a) => [a, 6]));
  const porAgente = cinco.slice(1).map((p, ai) => ({ p, ai, n: cuenta.get(p.quien) || 0 }));
  hilos = [];
  // Orden de aparición: uno de cada agente por turnos, como se van fusionando
  for (let k = 0; porAgente.some((g) => k < g.n); k++) {
    for (const g of porAgente) {
      if (k >= g.n) continue;
      const h1 = azar(), h2 = azar();
      hilos.push({
        c: COLORES[g.p.quien],
        ang0: Math.atan2(g.p.y - c5.y, g.p.x - c5.x),
        r0: r,
        r1: r * (0.62 + 0.72 * h1),                 // órbita entre 0,62 y 1,34 veces el radio
        giro: (0.9 + 1.7 * h2) * (k % 2 ? -1 : 1),  // de 50° a 150°, en los dos sentidos
      });
    }
  }
  geoHilos = { c5 };
  const hilosF = forma((i) => {
    if (!hilos.length || i % 5 === 0) {
      const ang = azar() * Math.PI * 2, d = Math.pow(azar(), 2) * 3;
      const p = cinco[i % 5];
      return [p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, COLORES[p.quien], 1];
    }
    const h = hilos[i % hilos.length];
    const [x, y] = puntoHilo(h, azar());
    return [x, y, h.c, 0.45];
  });

  // 3 · Columnas: datos públicos reales del día (la portada no los nombra: es la entrada al proyecto global)
  const horas = luz || Array.from({ length: 24 }, (_, h) => ({ hora: h, precio: 0.08 + 0.06 * Math.sin(h / 3.8), tramo: 'medio' }));
  const techo = Math.max(...horas.map((h) => h.precio), 0.001);
  const anchoBarras = Math.min(ancho * 0.86, 720), x0 = (ancho - anchoBarras) / 2;
  // Las columnas van ancladas a su texto: se apoyan justo encima de la frase que las explica y suben
  // con ella al desplazar. Aquí se miden con la sección centrada en pantalla; pintar() suma el desfase.
  const secLuz = escenas[3], txtLuz = secLuz && secLuz.querySelector('.texto');
  const topCentrada = secLuz ? alto / 2 - secLuz.offsetHeight / 2 : 0;
  const sobreTexto = txtLuz ? topCentrada + (txtLuz.getBoundingClientRect().top - secLuz.getBoundingClientRect().top) - 38 : alto * 0.62;
  const base = Math.min(alto * 0.66, sobreTexto);
  const maxAlto = Math.max(alto * 0.18, Math.min(alto * 0.42, base - alto * 0.1));
  const paso = anchoBarras / horas.length;
  barras = { horas, techo, x0, paso, base, maxAlto, topCentrada };
  const luzF = forma((i) => {
    const h = horas[i % horas.length];
    const altoB = Math.max(4, (Math.max(h.precio, 0) / techo) * maxAlto);
    return [x0 + paso * (i % horas.length) + paso * 0.18 + azar() * paso * 0.64, base - azar() * altoB, COLORES[h.tramo], 1];
  });

  // 4 · Cielo: las partículas se apartan y quedan de fondo, tenues, para leer
  const cieloF = forma((i) => [azar() * ancho, azar() * alto, i % 7 === 0 ? COLORES[AGENTES[i % 4]] : COLORES.persona, 0.18 + azar() * 0.22]);

  // 5 · Vuelta al punto
  formas = [punto, cincoF, hilosF, luzF, cieloF, punto];
}

// Escena actual y avance hacia la siguiente, según el desplazamiento
function progreso() {
  const y = scrollY + alto * 0.5;
  // El final de la página cuenta como el centro de la última escena, aunque no llegue a centrarse
  const yMax = document.documentElement.scrollHeight - alto * 0.5;
  for (let i = 0; i < escenas.length - 1; i++) {
    const a = escenas[i].offsetTop + escenas[i].offsetHeight * 0.5;
    const b = Math.min(escenas[i + 1].offsetTop + escenas[i + 1].offsetHeight * 0.5, Math.max(a + 1, yMax));
    if (y < b) return { i, t: Math.min(1, Math.max(0, (y - a) / (b - a))) };
  }
  return { i: escenas.length - 1, t: 0 };
}

// La capa 3D (bigbang.min.js) avisa cuando tapa del todo este lienzo: entonces no se pinta
let tapado = false;
// Con la curvatura en marcha (curvatura.js), el punto de la escena 0 lo pinta ella, no este lienzo
let curvaActiva = false;

function pintar(ahora) {
  if (tapado) return;
  const { i, t: tBruto } = progreso();
  const t = menosMovimiento ? Math.round(tBruto) : suave(tBruto);
  const A = formas[i], B = formas[Math.min(i + 1, formas.length - 1)];
  // El punto respira en la primera y la última escena
  const respira = menosMovimiento ? 1 : 1 + 0.18 * Math.sin(ahora / 900);
  // Cuánto se ve "el punto" (núcleo y halo): entero al principio y al final, y se funde en las transiciones
  const ultima = formas.length - 1;
  const fp = i === 0 ? (curvaActiva ? 0 : 1 - Math.min(1, t * 4)) : i === ultima - 1 ? Math.max(0, t * 4 - 3) : i === ultima ? 1 : 0;
  const enPunto = fp > 0;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.globalCompositeOperation = 'lighter';
  const tam = ancho < 600 ? 1.8 : 1.8;
  // Desfase de las columnas: siguen a su texto (0 cuando su sección está centrada)
  const dyLuz = barras && escenas[3] ? escenas[3].getBoundingClientRect().top - barras.topCentrada : 0;
  const dA = i === 3 ? dyLuz : 0, dB = i + 1 === 3 ? dyLuz : 0;
  for (let k = 0; k < N; k++) {
    const o = k * 6;
    let x = A[o] + (B[o] - A[o]) * t;
    let y = A[o + 1] + dA + (B[o + 1] + dB - A[o + 1] - dA) * t;

    const r = A[o + 2] + (B[o + 2] - A[o + 2]) * t;
    const g = A[o + 3] + (B[o + 3] - A[o + 3]) * t;
    const b = A[o + 4] + (B[o + 4] - A[o + 4]) * t;
    const a = A[o + 5] + (B[o + 5] - A[o + 5]) * t;
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a * (0.5 - 0.44 * fp)})`;
    ctx.fillRect(x - tam / 2, y - tam / 2, tam, tam);
  }
  ctx.globalCompositeOperation = 'source-over';
  pintarLineas(i, tBruto, dyLuz);
  if (enPunto) {
    // El punto: un núcleo blanco nítido con un halo suave
    const c = centro();
    ctx.globalAlpha = fp;
    const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 18 * respira);
    halo.addColorStop(0, 'rgba(255,255,255,0.9)');
    halo.addColorStop(0.25, 'rgba(255,255,255,0.25)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(c.x, c.y, 18 * respira, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(c.x, c.y, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Lo que las partículas solas no dejan leer: los hilos como líneas, los cinco como esferas y las
// columnas como barras macizas. Todo depende solo de la posición de desplazamiento.
const tramo = (t, a, b) => suave(Math.min(1, Math.max(0, (t - a) / (b - a))));
function pintarLineas(i, t, dyLuz) {
  if (menosMovimiento) t = Math.round(t);
  const wNodos = i === 0 ? tramo(t, 0.5, 1) : i === 1 ? 1 : i === 2 ? 1 - tramo(t, 0.2, 0.7) : 0;
  const wHilos = i === 1 ? tramo(t, 0.3, 0.95) : i === 2 ? 1 - tramo(t, 0.25, 0.7) : 0;
  const wLuz = i === 2 ? tramo(t, 0.3, 0.85) : i === 3 ? 1 - tramo(t, 0.6, 0.95) : 0;

  if (wHilos > 0 && hilos.length && geoHilos) {
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    const tramos = 28;
    hilos.forEach((h, k) => {
      // Cada hilo aparece en su turno y se va trazando al desplazar
      const f = Math.min(1, Math.max(0, (wHilos - (k / hilos.length) * 0.5) / 0.5));
      if (f <= 0) return;
      let [px, py] = puntoHilo(h, 0);
      const fin = Math.max(1, Math.ceil(tramos * f));
      for (let j = 1; j <= fin; j++) {
        const s = Math.min(f, j / tramos);
        const [qx, qy] = puntoHilo(h, s);
        ctx.strokeStyle = `rgba(${h.c[0]},${h.c[1]},${h.c[2]},${(0.7 * wHilos * (1 - 0.75 * s)).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
        px = qx; py = qy;
      }
    });
  }

  if (wNodos > 0) {
    for (const p of posicionesCinco()) {
      const col = COLORES[p.quien], rad = p.quien === 'persona' ? 9 : 7;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 2.2);
      g.addColorStop(0, `rgba(${col},${0.95 * wNodos})`);
      g.addColorStop(0.3, `rgba(${col},${0.35 * wNodos})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad * 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (wLuz > 0 && barras) {
    const { horas, techo, x0, paso, base, maxAlto } = barras;
    const y0 = base + dyLuz;
    const ahora = luz ? hoyEnMadrid().hora : -1;
    horas.forEach((h, k) => {
      const altoB = Math.max(3, (Math.max(h.precio, 0) / techo) * maxAlto) * wLuz;
      const col = COLORES[h.tramo] || COLORES.medio;
      ctx.fillStyle = `rgba(${col},${(0.88 * wLuz).toFixed(3)})`;
      ctx.fillRect(x0 + paso * k + paso * 0.16, y0 - altoB, paso * 0.68, altoB);
      if (h.hora === ahora) {
        ctx.fillStyle = `rgba(255,255,255,${wLuz})`;
        ctx.beginPath(); ctx.arc(x0 + paso * (k + 0.5), y0 + 7, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    });
    // Tres horas de referencia bajo el eje
    ctx.fillStyle = `rgba(166,166,166,${(0.9 * wLuz).toFixed(3)})`;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const k of [0, 12, horas.length - 1]) if (horas[k]) ctx.fillText(`${String(horas[k].hora).padStart(2, '0')} h`, x0 + paso * (k + 0.5), y0 + 21);
    ctx.textAlign = 'start';
  }
}

let pendiente = false;
function pedir() { if (!pendiente) { pendiente = true; requestAnimationFrame(bucle); } }
function bucle(ahora) {
  pendiente = false;
  pintar(ahora);
  // Solo se anima de forma continua mientras el punto respira
  const { i, t } = progreso();
  if (!menosMovimiento && !document.hidden && ((i === 0 && t < 0.25) || i >= escenas.length - 2)) pedir();
}

// ---------- Datos reales ----------
async function leer(url, tipo) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), 8000);
  try {
    const r = await fetch(url, { signal: corte.signal });
    if (!r.ok) throw new Error(String(r.status));
    return tipo === 'json' ? r.json() : r.text();
  } finally { clearTimeout(reloj); }
}

function hoyEnMadrid() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const v = (t) => p.find((x) => x.type === t).value;
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: Number(v('hour')) };
}

async function cargarDatos() {
  const [act, csv] = await Promise.allSettled([leer(`${DATOS}actividad.json`, 'json'), leer(`${DATOS}${hoyEnMadrid().fecha.slice(0, 4)}.csv`, 'text')]);

  if (act.status === 'fulfilled') {
    const fus = (act.value.prs || []).filter((p) => p.fusionado);
    const porAutor = new Map(AGENTES.map((a) => [a, 0]));
    for (const p of fus) if (porAutor.has(p.autor)) porAutor.set(p.autor, porAutor.get(p.autor) + 1);
    if (fus.length) {
      prs = { total: fus.length, porAutor };
      const dias = Math.max(1, Math.round((Date.parse(fus[fus.length - 1].fusionado) - Date.parse(fus[0].fusionado)) / 864e5));
      document.querySelector('[data-prs]').textContent = `${fus.length} cambios fusionados en ${dias} días. Lo que hace uno, lo revisa otro.`;
    }
  }

  if (csv.status === 'fulfilled') {
    const { fecha } = hoyEnMadrid();
    const lineas = csv.value.trim().split(/\r?\n/);
    const cab = lineas.shift().split(',');
    const iL = cab.indexOf('fecha_hora_local'), iP = cab.indexOf('eur_mwh');
    const hoy = [];
    for (const l of lineas) {
      if (!l.startsWith(fecha)) continue;
      const c = l.split(','), precio = Number(c[iP]) / 1000;
      if (Number.isFinite(precio)) hoy.push({ hora: Number(c[iL].slice(11, 13)), precio });
    }
    if (hoy.length) {
      const orden = [...hoy].sort((a, b) => a.precio - b.precio), tercio = Math.ceil(orden.length / 3);
      orden.forEach((h, k) => { h.tramo = k < tercio ? 'barato' : k < tercio * 2 ? 'medio' : 'caro'; });
      luz = hoy;
    }
  }
  construirFormas();
  pedir();
}

// ---------- Capa 3D (Charlie): el big bang con three.js, solo si el dispositivo puede ----------
// Se pide después de la apertura (al primer desplazamiento o con el navegador libre) y nunca la
// bloquea. Sin WebGPU ni WebGL 2, con menos movimiento o con ahorro de datos, no se descarga.
function puede3D() {
  if (menosMovimiento || (navigator.connection && navigator.connection.saveData)) return false;
  if ('gpu' in navigator) return true;
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}
if (puede3D()) {
  let pedida = false;
  const cargar3D = () => {
    if (pedida) return;
    pedida = true;
    import('./bigbang.min.js')
      .then((m) => m.iniciar({
        lienzo2D: lienzo, progreso, centro, radio, posicionesCinco, COLORES,
        tapar: (si) => { tapado = si; if (!si) pedir(); },
      }))
      .then((capa) => { document.documentElement.dataset.capa3d = capa.backend; })
      .catch(() => { tapado = false; pedir(); });
  };
  addEventListener('scroll', cargar3D, { once: true, passive: true });
  addEventListener('load', () => (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(cargar3D, { timeout: 2500 }));
}

// ---------- Escena 0 (Miles): el espacio-tiempo curvado hacia el punto ----------
// Se pide nada más abrir: pesa unos 12 KB y no lleva three.js. Con menos movimiento pinta un
// fotograma fijo. Sin WebGL, o si falla, queda el cartel estático (clase sin-curva).
const lienzoCurva = document.querySelector('.lienzo-curva');
if (lienzoCurva) {
  const sinCurva = () => { curvaActiva = false; document.documentElement.classList.add('sin-curva'); pedir(); };
  import('./curvatura.js')
    .then((m) => {
      m.init({
        lienzo: lienzoCurva, progreso, centro, menosMovimiento,
        boton: document.querySelector('.latido-pausa'), alFallar: sinCurva,
      });
      curvaActiva = true;
      document.documentElement.classList.add('curva');
      alinearMarca();
      pedir();
    })
    .catch(sinCurva);
}

// ---------- Frase de entrada: el punto del logotipo «singularity·» es el punto que late ----------
// Con la curvatura en marcha, el logotipo se coloca de modo que su punto caiga justo en centro(),
// donde late el punto de la malla, y la frase queda encima. Si la palabra no cabe a la izquierda
// del centro (móvil estrecho), se reduce. Sin JS o sin WebGL, frase y logotipo van en el flujo normal.
function alinearMarca() {
  const raiz = document.documentElement;
  const marca = document.querySelector('.marca-entrada');
  const pto = marca && marca.querySelector('[data-punto-latido]');
  const titulo = document.querySelector('.escena-0 h1');
  const sec = marca && marca.closest('.escena-0');
  if (!pto || !titulo || !curvaActiva || raiz.dataset.frase === 'joseba') return;
  raiz.classList.add('marca-viva');
  marca.style.fontSize = '';
  const c = centro();
  const margen = parseFloat(getComputedStyle(sec).paddingLeft) || 20;
  let r = marca.getBoundingClientRect(), p = pto.getBoundingClientRect();
  const izq = p.left + p.width / 2 - r.left;
  if (izq > c.x - margen) {
    marca.style.fontSize = `${(parseFloat(getComputedStyle(marca).fontSize) * (c.x - margen)) / izq}px`;
    r = marca.getBoundingClientRect(); p = pto.getBoundingClientRect();
  }
  const dx = p.left + p.width / 2 - r.left, dy = p.top + p.height / 2 - r.top;
  const arriba = c.y - dy - sec.offsetTop;
  marca.style.left = `${c.x - dx}px`;
  marca.style.top = `${arriba}px`;
  titulo.style.bottom = `${sec.offsetHeight - arriba + Math.max(16, r.height * 0.35)}px`;
}

// «DESLIZA» se va en cuanto se empieza a desplazar: ya ha hecho su trabajo y no se monta sobre el big bang.
// Al final, la nube 3D que se recoge en el punto del logotipo se apaga y deja el punto nítido (CSS).
function alDesplazar() {
  document.documentElement.classList.toggle('desplazado', scrollY > 24);
  const capa = document.querySelector('.lienzo-3d');
  if (capa) {
    const { i, t } = progreso();
    const f = i === escenas.length - 2 ? 1 - tramo(t, 0.72, 1) : i === escenas.length - 1 ? 0 : 1;
    capa.style.filter = f < 1 ? `opacity(${f.toFixed(3)})` : '';
    // La capa 3D es opaca: al apagarla, que no asome debajo un fotograma viejo del 2D
    if (f < 1 && ctx) ctx.clearRect(0, 0, ancho, alto);
  }
}

medir();
pedir();
alDesplazar();
addEventListener('scroll', pedir, { passive: true });
addEventListener('scroll', alDesplazar, { passive: true });
addEventListener('resize', () => { medir(); alinearMarca(); pedir(); }, { passive: true });
document.addEventListener('visibilitychange', pedir);
cargarDatos();
