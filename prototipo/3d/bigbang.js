// singularity· · el big bang en 3D (Charlie).
//
// Capa 3 de «Un punto»: three.js con WebGPURenderer, que cae solo a WebGL 2 si no hay WebGPU.
// Cada partícula lleva su semilla y su nube; la posición la calcula la GPU con TSL a partir
// del desplazamiento. En JavaScript no se mueve ninguna partícula, solo cambian unos pocos uniforms.
//
// Qué hace esta capa y qué deja al 2D (punto.js):
//   escena 0 → 1   el punto quieto que respira explota en cinco nubes (aquí, en 3D)
//   escena 1 → 2   el 3D se funde con el 2D, que sigue con los hilos
//   escenas 2 y 3  hilos y columnas del precio: 2D (el 3D no dibuja)
//   escena 4 → 5   el 3D vuelve: el cielo se recoge en el punto final («singularity·»)
//
// Reglas: se carga con import() después de la apertura, sin CDN, sin secuestrar el scroll.
// Si baja de 30 fps de forma sostenida, primero va con la mitad de partículas y luego se retira
// y queda el 2D. El movimiento que no viene del scroll (respirar, girar) se para 5 s después
// del último gesto (WCAG 2.2.2). Este archivo se compila a ../bigbang.min.js: ver README.md.

import {
  WebGPURenderer, Scene, PerspectiveCamera, Sprite, PointsNodeMaterial,
  InstancedBufferAttribute, AdditiveBlending, Color, Vector3, SRGBColorSpace,
} from 'three/webgpu';
import {
  instancedBufferAttribute, uniform, vec3, vec4, float, mix, sin, cos, smoothstep, length, uv,
} from 'three/tsl';

const AGENTES = ['Miles', 'Charlie', 'Maya', 'Simone'];
const QUIEN = ['persona', ...AGENTES]; // mismo orden que posicionesCinco() de punto.js
const QUIETO_TRAS = 5000; // ms sin gesto hasta que se para el movimiento propio
const FPS_MIN = 30;
const MIN_PARTICULAS = 4000;

const suave = (t) => t * t * (3 - 2 * t);
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));

