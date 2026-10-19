// Copia las trazas del brief a public/traces para que la app las cargue como
// archivos estáticos. Si el brief no está, se conservan las que ya existan.
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../presentacion-ta-brief/traces/', import.meta.url));
const target = fileURLToPath(new URL('../public/traces/', import.meta.url));

if (existsSync(source)) {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log(`Trazas sincronizadas: ${source} -> ${target}`);
} else if (existsSync(target)) {
  console.log('No se encontró el brief; se usan las trazas de public/traces.');
} else {
  console.error('No hay trazas: copia la carpeta traces/ a public/traces.');
  process.exit(1);
}

// Copia los .py que usa src/code/excerpts.ts a src/code/source para que el build
// no dependa de ../talent_acquisition (que no existe en Vercel).
const codeSource = fileURLToPath(new URL('../../talent_acquisition/', import.meta.url));
const codeTarget = fileURLToPath(new URL('../src/code/source/', import.meta.url));
const excerpts = readFileSync(fileURLToPath(new URL('../src/code/excerpts.ts', import.meta.url)), 'utf8');
const pyFiles = [...excerpts.matchAll(/from '\.\/source\/(.+?)\?raw'/g)].map((m) => m[1]);

if (existsSync(codeSource)) {
  for (const file of pyFiles) {
    mkdirSync(dirname(codeTarget + file), { recursive: true });
    cpSync(codeSource + file, codeTarget + file);
  }
  console.log(`Código sincronizado: ${pyFiles.length} archivos de ${codeSource}`);
} else {
  console.log('No se encontró talent_acquisition; se usa el código de src/code/source.');
}
