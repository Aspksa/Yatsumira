import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
test('project preflight passes', () => {
  const result = spawnSync(process.execPath, [join(root,'scripts/check-project.mjs')], {cwd:root, encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
});

test('missing TypeScript import is detected', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'yatsumira-import-'));
  try {
    mkdirSync(join(temporary,'scripts'), {recursive:true});
    mkdirSync(join(temporary,'src'), {recursive:true});
    for (const file of ['package.json','index.html']) cpSync(join(root,file),join(temporary,file));
    cpSync(join(root,'src/style.css'),join(temporary,'src/style.css'));
    cpSync(join(root,'scripts/check-project.mjs'),join(temporary,'scripts/check-project.mjs'));
    writeFileSync(join(temporary,'src/main.ts'), 'import "./does-not-exist";\n');
    const result = spawnSync(process.execPath,[join(temporary,'scripts/check-project.mjs')],{encoding:'utf8'});
    assert.equal(result.status,1);
    assert.match(result.stderr,/Unresolved import/);
  } finally { rmSync(temporary,{recursive:true,force:true}); }
});

test('CSS preserves absolute black canvas', () => {
  assert.match(readFileSync(join(root,'src/style.css'),'utf8'),/background:\s*#000(?:000)?\s*;/i);
});
