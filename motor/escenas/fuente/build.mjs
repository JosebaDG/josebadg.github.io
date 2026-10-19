// Compila bigbang.js a ../bigbang.min.js.
//
// relevos.js no se copia dentro: queda como import externo y el navegador lo lee en tiempo de
// ejecución, el mismo archivo que lee la curvatura. Así un relevo movido vale para las dos escenas
// sin recompilar. Después se comprueba la salida y la compilación falla si lleva una copia.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const SALIDA = '../bigbang.min.js';
// Ruta de relevos.js vista desde la salida (motor/escenas/), no desde la fuente (motor/escenas/fuente/)
const RELEVOS = '../relevos.js';

const relevosFuera = {
  name: 'relevos-fuera',
  setup(b) {
    b.onResolve({ filter: /(^|\/)relevos\.js$/ }, () => ({ path: RELEVOS, external: true }));
  },
};

await build({
  entryPoints: ['bigbang.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  legalComments: 'eof',
  outfile: SALIDA,
  plugins: [relevosFuera],
});

const min = readFileSync(SALIDA, 'utf8');
const importa = new RegExp(`from\\s*"${RELEVOS.replace(/[.\/]/g, '\\$&')}"`).test(min);
const copia = /aparece\s*:/.test(min) || /entrega\s*:/.test(min) || /apagado\s*:/.test(min);
if (!importa || copia) {
  console.error(`build: ${SALIDA} tiene que importar ${RELEVOS} y no llevar una copia de sus valores`);
  process.exit(1);
}
console.log(`build: ${SALIDA} lee ${RELEVOS} en tiempo de ejecución`);
