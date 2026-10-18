// Laboratorio visual de «singularity·»: la explosión geométrica del punto.
// Todo lo que se pinta es función pura de t (0 a 1) y de una semilla: el mismo t da el mismo fotograma.
// t sale del desplazamiento (scroll como reloj), del modo automático o del deslizador.
// Método inspirado en pdoom-video (github.com/mexicat/pdoom-video, MIT). No copia su código.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ---------- Estado y URL ----------
const D = {
  s: 42, n: 3000, f: 'tetra', d: 'esfera', k: 0, ca: 0.25, ci: 0, p: 0, g: 0.35, ta: 1, r: 3,
  h: 0, b: 1, z: 1, pe: 0, cf: 'e9e6df', ce: 'ffffff', bg: '000000', m: 'scroll', t: 0.5, v: 1, gr: 0.05
};
const FORMAS = ['tetra', 'octa', 'ico', 'cubo', 'tri', 'aguja'];
const REPARTOS = ['esfera', 'espiral', 'anillos', 'red'];
const MODOS = ['scroll', 'auto', 'fijo'];

const PRESETS = {
  'Big bang': {},
  'Cinco': { f: 'octa', ci: 1, p: 1, h: 0.6, ca: 0.15, n: 2500 },
  'Cristal': { f: 'ico', d: 'esfera', k: 6, ca: 0, g: 0.2, n: 1500, ta: 1.3 },
  'Supernova': { f: 'tri', n: 20000, ca: 0.8, b: 1.4, ta: 0.7, r: 3.6 },
  'Espiral': { d: 'espiral', k: 3, f: 'aguja', n: 6000, g: 0.8, ca: 0.1, h: 0.3 },
  'Red': { d: 'red', f: 'cubo', n: 3375, ca: 0, g: 0.15, ta: 0.8 },
  'Lonja': { pe: 1, bg: '14120f', cf: 'a9a294', ce: 'c8f03c', f: 'aguja', d: 'anillos', k: 8, ca: 0.1, n: 4000 }
};

