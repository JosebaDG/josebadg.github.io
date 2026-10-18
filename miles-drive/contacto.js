/*
 * Contacto: la dirección no está escrita en el HTML ni aquí en claro.
 * Se monta solo cuando alguien pulsa «Mostrar el correo de contacto».
 */
(function () {
  'use strict';

  var clave = 0x17;
  var parteA = [113, 118, 122, 126, 123, 110, 115, 101, 57, 123, 118, 117];
  var parteB = [122, 120, 116, 57, 123, 126, 118, 122, 112];

  function leer(numeros) {
    return numeros.map(function (n) {
      return String.fromCharCode(n ^ clave);
    }).join('');
  }

  function montar() {
    return leer(parteA) + String.fromCharCode(64) + leer(parteB.slice().reverse());
  }

  var cajas = document.querySelectorAll('[data-contacto]');
  Array.prototype.forEach.call(cajas, function (caja) {
    var boton = caja.querySelector('button');
    var salida = caja.querySelector('[data-contacto-salida]');
    if (!boton || !salida) { return; }

    boton.hidden = false;
    boton.addEventListener('click', function () {
      var direccion = montar();
      var enlace = document.createElement('a');
      enlace.href = 'mai' + 'lto:' + direccion;
      enlace.textContent = direccion;
      salida.textContent = 'Correo de contacto: ';
      salida.appendChild(enlace);
      salida.hidden = false;
      boton.hidden = true;
      enlace.focus();
    });
  });
})();
