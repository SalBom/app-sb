// tools/optimizar-modelos.mjs
//
// Deja los modelos 3D listos para la web. Los que salen de Meshy pesan 100 MB o
// más (geometría de más de un millón de vértices y texturas de 8K): en el tótem
// tardarían minutos en abrir. Esto los baja a 2–4 MB sin que se note a simple
// vista, con tres pasos: simplificar la malla, achicar las texturas a 2048 px y
// comprimir la geometría (Draco).
//
// USO:
//   node tools/optimizar-modelos.mjs <carpeta-con-glb> [carpeta-de-salida]
//
// Ejemplo:
//   node tools/optimizar-modelos.mjs "C:\\Users\\User\\Downloads\\modelos"
//
// Si no se indica salida, crea una subcarpeta "optimizados". Después, los
// archivos de esa carpeta se suben desde el panel de admin (Modelo 3D).
//
// Los nombres NO se tocan: el panel usa el nombre del archivo para reconocer el
// SKU, igual que con las fotos y las fichas.
import { execSync } from 'node:child_process';
import { readdirSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const entrada = process.argv[2];
const salida = process.argv[3] || (entrada ? join(entrada, 'optimizados') : null);

if (!entrada || !existsSync(entrada)) {
  console.error('Falta la carpeta con los .glb.\n' +
    'Uso: node tools/optimizar-modelos.mjs <carpeta> [carpeta-de-salida]');
  process.exit(1);
}

const mb = (bytes) => (bytes / 1048576).toFixed(2) + ' MB';
const archivos = readdirSync(entrada).filter((f) => f.toLowerCase().endsWith('.glb'));

if (!archivos.length) {
  console.error(`No encontré archivos .glb en ${entrada}`);
  process.exit(1);
}

mkdirSync(salida, { recursive: true });
console.log(`Optimizando ${archivos.length} modelo(s)…\n`);

let ok = 0, fallados = 0, antesTotal = 0, despuesTotal = 0;

for (const archivo of archivos) {
  const origen = join(entrada, archivo);
  const destino = join(salida, basename(archivo));
  const antes = statSync(origen).size;
  process.stdout.write(`  ${archivo} (${mb(antes)}) … `);
  try {
    // npx descarga la herramienta la primera vez y después la reutiliza.
    // Las rutas van entre comillas: en Windows suelen tener espacios.
    execSync(`npx --yes @gltf-transform/cli@latest optimize "${origen}" "${destino}"` +
      ' --texture-size 2048 --compress draco --simplify true', { stdio: 'pipe' });
    const despues = statSync(destino).size;
    antesTotal += antes; despuesTotal += despues; ok++;
    console.log(`→ ${mb(despues)}`);
  } catch (e) {
    fallados++;
    console.log('FALLÓ');
    console.log('    ' + String(e.stderr || e.message).split('\n').slice(-3).join('\n    ').trim());
  }
}

console.log(`\nListos: ${ok}` + (fallados ? ` · Fallaron: ${fallados}` : ''));
if (ok) {
  console.log(`Total: ${mb(antesTotal)} → ${mb(despuesTotal)}`);
  console.log(`Carpeta de salida: ${salida}`);
  console.log('Subí esos archivos desde el panel de admin, en "Modelo 3D".');
}