const num = (v, def, lo, hi) => { const x = parseFloat(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def; };
const hex = (v, def) => (/^[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : def);
const una = (v, lista, def) => (lista.includes(v) ? v : def);

function leerURL() {
  const q = new URLSearchParams(location.hash.slice(1));
  const g = (k) => q.get(k);
  return {
    s: Math.round(num(g('s'), D.s, 1, 99999)), n: Math.round(num(g('n'), D.n, 50, 20000)),
    f: una(g('f'), FORMAS, D.f), d: una(g('d'), REPARTOS, D.d), k: Math.round(num(g('k'), D.k, 0, 12)),
    ca: num(g('ca'), D.ca, 0, 1), ci: num(g('ci'), D.ci, 0, 1), p: num(g('p'), D.p, 0, 1), g: num(g('g'), D.g, 0, 2),
    ta: num(g('ta'), D.ta, 0.2, 3), r: num(g('r'), D.r, 1, 6), h: num(g('h'), D.h, 0, 1), b: num(g('b'), D.b, 0, 3),
    z: num(g('z'), D.z, 0.5, 2.5), pe: g('pe') === '1' ? 1 : 0, cf: hex(g('cf'), D.cf), ce: hex(g('ce'), D.ce),
    bg: hex(g('bg'), D.bg), m: una(g('m'), MODOS, D.m), t: num(g('t'), D.t, 0, 1), v: num(g('v'), D.v, 0.1, 4),
    gr: num(g('gr'), D.gr, 0, 0.3)
  };
}

function escribirURL(e) {
  const q = new URLSearchParams();
  for (const k of Object.keys(D)) {
    let v = e[k];
    if (k === 't') v = Math.round(v * 1000) / 1000;
    if (typeof v === 'number' && k !== 't') v = Math.round(v * 100) / 100;
    if (v !== D[k] || k === 's') q.set(k, String(v));
  }
  if (e.m === 'fijo') q.set('t', String(Math.round(e.t * 1000) / 1000));
  history.replaceState(null, '', '#' + q.toString());
}

// ---------- Aleatorio con semilla (nada de Math.random en lo pintado) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Reparto de fragmentos ----------
function repartir(e) {
  const n = e.n, rnd = mulberry32(e.s * 7919 + 13);
  const aPos = new Float32Array(n * 3), aSeed = new Float32Array(n * 4), aAxis = new Float32Array(n * 3);
  const lado = Math.ceil(Math.cbrt(n));
  const oro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    let x, y, z, r;
    if (e.d === 'espiral') {
      const brazos = Math.max(2, e.k || 3);
      const u = (i + 0.5) / n;
      r = 0.15 + 0.85 * Math.sqrt(u);
      const a = (i % brazos) * (2 * Math.PI / brazos) + u * 9.0 + (rnd() - 0.5) * 0.35;
      x = Math.cos(a); z = Math.sin(a); y = (rnd() - 0.5) * 0.25 * (1.2 - r);
    } else if (e.d === 'anillos') {
      const m = 5, ri = i % m;
      const lat = (ri / (m - 1) - 0.5) * Math.PI * 0.75;
      let a = rnd() * Math.PI * 2;
      if (e.k > 0) { const paso = 2 * Math.PI / e.k; a = Math.round(a / paso) * paso + (rnd() - 0.5) * 0.06; }
      x = Math.cos(lat) * Math.cos(a); y = Math.sin(lat); z = Math.cos(lat) * Math.sin(a);
      r = 0.55 + 0.45 * rnd();
    } else if (e.d === 'red') {
      const ix = i % lado, iy = Math.floor(i / lado) % lado, iz = Math.floor(i / (lado * lado));
      x = (ix / (lado - 1 || 1)) * 2 - 1; y = (iy / (lado - 1 || 1)) * 2 - 1; z = (iz / (lado - 1 || 1)) * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      r = l / Math.sqrt(3); x /= l; y /= l; z /= l;
    } else {
      // esfera: dirección uniforme; con simetría, el ángulo se pliega en k radios
      const u = rnd() * 2 - 1, a0 = rnd() * Math.PI * 2;
      let a = a0;
      if (e.k > 0) { const paso = 2 * Math.PI / e.k; a = Math.round(a0 / paso) * paso + (rnd() - 0.5) * 0.05; }
      const s = Math.sqrt(1 - u * u);
      x = s * Math.cos(a); y = u; z = s * Math.sin(a);
      r = 0.3 + 0.7 * Math.pow(rnd(), 0.6);
      if (i % 7 === 0) { const g = i * oro; x = Math.cos(g) * s; z = Math.sin(g) * s; }
    }
    aPos[i * 3] = x * r; aPos[i * 3 + 1] = y * r; aPos[i * 3 + 2] = z * r;
    aSeed[i * 4] = rnd(); aSeed[i * 4 + 1] = rnd(); aSeed[i * 4 + 2] = rnd(); aSeed[i * 4 + 3] = i % 5;
    let ax = rnd() - 0.5, ay = rnd() - 0.5, az = rnd() - 0.5; const al = Math.hypot(ax, ay, az) || 1;
    aAxis[i * 3] = ax / al; aAxis[i * 3 + 1] = ay / al; aAxis[i * 3 + 2] = az / al;
  }
  return { aPos, aSeed, aAxis };
}

function geometriaBase(f) {
  let g;
  if (f === 'octa') g = new THREE.OctahedronGeometry(1);
  else if (f === 'ico') g = new THREE.IcosahedronGeometry(1);
  else if (f === 'cubo') g = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  else if (f === 'tri') {
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.1, 0, -0.95, -0.55, 0, 0.95, -0.55, 0], 3));
  } else if (f === 'aguja') { g = new THREE.TetrahedronGeometry(1); g.scale(0.22, 0.22, 2.2); }
  else g = new THREE.TetrahedronGeometry(1);
  return g.index ? g.toNonIndexed() : g;
}

