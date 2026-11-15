import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const server=await createServer({configFile:false,root,server:{host:'127.0.0.1',port:0,strictPort:false,open:false}});
let browser;
try {
  await server.listen();
  const url=server.resolvedUrls?.local?.[0];
  if(!url) throw new Error('Vite local URL missing');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  const response=await page.goto(url,{waitUntil:'networkidle'});
  assert.equal(response?.status(),200);
  const result=await page.evaluate(()=>{
    const canvas=document.querySelector('#app');
    return {
      canvasExists:canvas instanceof HTMLCanvasElement,
      width:canvas?.width,height:canvas?.height,
      rootBackground:getComputedStyle(document.body).backgroundColor,
      canvasContext:!!canvas?.getContext('2d'),
      chat:!!document.querySelector('#chat-form'),
      placeholder:document.querySelector('#chat-input')?.getAttribute('placeholder'),
    };
  });
  assert.equal(result.canvasExists,true);
  assert.ok(result.width>0&&result.height>0);
  assert.equal(result.canvasContext,true);
  assert.equal(result.rootBackground,'rgb(0, 0, 0)');
  assert.equal(result.chat,true);
  assert.ok(result.placeholder);
  await page.locator('#chat-input').fill('Тест');
  await page.locator('#chat-form button[type=submit]').click();
  await page.getByText('Тест',{exact:true}).waitFor();
  await page.getByText(/демонстрационном режиме/).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.chat-panel').count(),1);
  assert.deepEqual(errors,[]);
  console.log('[YATSUMIRA] Canvas, chat, responsive layout, console: OK');
} finally {await browser?.close();await server.close();}
