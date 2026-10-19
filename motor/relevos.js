// Relevos entre escenas del motor (Charlie). Un solo sitio para cada t de entrega, en T del motor.
// Basado en pdoom-video de Giacomo Magnanini (github.com/mexicat/pdoom-video), MIT
//
// Las dos escenas leen de aquí; si se mueve un relevo, se mueve para las dos a la vez.

// Curvatura → big bang. El punto es de la curvatura hasta que su malla ha caído.
export const PUNTO = {
  aparece: 0.30,   // la malla cae y su luz empieza a apagarse: el punto 3D se enciende debajo de esa luz
  entrega: 0.42,   // la malla ya no se ve: el big bang explota desde aquí
  apagado: 0.58,   // la luz de la curvatura termina de apagarse
};