// ---------- Shaders ----------
const COMUN = /* glsl */`
uniform float uT, uExp, uCol, uRadio, uCaos, uCinco, uGiro, uTam, uFlash, uPaleta;
uniform vec3 uColFrag, uHub[5];
float explo(){ float x = clamp((uT - uExp) / 0.28, 0.0, 1.0); return 1.0 - pow(1.0 - x, 4.0); }
float deriva(){ return clamp((uT - uExp) / (uCol - uExp), 0.0, 1.0); }
float colapso(){ float x = clamp((uT - uCol) / (0.985 - uCol), 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
float fogonazo(){ float x = (uT - uExp) / 0.014; return uFlash * exp(-x * x); }
float formacion(){ return uCinco * smoothstep(uExp + 0.1, uExp + 0.34, uT); }
vec3 hubPos(float h){
  if (h < 0.5) return vec3(0.0);
  vec3 v = h < 1.5 ? vec3(1.0, 1.0, 1.0) : h < 2.5 ? vec3(1.0, -1.0, -1.0) : h < 3.5 ? vec3(-1.0, 1.0, -1.0) : vec3(-1.0, -1.0, 1.0);
  return normalize(v) * uRadio * 0.62;
}
vec3 girar(vec3 p){ float a = uGiro * uT * 6.2831853; float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z); }
vec3 fragPos(vec3 aPos, vec4 aSeed){
  float ex = explo(), dr = deriva();
  vec3 p = aPos * uRadio * ex * (1.0 + 0.3 * dr);
  vec3 q = hubPos(aSeed.w) * ex + aPos * uRadio * 0.3 * ex;
  p = mix(p, q, formacion());
  float ph = aSeed.z * 6.2831853;
  p += vec3(sin(ph + dr * 5.0 + aPos.y * 3.0), sin(ph * 1.7 + dr * 4.0 + aPos.z * 3.0), sin(ph * 2.3 + dr * 6.0 + aPos.x * 3.0)) * uCaos * 0.55 * ex;
  return mix(girar(p), vec3(0.0), colapso());
}
vec3 colorFrag(float h){ return mix(uColFrag, uHub[int(h + 0.5)], uPaleta); }
`;

const VERT_FRAG = /* glsl */`
${COMUN}
attribute vec3 aPos; attribute vec4 aSeed; attribute vec3 aAxis;
varying vec3 vW; varying vec3 vCol;
vec3 rot(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
void main(){
  vec3 c = fragPos(aPos, aSeed);
  float vis = smoothstep(uExp, uExp + 0.02, uT) * (1.0 - smoothstep(0.93, 0.99, uT));
  float s = uTam * (0.45 + aSeed.y) * vis * (1.0 + 0.8 * fogonazo());
  float a = aSeed.z * 6.2831853 + uT * uGiro * 14.0 * (0.4 + aSeed.x) + 3.0 * explo();
  vec3 w = c + rot(position, aAxis, a) * s;
  vW = w; vCol = colorFrag(aSeed.w);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const FRAG_FRAG = /* glsl */`
