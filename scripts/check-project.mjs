import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (message) => errors.push(message);
const read = (name) => readFileSync(resolve(root, name), 'utf8');

let pkg;
try {
  pkg = JSON.parse(read('package.json'));
  for (const field of ['dev', 'build']) {
    if (typeof pkg.scripts?.[field] !== 'string') fail('Missing npm script: ' + field);
  }
  if (!pkg.devDependencies?.vite || !pkg.devDependencies?.typescript) {
    fail('Vite and TypeScript must be in devDependencies');
  }
} catch (error) { fail('package.json: ' + error.message); }

try {
  const html = read('index.html');
  if (!html.includes('id="app"') || !html.includes('/src/main.ts')) {
    fail('index.html must contain canvas#app and TypeScript entrypoint');
  }
  const css = read('src/style.css');
  if (!/background:\s*#000(?:000)?\s*;/i.test(css)) fail('Black background missing from CSS');
} catch (error) { fail('Required web files: ' + error.message); }

const visited = new Set();
function checkImports(path) {
  if (visited.has(path)) return;
  visited.add(path);
  let source;
  try { source = readFileSync(path, 'utf8'); }
  catch (error) { fail('Unable to read source ' + path + ': ' + error.message); return; }
  const pattern = /(?:\bimport\s*(?:[\s\S]*?\s+from\s*)?|\bexport\s*[^;\n]*?\s+from\s*)['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const target = resolve(dirname(path), specifier);
    const candidates = extname(target) ? [target] : [
      target, target + '.ts', target + '.tsx', target + '.js',
      resolve(target, 'index.ts'), resolve(target, 'index.js'),
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) fail('Unresolved import ' + specifier + ' in ' + path);
    else if (/\.[cm]?[jt]sx?$/.test(found)) checkImports(found);
  }
}
checkImports(resolve(root, 'src/main.ts'));

if (errors.length) {
  for (const error of errors) console.error('[YATSUMIRA][CONFIG] ' + error);
  process.exitCode = 1;
} else {
  console.log('[YATSUMIRA] Vite configuration, HTML/CSS, and local imports: OK');
}
