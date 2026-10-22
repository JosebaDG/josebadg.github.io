// Lente en perspectiva, versión WebGL2 (Charlie, laboratorio). Cumple el contrato de escena del
// motor (lab/charlie-visor/CONTRATO.md): tramo, late e iniciar(ctx) → { pintar(t, reloj), retirar() }
// más medir() y bajar(). Lo demás (pintarVacio, sincronizar, ponerNivel) es para medir en pagina.js.
// Dos pasadas: primero la lente (el agujero visto con la cámara de la malla) y encima la malla, con suma
// de luz; la malla no se pinta donde la tapa la sombra.

import {
  tramo, late, NIVELES, limitar, construirMalla, parametros, datosMalla, datosLente,
  GLSL_VS_MALLA, GLSL_FS_MALLA, GLSL_VS_LENTE, GLSL_FS_LENTE,
} from './comun.js';

export { tramo, late, NIVELES };

function programa(gl, vs, fs, atributos) {
  const sh = (tipo, src) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  atributos.forEach((n, i) => gl.bindAttribLocation(p, i, n));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('programa: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const nombre = gl.getActiveUniform(p, i).name; u[nombre] = gl.getUniformLocation(p, nombre); }
  return { p, u };
}

export async function iniciar(ctx) {
  const lienzo = ctx.lienzo;
  const gl = lienzo.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('este navegador no tiene WebGL 2');
  const malla = programa(gl, GLSL_VS_MALLA, GLSL_FS_MALLA, ['aP', 'aInfo']);
  const lente = programa(gl, GLSL_VS_LENTE, GLSL_FS_LENTE, ['aP']);

  const vaoMalla = gl.createVertexArray();
  const bufMalla = gl.createBuffer();
  const bufIdx = gl.createBuffer();
  const vaoLente = gl.createVertexArray();
  gl.bindVertexArray(vaoLente);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  let nivel = limitar(Number.isInteger(ctx.nivel) ? ctx.nivel : (ctx.movil ? 1 : 2), 0, NIVELES.length - 1);
  let cuantos = 0, L = 0, deNivel = -1;
  // La malla de cada nivel se construye al cambiar de nivel, nunca dentro de pintar()
  function cargarMalla() {
    if (deNivel === nivel) return;
    const m = construirMalla(nivel);
    gl.bindVertexArray(vaoMalla);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufMalla);
    gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    cuantos = m.idx.length; L = m.L; deNivel = nivel;
  }

  let ancho = 0, alto = 0, dpr = 1;
  function medir() {
    dpr = Math.min(devicePixelRatio || 1, NIVELES[nivel].dpr);
    ancho = innerWidth; alto = innerHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    cargarMalla();
  }

  const dm = new Float32Array(36), dl = new Float32Array(36);
  function pintar(t, reloj) {
    const F = parametros(t, reloj, ctx, nivel, ancho, alto);
    const escala = lienzo.width / ancho;
    datosMalla(F, lienzo, escala, L, dm);
    datosLente(F, lienzo, dl);
    gl.viewport(0, 0, lienzo.width, lienzo.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // La lente, sobre el negro: escribe sin mezclar
    gl.disable(gl.BLEND);
    gl.useProgram(lente.p);
    gl.uniform4fv(lente.u['uL[0]'], dl);
    gl.bindVertexArray(vaoLente);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // La malla encima: luz que se suma
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(malla.p);
    const u = malla.u;
    gl.uniformMatrix4fv(u.uVP, false, dm.subarray(0, 16));
    gl.uniform2f(u.uRes, dm[16], dm[17]);
    gl.uniform1f(u.uProf, dm[18]);
    gl.uniform1f(u.uGiro, dm[19]);
    gl.uniform1f(u.uFase, dm[20]);
    gl.uniform1f(u.uOnda, dm[21]);
    gl.uniform1f(u.uMedio, dm[22]);
    gl.uniform1f(u.uLatido, dm[23]);
    gl.uniform1f(u.uAltoPx, dm[24]);
    gl.uniform1f(u.uL, dm[25]);
    gl.uniform1f(u.uCalor, dm[26]);
    gl.uniform4fv(u.uOjoB, dm.subarray(28, 32));
    gl.uniform4fv(u.uHueco, dm.subarray(32, 36));
    gl.bindVertexArray(vaoMalla);
    gl.drawElements(gl.TRIANGLES, cuantos, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  // Si va lento, baja un nivel: 2 → 1 (menos resolución, menos muestras) → 0 (resolución 1, menos líneas)
  function bajar() {
    if (nivel <= 0) return false;
    nivel--;
    medir();
    return true;
  }
  function ponerNivel(x) { nivel = limitar(x, 0, NIVELES.length - 1); medir(); }

  // Espera a que la GPU acabe el cuadro (lee un píxel): para medir milisegundos por fotograma
  const px = new Uint8Array(4);
  function sincronizar() { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }

  // Cuadro vacío: el mismo lienzo, solo borrado, sin dibujar
  function pintarVacio() {
    gl.viewport(0, 0, lienzo.width, lienzo.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  const fallo = ctx.fallo || (() => {});
  function perdido(e) { e.preventDefault(); fallo(); }
  lienzo.addEventListener('webglcontextlost', perdido);
  function retirar() {
    lienzo.removeEventListener('webglcontextlost', perdido);
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }

  medir();
  return {
    pintar, pintarVacio, medir, bajar, retirar, sincronizar, ponerNivel,
    get nivel() { return nivel; },
    get resolucion() { return { ancho: lienzo.width, alto: lienzo.height, dpr }; },
  };
}