uniform float uLuz, uFlashNow;
varying vec3 vW; varying vec3 vCol;
void main(){
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 L = -vW; float d = length(L); L /= max(d, 1e-4);
  float dif = abs(dot(n, L));
  float at = 1.0 / (1.0 + 0.16 * d * d);
  vec3 v = normalize(cameraPosition - vW);
  vec3 col = vCol * (0.09 + dif * at * uLuz * 1.35) + vCol * pow(1.0 - abs(dot(n, v)), 3.0) * 0.18;
  col = min(col, vec3(0.8 + 2.5 * uFlashNow));
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT_HILO = /* glsl */`
${COMUN}
attribute vec3 aPos; attribute vec4 aSeed; attribute float aFin;
varying vec3 vCol; varying float vA;
void main(){
  vec3 p;
  if (aFin < 0.5) p = fragPos(aPos, aSeed);
  else p = mix(girar(mix(vec3(0.0), hubPos(aSeed.w) * explo(), formacion())), vec3(0.0), colapso());
  vCol = colorFrag(aSeed.w);
  vA = smoothstep(uExp + 0.06, uExp + 0.3, uT) * (1.0 - smoothstep(0.86, 0.97, uT)) * (0.35 + 0.65 * aSeed.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG_HILO = /* glsl */`
uniform float uHilos;
varying vec3 vCol; varying float vA;
void main(){ gl_FragColor = vec4(min(vCol * 0.7, vec3(0.7)), vA * uHilos * 0.35); }`;

const VERT_PUNTO = /* glsl */`
${COMUN}
uniform float uPx;
varying float vI;
void main(){
  float ex = explo(), c = colapso(), f = fogonazo();
  float resp = 1.0 + 0.14 * sin(uT * 70.0) * (1.0 - ex);
  float tam = uPx * resp * mix(1.0, 0.4, ex * (1.0 - c)) * (1.0 + 7.0 * f);
  vI = mix(2.4, 1.15, ex * (1.0 - c)) + 3.0 * f;
  gl_PointSize = tam;
  gl_Position = projectionMatrix * viewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
}`;

const FRAG_PUNTO = /* glsl */`
uniform vec3 uColPunto;
varying float vI;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  float nucleo = smoothstep(0.42, 0.0, r);
  vec3 col = uColPunto * (a * 0.35 + nucleo * vI);
  gl_FragColor = vec4(col, a);
}`;

const VERT_PERSIANA = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG_PERSIANA = /* glsl */`
uniform float uT, uExp; uniform vec2 uRes; uniform vec3 uColP, uColLuz;
varying vec2 vUv;
void main(){
  float sube = smoothstep(0.02, uExp - 0.012, uT);
  float yb = sube * 1.08;
  if (vUv.y < yb) discard;
  float f = fract((vUv.y - yb) * 15.0);
  float lama = smoothstep(0.0, 0.07, f) * smoothstep(1.0, 0.9, f);
  vec3 col = uColP * (0.5 + 0.5 * f) * lama;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float dc = length((vUv - 0.5) * asp);
  col += uColLuz * (1.0 - lama) * exp(-dc * 5.0) * (1.4 - sube);
  vec2 k = (vUv - 0.5) * asp;
  float ojo = step(length(k - vec2(0.0, 0.012)), 0.014) + step(abs(k.x), 0.006) * step(k.y, 0.012) * step(-0.03, k.y);
  col = mix(col, uColLuz * 2.6, clamp(ojo, 0.0, 1.0) * (1.0 - sube));
  col *= 1.0 - 0.7 * smoothstep(0.025, 0.0, vUv.y - yb);
  gl_FragColor = vec4(col, 1.0);
}`;

const GRANO = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uGrano: { value: 0.05 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT, uGrano; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){ vec4 c = texture2D(tDiffuse, vUv);
    float g = h(gl_FragCoord.xy + floor(uT * 240.0) * 17.0) - 0.5;
    float vi = smoothstep(1.15, 0.35, length(vUv - 0.5) * 1.6);
    c.rgb = c.rgb * mix(0.55, 1.0, vi) + g * uGrano * 0.5;
    gl_FragColor = c; }`
};

// ---------- Escena ----------
const lienzo = document.querySelector('.lienzo');
const modoVideo = new URLSearchParams(location.search).has('video');
const menosMov = matchMedia('(prefers-reduced-motion: reduce)').matches;
let e = leerURL();
if (menosMov && !location.hash) { e.m = 'fijo'; e.t = 0.5; }

const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: modoVideo });
const movil = matchMedia('(pointer: coarse)').matches;
let dpr = Math.min(window.devicePixelRatio || 1, movil ? 2 : 2);
renderer.setPixelRatio(dpr);
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

const U = {
  uT: { value: e.t }, uExp: { value: 0.16 }, uCol: { value: 0.84 }, uRadio: { value: e.r }, uCaos: { value: e.ca },
  uCinco: { value: e.ci }, uGiro: { value: e.g }, uTam: { value: 0.09 }, uFlash: { value: menosMov ? 0 : 1 },
  uPaleta: { value: e.p }, uColFrag: { value: new THREE.Color() },
  uHub: { value: ['#ffffff', '#a2bcff', '#47d6cf', '#f89dc9', '#e6b55d'].map((c) => new THREE.Color(c)) },
  uLuz: { value: 1 }, uFlashNow: { value: 0 }, uHilos: { value: e.h }, uPx: { value: 22 },
  uColPunto: { value: new THREE.Color() }, uRes: { value: new THREE.Vector2(1, 1) }, uColP: { value: new THREE.Color('#3a3630') },
  uColLuz: { value: new THREE.Color() }
};

