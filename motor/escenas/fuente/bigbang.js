// singularity· · escena del motor: el big bang en 3D (Charlie).
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT
//
// three.js con WebGPURenderer, que cae solo a WebGL 2 si no hay WebGPU. Cada partícula lleva su
// semilla y su nube; la posición la calcula la GPU con TSL. En JavaScript no se mueve ninguna
// partícula, solo cambian unos pocos uniforms a partir de t y del reloj del motor.
//
// Contrato del motor (../../motor.js): aquí solo se dibuja. El bucle, el reloj, el vigilante de
// fps, la pausa y «reducir movimiento» son del motor. El motor la carga después de la apertura y
// solo si el equipo puede (es una escena pesada). El relevo con la curvatura se lee de
// ../../relevos.js: el punto 3D se enciende en PUNTO.aparece, debajo de la luz de la curvatura,
// y explota en PUNTO.entrega, cuando su malla ya no se ve. Un solo punto y un solo latido.
//
// Se compila a ../bigbang.min.js con esbuild: ver ../../README.md.

import {
  WebGPURenderer, Scene, PerspectiveCamera, Sprite, PointsNodeMaterial,
  InstancedBufferAttribute, AdditiveBlending, Color, Vector3, SRGBColorSpace,
} from 'three/webgpu';
import {
  instancedBufferAttribute, uniform, vec3, vec4, float, mix, sin, cos, smoothstep, length, uv,
} from 'three/tsl';
import { PUNTO } from '../../relevos.js';

// En T del motor: se enciende con el relevo y se funde en el primer tercio de la segunda sección
const FUNDE_DESDE = 1.0, FUNDE_HASTA = 1.35;
export const tramo = [PUNTO.aparece, FUNDE_HASTA];
// Respira y gira con el reloj del motor
export const late = true;

const MIN_PARTICULAS = 4000;
// Colores de reserva si la página no trae los tokens --c-*: el punto y sus cuatro nubes
const QUIEN = ['persona', 'miles', 'charlie', 'maya', 'simone'];
const RESERVA = ['#ffffff', '#a2bcff', '#47d6cf', '#f89dc9', '#e6b55d']; // los de preview/singularity/punto.css

const suave = (t) => t * t * (3 - 2 * t);
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));

