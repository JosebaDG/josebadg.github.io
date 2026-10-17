// La Lonja: persiana de la portada y tablero en directo. Sin dependencias.

const DATOS = 'https://josebadg.github.io/Pvpc-bridge/datos/';
const menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)');

// ---------- Persiana ----------
// Donde el navegador anima con el desplazamiento (CSS scroll-driven animations), lo hace el CSS.
// Donde no, se mueve aquí con una variable CSS. Con «menos movimiento» no hay persiana.
function persiana() {
  if (menosMovimiento.matches) return;
  if (window.CSS && CSS.supports('animation-timeline: scroll()')) return;
  const raiz = document.documentElement;
  raiz.classList.add('persiana-js');
  let pendiente = false;
  const pintar = () => {
    pendiente = false;
    const recorrido = window.innerHeight * 0.7;
    const subida = Math.min(1, Math.max(0, window.scrollY / recorrido));
    raiz.style.setProperty('--subida', subida.toFixed(4));
  };
  const pedir = () => {
    if (!pendiente) { pendiente = true; requestAnimationFrame(pintar); }
  };
  addEventListener('scroll', pedir, { passive: true });
  addEventListener('resize', pedir, { passive: true });
  pintar();
}

// ---------- Utilidades de fecha (hora peninsular) ----------
function ahoraEnMadrid() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const v = (t) => partes.find((p) => p.type === t).value;
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: Number(v('hour')) };
}

const euros = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

async function leer(url, tipo) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), 10000);
  try {
    const r = await fetch(url, { signal: corte.signal });
    if (!r.ok) throw new Error(String(r.status));
    return tipo === 'json' ? r.json() : r.text();
  } finally {
    clearTimeout(reloj);
  }
}

// ---------- Panel del precio de la luz ----------
async function panelLuz(raiz) {
  const cifra = raiz.querySelector('[data-precio]');
  const nota = raiz.querySelector('[data-precio-nota]');
  const resumen = raiz.querySelector('[data-precio-resumen]');
  const barras = raiz.querySelector('[data-barras]');
  const { fecha, hora } = ahoraEnMadrid();
  try {
    const texto = await leer(`${DATOS}${fecha.slice(0, 4)}.csv`, 'text');
    const lineas = texto.trim().split(/\r?\n/);
    const cab = lineas.shift().split(',');
    const iLocal = cab.indexOf('fecha_hora_local');
    const iPrecio = cab.indexOf('eur_mwh');
    const hoy = [];
    for (const linea of lineas) {
      if (!linea.startsWith(fecha)) continue;
      const c = linea.split(',');
      const precio = Number(c[iPrecio]) / 1000;
      if (Number.isFinite(precio)) hoy.push({ hora: Number(c[iLocal].slice(11, 13)), precio });
    }
    if (!hoy.length) throw new Error('sin datos de hoy');

    // Tramos por posición en el día: el tercio más barato, el del medio y el más caro
    const orden = [...hoy].sort((a, b) => a.precio - b.precio);
    const tercio = Math.ceil(orden.length / 3);
    const tramo = new Map(orden.map((h, i) => [h, i < tercio ? 'barato' : i < tercio * 2 ? 'medio' : 'caro']));
    const palabras = { barato: 'de las más baratas', medio: 'de precio medio', caro: 'de las más caras' };

    const actual = hoy.find((h) => h.hora === hora) || hoy[hoy.length - 1];
    const min = orden[0];
    const max = orden[orden.length - 1];
    const techo = Math.max(...hoy.map((h) => h.precio), 0.001);

    cifra.innerHTML = `${euros.format(actual.precio)} <small>€/kWh</small>`;
    nota.textContent = `De ${hh(actual.hora)} a ${hh((actual.hora + 1) % 24)}, hora peninsular: una hora ${palabras[tramo.get(actual)]} de hoy. PVPC de la península, sin impuestos.`;
    resumen.textContent = `Lo más barato de hoy, a las ${hh(min.hora)}: ${euros.format(min.precio)} €/kWh. Lo más caro, a las ${hh(max.hora)}: ${euros.format(max.precio)} €/kWh.`;

    barras.replaceChildren(...hoy.map((h) => {
      const b = document.createElement('span');
      b.className = tramo.get(h) + (h === actual ? ' ahora' : '');
      b.style.height = `${Math.max(4, (Math.max(h.precio, 0) / techo) * 100)}%`;
      return b;
    }));
  } catch {
    cifra.textContent = 'Sin datos';
    nota.innerHTML = 'No se ha podido leer el precio de hoy. Está en la <a href="https://josebadg.github.io/Pvpc-bridge/">web de Pvpc-bridge</a>.';
    resumen.textContent = '';
  }
}

// ---------- Panel de actividad del equipo ----------
async function panelEquipo(raiz) {
  const cifra = raiz.querySelector('[data-prs]');
  const reparto = raiz.querySelector('[data-reparto]');
  const nota = raiz.querySelector('[data-prs-nota]');
  try {
    const datos = await leer(`${DATOS}actividad.json`, 'json');
    const fusionados = (datos.prs || []).filter((p) => p.fusionado);
    if (!fusionados.length) throw new Error('vacío');
    const cuenta = new Map((datos.agentes || []).map((a) => [a, 0]));
    for (const p of fusionados) cuenta.set(p.autor, (cuenta.get(p.autor) || 0) + 1);
    const maximo = Math.max(...cuenta.values(), 1);

    cifra.innerHTML = `${fusionados.length} <small>pull requests</small>`;
    reparto.replaceChildren(...[...cuenta].sort((a, b) => b[1] - a[1]).map(([quien, n]) => {
      const li = document.createElement('li');
      const nombre = document.createElement('span');
      nombre.textContent = quien;
      const barra = document.createElement('span');
      barra.className = 'barra';
      barra.setAttribute('aria-hidden', 'true');
      const relleno = document.createElement('i');
      relleno.style.setProperty('--w', `${(n / maximo) * 100}%`);
      barra.append(relleno);
      const cifraAgente = document.createElement('b');
      cifraAgente.textContent = String(n);
      li.append(nombre, barra, cifraAgente);
      return li;
    }));
    const cuando = datos.generado
      ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(datos.generado))
      : null;
    nota.textContent = `Quién abrió cada uno. Datos de la API pública de GitHub${cuando ? `, puestos al día el ${cuando}` : ''}.`;
  } catch {
    cifra.textContent = 'Sin datos';
    nota.innerHTML = 'No se ha podido leer la actividad. Está en <a href="https://josebadg.github.io/Pvpc-bridge/como-se-ha-hecho.html">Cómo se ha hecho</a>.';
  }
}

// ---------- Tablero: solo se descarga cuando se acerca a la pantalla ----------
function tablero() {
  const raiz = document.querySelector('[data-tablero]');
  if (!raiz) return;
  const cargar = () => { panelLuz(raiz); panelEquipo(raiz); };
  if (!('IntersectionObserver' in window)) { cargar(); return; }
  const vigia = new IntersectionObserver((entradas) => {
    if (entradas.some((e) => e.isIntersecting)) { vigia.disconnect(); cargar(); }
  }, { rootMargin: '600px 0px' });
  vigia.observe(raiz);
}

persiana();
tablero();
