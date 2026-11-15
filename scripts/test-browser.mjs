import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const server = await createServer({ configFile:false, root, server:{ host:'127.0.0.1', port:0, strictPort:false, open:false }});
let browser;
try {
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error('Vite did not supply a localhost URL');
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  const response = await page.goto(url, {waitUntil:'networkidle'});
  assert.equal(response?.status(), 200, 'Website must return HTTP 200');
  const state = await page.evaluate(() => {
    const canvas = document.querySelector('#app');
    return {
      canvasExists: canvas instanceof HTMLCanvasElement,
      width: canvas?.width, height: canvas?.height,
      background: getComputedStyle(document.body).backgroundColor,
      canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : null,
      text: document.body.textContent?.trim() || '',
    };
  });
  assert.equal(state.canvasExists,true);
  assert.ok(state.width > 0 && state.height > 0);
  assert.equal(state.background,'rgb(0, 0, 0)');
  assert.equal(state.canvasBackground,'rgb(0, 0, 0)');
  assert.equal(state.text,'');
  assert.deepEqual(errors,[], 'Browser console/page errors');
  console.log('[YATSUMIRA] Browser HTTP/Canvas/black background/JS errors: OK');
} finally {
  await browser?.close();
  await server.close();
}