const matFrag = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT_FRAG, fragmentShader: FRAG_FRAG, side: THREE.DoubleSide });
const matHilo = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT_HILO, fragmentShader: FRAG_HILO, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const matPunto = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT_PUNTO, fragmentShader: FRAG_PUNTO, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
const matPersiana = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT_PERSIANA, fragmentShader: FRAG_PERSIANA, depthTest: false, depthWrite: false });

let malla = null, hilos = null;
const punto = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)), matPunto);
punto.frustumCulled = false; punto.renderOrder = 2; escena.add(punto);
const persiana = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matPersiana);
persiana.frustumCulled = false; persiana.renderOrder = 10; escena.add(persiana);

let firmaGeo = '';
function construir() {
  const firma = [e.s, e.n, e.f, e.d, e.k, e.h > 0].join('|');
  if (firma === firmaGeo) return;
  firmaGeo = firma;
  const { aPos, aSeed, aAxis } = repartir(e);
  if (malla) { escena.remove(malla); malla.geometry.dispose(); }
  const base = geometriaBase(e.f);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 4));
  g.setAttribute('aAxis', new THREE.InstancedBufferAttribute(aAxis, 3));
  g.instanceCount = e.n;
  malla = new THREE.Mesh(g, matFrag); malla.frustumCulled = false; escena.add(malla);
  if (hilos) { escena.remove(hilos); hilos.geometry.dispose(); hilos = null; }
  if (e.h > 0) {
    const L = Math.min(e.n, 6000), paso = e.n / L;
    const p = new Float32Array(L * 6), s = new Float32Array(L * 8), fin = new Float32Array(L * 2);
    for (let j = 0; j < L; j++) {
      const i = Math.floor(j * paso);
      for (let v = 0; v < 2; v++) {
        p.set(aPos.subarray(i * 3, i * 3 + 3), (j * 2 + v) * 3);
        s.set(aSeed.subarray(i * 4, i * 4 + 4), (j * 2 + v) * 4);
        fin[j * 2 + v] = v;
      }
    }
    const gl = new THREE.BufferGeometry();
    gl.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    gl.setAttribute('aPos', new THREE.Float32BufferAttribute(p, 3));
    gl.setAttribute('aSeed', new THREE.Float32BufferAttribute(s, 4));
    gl.setAttribute('aFin', new THREE.Float32BufferAttribute(fin, 1));
    hilos = new THREE.LineSegments(gl, matHilo); hilos.frustumCulled = false; hilos.renderOrder = 1; escena.add(hilos);
  }
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(escena, camara));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1, 0.45, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grano = new ShaderPass(GRANO);
composer.addPass(grano);

function aplicar() {
  construir();
  U.uRadio.value = e.r; U.uCaos.value = e.ca; U.uCinco.value = e.ci; U.uGiro.value = e.g; U.uPaleta.value = e.p;
  U.uHilos.value = e.h; U.uTam.value = 0.09 * e.ta * Math.cbrt(3000 / e.n) * (e.r / 3);
  U.uColFrag.value.set('#' + e.cf); U.uColPunto.value.set('#' + e.ce); U.uColLuz.value.set('#' + e.ce);
  escena.background = new THREE.Color('#' + e.bg);
  document.documentElement.style.setProperty('--fondo', '#' + e.bg);
  bloom.strength = e.b;
  grano.uniforms.uGrano.value = e.gr;
  persiana.visible = !!e.pe;
  medir();
  pedir();
}

function medir() {
  const w = lienzo.clientWidth || innerWidth, h = lienzo.clientHeight || innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  camara.aspect = w / h;
  const tg = Math.tan(THREE.MathUtils.degToRad(20));
  const d = Math.max(10, (e.r * 1.05) / (tg * camara.aspect)) / e.z;
  camara.position.set(0, 0, d * (e.r / 3)); camara.lookAt(0, 0, 0);
  camara.updateProjectionMatrix();
  U.uRes.value.set(w, h);
  U.uPx.value = 22 * dpr * Math.min(1.4, Math.max(0.8, Math.min(w, h) / 420));
}