export async function iniciar(ctx) {
  const { lienzo, centro, radio } = ctx;

  // ---------- Presupuesto ----------
  const movil = ctx.movil;
  const potente = (navigator.hardwareConcurrency || 4) >= 8;
  const N = movil ? (potente ? 20000 : 12000) : (potente ? 100000 : 50000);

  // Opaco y negro, como el fondo: va debajo de la curvatura y del texto, y la mezcla aditiva no se
  // pelea con el alfa del lienzo (con alpha: true, el color aditivo puede pasar del alfa y quemarse al componer)
  const renderer = new WebGPURenderer({ canvas: lienzo, antialias: false, alpha: false, powerPreference: 'high-performance' });
  await renderer.init();
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

  const escena = new Scene();
  const camara = new PerspectiveCamera(35, 1, 1, 20000);

  // ---------- Partículas: datos fijos (semillas fijas, sin Math.random) ----------
  let s = 20261017;
  const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const semilla = new Float32Array(N * 4);
  const extra = new Float32Array(N * 4);
  const color = new Float32Array(N * 3);

  const estilo = getComputedStyle(document.documentElement);
  const colores = QUIEN.map((q, k) => {
    const token = estilo.getPropertyValue(`--c-${q}`).trim();
    return new Color().setStyle(/^#[0-9a-f]{6}$/i.test(token) ? token : RESERVA[k], SRGBColorSpace);
  });

  for (let i = 0; i < N; i++) {
    const z = azar() * 2 - 1, a = azar() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    semilla.set([r * Math.cos(a), r * Math.sin(a), z, azar()], i * 4);
    extra.set([azar(), azar(), i % 5, azar()], i * 4);
    const c = colores[i % 5];
    color.set([c.r, c.g, c.b], i * 3);
  }
  const attrCentro = new InstancedBufferAttribute(new Float32Array(N * 3), 3);

  // ---------- Uniforms ----------
  const uExplosion = uniform(0);   // 0 = punto, 1 = cinco nubes
  const uTiempo = uniform(0);      // el reloj del motor
  const uRespira = uniform(1);
  const uPunto = uniform(new Vector3());
  const uRadioPunto = uniform(14);
  const uRadioNube = uniform(40);
  const uOnda = uniform(200);
  const uBrillo = uniform(0.3);
  const uAparece = uniform(0);

  // ---------- Material: todo el movimiento en TSL ----------
  const sem = instancedBufferAttribute(new InstancedBufferAttribute(semilla, 4));
  const ext = instancedBufferAttribute(new InstancedBufferAttribute(extra, 4));
  const col = instancedBufferAttribute(new InstancedBufferAttribute(color, 3));
  const cenNube = instancedBufferAttribute(attrCentro);
  const dir = sem.xyz, w = sem.w, retraso = ext.x, giro = ext.y;

  // Cada partícula sale un poco más tarde que otra, pasa por una onda y se posa en su nube
  const e = smoothstep(retraso.mul(0.25), retraso.mul(0.25).add(0.75), uExplosion);
  const enPunto = uPunto.add(dir.mul(uRadioPunto.mul(w.pow(3)).mul(uRespira)));
  const local = dir.mul(uRadioNube.mul(w.pow(1.5)));
  const ang = uTiempo.mul(giro.mul(0.5).add(0.15));
  const ca = cos(ang), sa = sin(ang);
  const girado = vec3(local.x.mul(ca).add(local.z.mul(sa)), local.y, local.z.mul(ca).sub(local.x.mul(sa)));
  const enNube = cenNube.add(girado);
  const onda = dir.mul(uOnda.mul(sin(e.mul(Math.PI))).mul(giro.mul(0.6).add(0.4)));

  const material = new PointsNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending });
  material.sizeAttenuation = false;
  material.positionNode = mix(enPunto, enNube, e).add(onda);
  material.sizeNode = float(movil ? 1.7 : 1.5).mul(ext.w.mul(0.8).add(0.6));
  const disco = smoothstep(0.5, 0.15, length(uv().sub(0.5)));
  const alfa = disco.mul(uBrillo).mul(uAparece).mul(giro.mul(0.6).add(0.4));
  material.colorNode = vec4(mix(vec3(1, 1, 1), col, e), alfa);

  const puntos = new Sprite(material);
  puntos.count = N;
  puntos.frustumCulled = false;
  escena.add(puntos);

  // ---------- Geometría de pantalla ----------
  // Mundo en píxeles CSS: el plano z = 0 coincide 1:1 con la pantalla, con y hacia arriba.
  let ancho = 0, alto = 0;
  const aMundo = (x, y, z = 0, out = new Vector3()) => out.set(x - ancho / 2, alto / 2 - y, z);
  const brillo = () => limitar((movil ? 5200 : 12000) / puntos.count, 0.05, 0.6);

  // Las cinco nubes: el punto en el centro y cuatro alrededor, algo por encima del centro del relevo
  function posicionesCinco() {
    const c = { x: ancho / 2, y: alto * (ancho < 600 ? 0.34 : 0.38) }, r = radio();
    return [{ x: c.x, y: c.y }, ...[0, 1, 2, 3].map((i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 2 + Math.PI / 4;
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    })];
  }

  function medir() {
    ancho = innerWidth; alto = innerHeight;
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.position.set(0, 0, alto / 2 / Math.tan((camara.fov * Math.PI) / 360));
    camara.updateProjectionMatrix();
    uRadioNube.value = radio() * 0.42;
    uOnda.value = Math.min(ancho, alto) * 0.45;
    uBrillo.value = brillo();
    const cinco = posicionesCinco(), cen = attrCentro.array, tmp = new Vector3();
    for (let i = 0; i < N; i++) {
      const p = cinco[i % 5];
      aMundo(p.x, p.y, 0, tmp);
      cen.set([tmp.x, tmp.y, tmp.z], i * 3);
    }
    attrCentro.needsUpdate = true;
  }

  // t: 0..1 en el tramo. T es el tiempo del motor, el que usan los relevos.
  function pintar(t, reloj) {
    const T = tramo[0] + t * (tramo[1] - tramo[0]);
    const aparece = suave(limitar((T - PUNTO.aparece) / (PUNTO.entrega - PUNTO.aparece), 0, 1));
    const bang = limitar((T - PUNTO.entrega) / (1 - PUNTO.entrega), 0, 1);
    const funde = 1 - suave(limitar((T - FUNDE_DESDE) / (FUNDE_HASTA - FUNDE_DESDE), 0, 1));
    lienzo.style.opacity = funde.toFixed(3);

    // Mientras el punto es de la curvatura no respira aquí: la respiración entra con la explosión
    const amp = ctx.menosMovimiento ? 0 : suave(limitar(bang * 5, 0, 1));
    uTiempo.value = reloj;
    uRespira.value = 1 + 0.18 * amp * Math.sin(reloj / 0.9);
    uAparece.value = aparece;
    uExplosion.value = bang;
    const c = centro();
    aMundo(c.x, c.y, 0, uPunto.value);
    renderer.render(escena, camara);
  }

  // Si va lento: la mitad de partículas; por debajo del mínimo ya no baja y el motor la retira
  function bajar() {
    if (puntos.count / 2 < MIN_PARTICULAS) return false;
    puntos.count = Math.floor(puntos.count / 2);
    uBrillo.value = brillo();
    return true;
  }

  function retirar() {
    material.dispose();
    renderer.dispose();
  }

  medir();
  return {
    pintar, medir, bajar, retirar,
    // Para las pruebas: qué backend ha salido y cuántas partículas hay
    backend: renderer.backend && renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2',
    particulas: () => puntos.count,
  };
}
