// Copia las trazas del brief a public/traces para que la app las cargue como
// archivos estáticos. Si el brief no está, se conservan las que ya existan.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
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