function pintar(t) {
  U.uT.value = t;
  const x = (t - U.uExp.value) / 0.014;
  U.uFlashNow.value = U.uFlash.value * Math.exp(-x * x);
  const dr = Math.min(1, Math.max(0, (t - U.uExp.value) / (U.uCol.value - U.uExp.value)));
  U.uLuz.value = (1 + 6 * U.uFlashNow.value) * (0.6 + 0.4 * (1 - dr));
  grano.uniforms.uT.value = t;
  composer.render();
}

// ---------- Reloj ----------
let tVis = e.t, tObj = e.t, ultimo = 0, enMarcha = false, pausado = false;
function tScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
}
function pedir() { if (!enMarcha) { enMarcha = true; requestAnimationFrame(bucle); } }
let lentos = 0, ventana = 0, cuadros = 0;
function bucle(ahora) {
  const dt = ultimo ? Math.min(0.1, (ahora - ultimo) / 1000) : 0.016;
  ultimo = ahora;
  let seguir = false;
  if (e.m === 'scroll') { tObj = tScroll(); tVis += (tObj - tVis) * Math.min(1, dt * 7); if (Math.abs(tObj - tVis) > 0.0004) seguir = true; else tVis = tObj; }
  else if (e.m === 'auto') { if (!pausado) { tVis = (tVis + dt * e.v / 9) % 1; seguir = true; } }
  else { tVis = e.t; }
  pintar(tVis);
  ui.reloj(tVis);
  // nivel por dispositivo: si va por debajo de 30 fps, se baja la densidad de píxeles
  if (seguir) {
    ventana += dt; cuadros++;
    if (ventana > 1.5) { if (cuadros / ventana < 30 && dpr > 1) { lentos++; if (lentos >= 2) { dpr = Math.max(1, dpr - 0.5); medir(); lentos = 0; } } else lentos = 0; ventana = 0; cuadros = 0; }
  }
  if (seguir && !document.hidden) requestAnimationFrame(bucle); else { enMarcha = false; ultimo = 0; }
}
addEventListener('scroll', () => { if (e.m === 'scroll') pedir(); }, { passive: true });
addEventListener('resize', () => { medir(); pedir(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) pedir(); });

// ---------- Interfaz ----------
const CONTROLES = [
  { g: 'Reloj', k: 'm', l: 'Modo', tipo: 'sel', op: [['scroll', 'Desplazar'], ['auto', 'Automático'], ['fijo', 'Fijo']] },
  { g: 'Reloj', k: 'v', l: 'Velocidad (automático)', min: 0.1, max: 4, paso: 0.1 },
  { g: 'Forma', k: 's', l: 'Semilla', min: 1, max: 9999, paso: 1, dado: true },
  { g: 'Forma', k: 'n', l: 'Fragmentos', min: 50, max: 20000, paso: 50 },
  { g: 'Forma', k: 'f', l: 'Fragmento', tipo: 'sel', op: [['tetra', 'Tetraedro'], ['octa', 'Octaedro'], ['ico', 'Icosaedro'], ['cubo', 'Cubo'], ['tri', 'Triángulo'], ['aguja', 'Aguja']] },
  { g: 'Forma', k: 'd', l: 'Reparto', tipo: 'sel', op: [['esfera', 'Esfera'], ['espiral', 'Espiral'], ['anillos', 'Anillos'], ['red', 'Red']] },
  { g: 'Forma', k: 'k', l: 'Simetría (0 = libre)', min: 0, max: 12, paso: 1 },
  { g: 'Movimiento', k: 'ca', l: 'Caos', min: 0, max: 1, paso: 0.01 },
  { g: 'Movimiento', k: 'ci', l: 'Uno se hace cinco', min: 0, max: 1, paso: 0.01 },
  { g: 'Movimiento', k: 'g', l: 'Giro', min: 0, max: 2, paso: 0.01 },
  { g: 'Movimiento', k: 'r', l: 'Alcance', min: 1, max: 6, paso: 0.1 },
  { g: 'Movimiento', k: 'ta', l: 'Tamaño', min: 0.2, max: 3, paso: 0.05 },
  { g: 'Movimiento', k: 'z', l: 'Zoom', min: 0.5, max: 2.5, paso: 0.05 },
  { g: 'Luz y color', k: 'h', l: 'Hilos', min: 0, max: 1, paso: 0.05 },
  { g: 'Luz y color', k: 'b', l: 'Brillo del punto', min: 0, max: 3, paso: 0.05 },
  { g: 'Luz y color', k: 'gr', l: 'Grano', min: 0, max: 0.3, paso: 0.01 },
  { g: 'Luz y color', k: 'p', l: 'Colores del equipo', min: 0, max: 1, paso: 0.01 },
  { g: 'Luz y color', k: 'cf', l: 'Color de los fragmentos', tipo: 'color' },
  { g: 'Luz y color', k: 'ce', l: 'Color del punto', tipo: 'color' },
  { g: 'Luz y color', k: 'bg', l: 'Fondo', tipo: 'color' },
  { g: 'Luz y color', k: 'pe', l: 'Persiana de la Lonja', tipo: 'check' }
];

