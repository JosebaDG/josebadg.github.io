// Relevos entre escenas del motor (Charlie). Un solo sitio para cada t de entrega, en T del motor.
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT
//
// Las escenas leen de aquí; si se mueve un relevo, se mueve para todas a la vez.

// Curvatura → big bang. El punto es de la curvatura hasta que su malla ha caído.
export const PUNTO = {
  aparece: 0.30,   // la malla cae y su luz empieza a apagarse: el punto 3D se enciende debajo de esa luz
  entrega: 0.42,   // la malla ya no se ve: el big bang explota desde aquí
  apagado: 0.58,   // la luz de la curvatura termina de apagarse
};

// Vuelta al punto, en la última transición (sección 2 → sección 3, la del logotipo).
// El cielo sale mientras se lee la sección 2 y cae en espiral al punto del logotipo ([data-punto-final]).
export const VUELTA = {
  desde: 2.0,      // el cielo empieza a encenderse, tenue, debajo del texto
  cae: 2.3,        // las partículas empiezan a caer hacia el punto final
  llega: 2.9,      // la última partícula ha llegado: queda el punto con su halo
  hasta: 3.0,      // fin de la página
};