export async function iniciar(api) {
  const { lienzo2D, progreso, centro, radio, posicionesCinco, COLORES, tapar } = api;

  // ---------- Presupuesto ----------
  const movil = innerWidth < 600 || matchMedia('(pointer: coarse)').matches;
  const potente = (navigator.hardwareConcurrency || 4) >= 8;
  const N = movil ? (potente ? 20000 : 12000) : (potente ? 100000 : 50000);

  // ---------- Lienzo y renderer ----------
  const lienzo = document.createElement('canvas');
  lienzo.className = 'lienzo lienzo-3d';
  lienzo.setAttribute('aria-hidden', 'true');
  lienzo.style.opacity = '0';

  const renderer = new WebGPURenderer({ canvas: lienzo, antialias: false, alpha: false, powerPreference: 'high-performance' });
  await renderer.init();
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  lienzo2D.after(lienzo);

  const escena = new Scene();
  const camara = new PerspectiveCamera(35, 1, 1, 20000);

  // ---------- Partículas: datos fijos por partícula ----------
  // semilla: dirección al azar en la esfera (xyz) y distancia al centro de su nube (w)
  // extra:   retraso (x), giro y brillo (y), dueño 0..4 (z), tamaño (w)
  let s = 20261017;
  const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const semilla = new Float32Array(N * 4);
  const extra = new Float32Array(N * 4);
  const color = new Float32Array(N * 3);
  const colorCielo = new Float32Array(N * 3);

  const estilo = getComputedStyle(document.documentElement);
  const colorDe = (quien) => {
    // Los colores viven en los tokens --c-* de Maya; si aún no están, los de punto.js.
    const c = new Color();
    const token = estilo.getPropertyValue(`--c-${quien.toLowerCase()}`).trim();
    if (/^#[0-9a-f]{6}$/i.test(token)) return c.setStyle(token, SRGBColorSpace);
    const [r, g, b] = COLORES[quien] || [255, 255, 255];
    return c.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
  };
  const colores = QUIEN.map(colorDe);
  const blanco = new Color(1, 1, 1);

  for (let i = 0; i < N; i++) {
    const z = azar() * 2 - 1, a = azar() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    semilla.set([r * Math.cos(a), r * Math.sin(a), z, azar()], i * 4);
    const dueno = i % 5;
    extra.set([azar(), azar(), dueno, azar()], i * 4);
    const c = colores[dueno];
    color.set([c.r, c.g, c.b], i * 3);
    // En el cielo casi todo es blanco y una de cada siete conserva su color, como en el 2D
    const cc = i % 7 === 0 ? colores[1 + (i % 4)] : blanco;
    colorCielo.set([cc.r, cc.g, cc.b], i * 3);
  }

  // Lo que depende del tamaño de la ventana: centro de cada nube y sitio en el cielo
  const attrCentro = new InstancedBufferAttribute(new Float32Array(N * 3), 3);
  const attrCielo = new InstancedBufferAttribute(new Float32Array(N * 3), 3);

  // ---------- Uniforms ----------
  const uExplosion = uniform(0);   // 0 = punto, 1 = cinco nubes
  const uRecogida = uniform(0);    // 0 = cielo, 1 = punto final
  const uFase = uniform(0);        // 0 = tramo del big bang, 1 = tramo de la vuelta
  const uTiempo = uniform(0);      // solo avanza mientras hay movimiento propio
  const uRespira = uniform(1);
  const uPunto = uniform(new Vector3());
  const uFinal = uniform(new Vector3());
  const uRadioPunto = uniform(14);
  const uRadioNube = uniform(40);
  const uOnda = uniform(200);
  const uBrillo = uniform(0.3);

  // ---------- Material: todo el movimiento en TSL ----------
  const sem = instancedBufferAttribute(new InstancedBufferAttribute(semilla, 4));
  const ext = instancedBufferAttribute(new InstancedBufferAttribute(extra, 4));
  const col = instancedBufferAttribute(new InstancedBufferAttribute(color, 3));
  const colCielo = instancedBufferAttribute(new InstancedBufferAttribute(colorCielo, 3));
  const cenNube = instancedBufferAttribute(attrCentro);
  const cielo = instancedBufferAttribute(attrCielo);

  const dir = sem.xyz, w = sem.w, retraso = ext.x, giro = ext.y;

  // Big bang: cada partícula sale un poco más tarde que otra, pasa por una onda y se posa en su nube
  const e = smoothstep(retraso.mul(0.25), retraso.mul(0.25).add(0.75), uExplosion);
  const enPunto = uPunto.add(dir.mul(uRadioPunto.mul(w.pow(3)).mul(uRespira)));
  const local = dir.mul(uRadioNube.mul(w.pow(1.5)));
  const ang = uTiempo.mul(giro.mul(0.5).add(0.15));
  const ca = cos(ang), sa = sin(ang);
  const girado = vec3(local.x.mul(ca).add(local.z.mul(sa)), local.y, local.z.mul(ca).sub(local.x.mul(sa)));
  const enNube = cenNube.add(girado);
  const onda = dir.mul(uOnda.mul(sin(e.mul(Math.PI))).mul(giro.mul(0.6).add(0.4)));
  const posBang = mix(enPunto, enNube, e).add(onda);
  const colBang = mix(vec3(1, 1, 1), col, e);

  // Vuelta: el cielo cae en espiral hacia el punto final
  const v = smoothstep(retraso.mul(0.3), retraso.mul(0.3).add(0.7), uRecogida);
  const enFinal = uFinal.add(dir.mul(uRadioPunto.mul(0.8).mul(w.pow(3)).mul(uRespira)));
  const d = cielo.sub(uFinal);
  const espiral = vec3(d.y.negate(), d.x, 0).mul(sin(v.mul(Math.PI)).mul(0.45));
  const posVuelta = mix(cielo, enFinal, v).add(espiral);
  const colVuelta = mix(colCielo, vec3(1, 1, 1), v);
  const brilloVuelta = mix(float(0.55), float(1), v);

  const material = new PointsNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending });
  material.sizeAttenuation = false;
  material.positionNode = mix(posBang, posVuelta, uFase);
  material.sizeNode = float(movil ? 1.7 : 1.5).mul(ext.w.mul(0.8).add(0.6));
  const disco = smoothstep(0.5, 0.15, length(uv().sub(0.5)));
  const alfa = disco.mul(uBrillo).mul(giro.mul(0.6).add(0.4)).mul(mix(float(1), brilloVuelta, uFase));
  material.colorNode = vec4(mix(colBang, colVuelta, uFase), alfa);

  const puntos = new Sprite(material);
  puntos.count = N;
  puntos.frustumCulled = false;
  escena.add(puntos);

  // ---------- Geometría de pantalla ----------
  // Mundo en píxeles CSS: el plano z = 0 coincide 1:1 con la pantalla, con y hacia arriba.
  let ancho = 0, alto = 0;
  const aMundo = (x, y, z = 0, out = new Vector3()) => out.set(x - ancho / 2, alto / 2 - y, z);

  function medir() {
    ancho = innerWidth; alto = innerHeight;
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.position.set(0, 0, alto / 2 / Math.tan((camara.fov * Math.PI) / 360));
    camara.updateProjectionMatrix();

    const r = radio();
    uRadioNube.value = r * 0.42;
    uRadioPunto.value = 14;
    uOnda.value = Math.min(ancho, alto) * 0.45;
    // Con muchas partículas, cada una brilla menos: el punto y las nubes no se queman a blanco
    uBrillo.value = limitar((movil ? 5200 : 12000) / puntos.count, 0.05, 0.6);

    const cinco = posicionesCinco();
    const cen = attrCentro.array, cie = attrCielo.array, tmp = new Vector3();
    s = 7;
    for (let i = 0; i < N; i++) {
      const p = cinco[i % 5];
      aMundo(p.x, p.y, 0, tmp);
      cen.set([tmp.x, tmp.y, tmp.z], i * 3);
      aMundo(azar() * ancho, azar() * alto, (azar() - 0.5) * alto * 0.6, tmp);
      cie.set([tmp.x, tmp.y, tmp.z], i * 3);
    }
    attrCentro.needsUpdate = true;
    attrCielo.needsUpdate = true;
  }

  function puntoFinal(out) {
    // Si el logotipo ya marca su punto (data-punto-final), la vuelta acaba ahí; si no, en el centro.
    const el = document.querySelector('[data-punto-final]');
    if (el) {
      const b = el.getBoundingClientRect();
      if (b.width || b.height) return aMundo(b.left + b.width / 2, b.top + b.height / 2, 0, out);
    }
    const c = centro();
    return aMundo(c.x, c.y, 0, out);
  }

  // ---------- Bucle ----------
  let ultimoGesto = performance.now();
  let tiempo = 0, previo = 0, entrada = 0, pendiente = false, retirado = false, tapando = null;
  let ventana = { t0: 0, frames: 0 }, lentas = 0;

  // Qué hace el 3D en cada tramo del desplazamiento, y cuánto se ve (0..1)
  function estado() {
    const { i, t } = progreso();
    if (i === 0) return { fase: 0, bang: t, vuelta: 0, op: 1, vivo: true };
    if (i === 1) return { fase: 0, bang: 1, vuelta: 0, op: 1 - suave(limitar(t / 0.35, 0, 1)), vivo: true };
    if (i === 2 || i === 3) return { fase: 0, bang: 1, vuelta: 0, op: 0, vivo: false };
    if (i === 4) return { fase: 1, bang: 1, vuelta: t, op: suave(limitar(t / 0.3, 0, 1)), vivo: true };
    return { fase: 1, bang: 1, vuelta: 1, op: 1, vivo: true };
  }

  function pedir() { if (!pendiente && !retirado) { pendiente = true; requestAnimationFrame(cuadro); } }

  function cuadro(ahora) {
    pendiente = false;
    if (retirado) return;
    const dt = previo ? Math.min(ahora - previo, 100) : 16;
    previo = ahora;

    const st = estado();
    entrada = Math.min(1, entrada + dt / 600);
    const op = st.op * entrada;
    lienzo.style.opacity = op.toFixed(3);
    const tapa = op >= 0.999;
    if (tapa !== tapando) { tapando = tapa; tapar(tapa); }

    if (op <= 0.001) { previo = 0; return; } // nada que dibujar: el 2D manda

    // Movimiento propio (respirar y girar) solo hasta 5 s después del último gesto
    const quieto = ahora - ultimoGesto > QUIETO_TRAS;
    const amp = quieto ? 0 : 1;
    if (!quieto) tiempo += dt / 1000;
    uTiempo.value = tiempo;
    uRespira.value = 1 + 0.18 * amp * Math.sin(tiempo / 0.9);

    uExplosion.value = st.bang;
    uRecogida.value = st.vuelta;
    uFase.value = st.fase;
    const c = centro();
    aMundo(c.x, c.y, 0, uPunto.value);
    puntoFinal(uFinal.value);

    renderer.render(escena, camara);
    vigilar(ahora, dt);

    if (!document.hidden && (!quieto || entrada < 1)) pedir();
  }

  // Si va lento de forma sostenida: mitad de partículas; si sigue lento, se retira y queda el 2D
  function vigilar(ahora, dt) {
    if (dt > 90) { ventana = { t0: ahora, frames: 0 }; return; } // pestaña recuperada o pausa: no cuenta
    if (!ventana.t0) ventana.t0 = ahora;
    ventana.frames++;
    if (ahora - ventana.t0 < 1500) return;
    const fps = (ventana.frames * 1000) / (ahora - ventana.t0);
    ventana = { t0: ahora, frames: 0 };
    lentas = fps < FPS_MIN ? lentas + 1 : 0;
    if (lentas < 2) return;
    lentas = 0;
    if (puntos.count / 2 >= MIN_PARTICULAS) {
      puntos.count = Math.floor(puntos.count / 2);
      uBrillo.value = limitar((movil ? 5200 : 12000) / puntos.count, 0.05, 0.6);
    } else retirar();
  }

  function retirar() {
    retirado = true;
    removeEventListener('scroll', alGesto);
    removeEventListener('resize', alCambiar);
    document.removeEventListener('visibilitychange', alGesto);
    lienzo.remove();
    material.dispose();
    renderer.dispose();
    tapar(false);
  }

  function alGesto() { ultimoGesto = performance.now(); previo = 0; pedir(); }
  function alCambiar() { medir(); alGesto(); }

  medir();
  addEventListener('scroll', alGesto, { passive: true });
  addEventListener('resize', alCambiar, { passive: true });
  document.addEventListener('visibilitychange', alGesto);
  pedir();

  // Para las pruebas: qué backend ha salido y cuántas partículas hay
  return {
    backend: renderer.backend && renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2',
    particulas: () => puntos.count,
    retirar,
  };
}