const ui = (() => {
  const panel = document.getElementById('panel');
  const cuerpo = document.getElementById('panel-cuerpo');
  const btnPanel = document.getElementById('btn-panel');
  const btnPausa = document.getElementById('btn-pausa');
  const tSlider = document.getElementById('t');
  const tSalida = document.getElementById('t-salida');
  const aviso = document.getElementById('aviso');
  const campos = {};
  let grupo = null, gActual = '';
  const fmt = (c, v) => (c.paso >= 1 ? String(Math.round(v)) : Number(v).toFixed(2));
  for (const c of CONTROLES) {
    if (c.g !== gActual) { gActual = c.g; grupo = document.createElement('fieldset'); const lg = document.createElement('legend'); lg.textContent = c.g; grupo.append(lg); cuerpo.append(grupo); }
    const fila = document.createElement('div'); fila.className = 'fila';
    const id = 'c-' + c.k;
    const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = c.l;
    let inp, out = null;
    if (c.tipo === 'sel') {
      inp = document.createElement('select');
      for (const [v, t] of c.op) { const o = document.createElement('option'); o.value = v; o.textContent = t; inp.append(o); }
    } else if (c.tipo === 'color') { inp = document.createElement('input'); inp.type = 'color'; }
    else if (c.tipo === 'check') { inp = document.createElement('input'); inp.type = 'checkbox'; fila.classList.add('fila-check'); }
    else {
      inp = document.createElement('input'); inp.type = 'range'; inp.min = c.min; inp.max = c.max; inp.step = c.paso;
      out = document.createElement('output'); out.htmlFor = id;
    }
    inp.id = id;
    fila.append(lab);
    if (out) fila.append(out);
    fila.append(inp);
    if (c.dado) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mini'; b.textContent = 'Otra semilla';
      // elegir una semilla nueva no pinta nada al azar: la semilla queda en el enlace
      b.addEventListener('click', () => { e.s = 1 + Math.floor(Math.random() * 9999); cambio(); });
      fila.append(b);
    }
    const leer = () => {
      if (c.tipo === 'sel') e[c.k] = inp.value;
      else if (c.tipo === 'color') e[c.k] = inp.value.slice(1);
      else if (c.tipo === 'check') e[c.k] = inp.checked ? 1 : 0;
      else e[c.k] = parseFloat(inp.value);
      if (c.k === 'm') { tVis = e.m === 'scroll' ? tScroll() : tVis; e.t = tVis; pausado = false; }
      cambio(c.tipo === 'range' || c.tipo === 'color');
    };
    inp.addEventListener('input', leer);
    if (c.tipo === 'sel' || c.tipo === 'check') inp.addEventListener('change', leer);
    grupo.append(fila);
    campos[c.k] = { c, inp, out };
  }
  const pre = document.getElementById('presets');
  for (const nombre of Object.keys(PRESETS)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mini'; b.textContent = nombre;
    b.addEventListener('click', () => { const m = e.m, t = e.t, v = e.v; e = Object.assign({}, D, PRESETS[nombre], { m, t, v }); cambio(); avisar('Receta «' + nombre + '»'); });
    pre.append(b);
  }
  function volcar() {
    for (const k in campos) {
      const { c, inp, out } = campos[k];
      if (c.tipo === 'color') inp.value = '#' + e[k];
      else if (c.tipo === 'check') inp.checked = !!e[k];
      else inp.value = e[k];
      if (out) out.textContent = fmt(c, e[k]);
    }
    btnPausa.hidden = e.m !== 'auto';
    btnPausa.textContent = pausado ? 'Seguir' : 'Pausa';
    document.documentElement.dataset.modo = e.m;
  }
  let tURL = 0;
  function cambio(suave) {
    volcar(); aplicar();
    clearTimeout(tURL); tURL = setTimeout(() => escribirURL(e), suave ? 250 : 0);
  }
  btnPanel.addEventListener('click', () => {
    const abrir = panel.hidden; panel.hidden = !abrir; btnPanel.setAttribute('aria-expanded', String(abrir));
    if (abrir) panel.querySelector('select, input, button').focus();
  });
  document.getElementById('btn-cerrar').addEventListener('click', () => { panel.hidden = true; btnPanel.setAttribute('aria-expanded', 'false'); btnPanel.focus(); });
  btnPausa.addEventListener('click', () => { pausado = !pausado; volcar(); pedir(); });
  tSlider.addEventListener('input', () => {
    const t = parseFloat(tSlider.value);
    if (e.m === 'scroll') {
      const max = document.documentElement.scrollHeight - innerHeight;
      scrollTo({ top: t * max, behavior: 'instant' }); tVis = t;
    } else { e.m = 'fijo'; e.t = t; tVis = t; volcar(); clearTimeout(tURL); tURL = setTimeout(() => escribirURL(e), 250); }
    pedir();
  });
  function avisar(txt) { aviso.textContent = txt; aviso.hidden = false; clearTimeout(avisar.t); avisar.t = setTimeout(() => { aviso.hidden = true; }, 2600); }
  document.getElementById('btn-compartir').addEventListener('click', async () => {
    e.t = Math.round(tVis * 1000) / 1000;
    const m = e.m; if (m !== 'auto') e.m = 'fijo';
    escribirURL(e); e.m = m;
    const url = location.href;
    try {
      if (navigator.share) { await navigator.share({ title: 'singularity· laboratorio', url }); avisar('Enlace listo'); }
      else { await navigator.clipboard.writeText(url); avisar('Enlace copiado'); }
    } catch (err) { if (err && err.name !== 'AbortError') avisar('Copia el enlace de la barra de direcciones'); }
    escribirURL(e);
  });
  document.getElementById('btn-foto').addEventListener('click', () => {
    pintar(tVis);
    lienzo.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'singularity-lab-' + e.s + '.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'singularity·' }); return; }
      } catch (err) { if (err && err.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });
  return {
    volcar,
    reloj(t) { tSlider.value = t; tSalida.textContent = t.toFixed(2); }
  };
})();

addEventListener('hashchange', () => { e = leerURL(); ui.volcar(); aplicar(); });

// Modo vídeo: se pinta un fotograma exacto para cada t (lo usa el render de micro vídeos)
window.labRender = (t, calidad) => { pintar(t); return lienzo.toDataURL('image/jpeg', calidad || 0.9); };

if (modoVideo) document.documentElement.classList.add('video');
if (e.m === 'scroll' && !modoVideo) {
  // si el enlace trae un t, se coloca el desplazamiento en ese punto
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has('t')) requestAnimationFrame(() => { const max = document.documentElement.scrollHeight - innerHeight; scrollTo(0, e.t * max); tVis = e.t; pedir(); });
  else tVis = tScroll();
}
ui.volcar();
aplicar();
document.documentElement.classList.add('listo');
