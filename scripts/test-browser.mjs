import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const server=await createServer({configFile:resolve(root,'vite.config.mjs'),root,server:{host:'127.0.0.1',port:0,strictPort:false,open:false}});
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
  // Layout invariants: eight rings, no overlapping markers and weighted sectors.
  const geometry=await page.evaluate(async()=>{
    const {buildNexusLayout}=await import('/src/nexus.ts');
    const layout=buildNexusLayout();
    let overlap=false;
    for(let i=0;i<layout.nodes.length;i++){
      for(let j=i+1;j<layout.nodes.length;j++){
        const a=layout.nodes[i],b=layout.nodes[j];
        const dx=a.x-b.x,dy=a.y-b.y;
        if(dx*dx+dy*dy<(a.radius+b.radius+1)**2){overlap=true;break;}
      }
      if(overlap)break;
    }
    const custom=buildNexusLayout([16,160,16,16,16,16,16,16]);
    return {
      rings:layout.rings.length,nodes:layout.nodes.length,
      sectorCount:layout.sectors.length,overlap,
      wide:custom.sectors[1].end-custom.sectors[1].start,
      narrow:custom.sectors[0].end-custom.sectors[0].start,
      customCount:custom.nodes.length
    };
  });
  assert.equal(geometry.rings,8);
  assert.equal(geometry.sectorCount,8);
  assert.ok(geometry.nodes>700,'Demo contains hundreds of nodes');
  assert.equal(geometry.overlap,false,'Markers must not overlap');
  assert.ok(geometry.wide>geometry.narrow*3,'Sector spans should reflect data volume');
  assert.equal(geometry.customCount,272,'Custom sector node count must be preserved');
  const renderStart=await page.locator('#app').getAttribute('data-rendered');
  assert.ok(Number(renderStart)>0,'Canvas renders visible objects');
  const initialZoom=Number(await page.locator('#app').getAttribute('data-zoom'));
  await page.locator('#app').hover({position:{x:220,y:220}});
  await page.mouse.wheel(0,-500);
  await page.waitForTimeout(400);
  const zoomed=Number(await page.locator('#app').getAttribute('data-zoom'));
  assert.ok(zoomed>initialZoom,'Wheel zoom increases scale');
  const bounds=await page.locator('#app').boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x+130,bounds.y+140);
  await page.mouse.down();
  await page.mouse.move(bounds.x+210,bounds.y+205,{steps:7});
  await page.mouse.up();
  await page.waitForTimeout(250);
  const pan=Number(await page.locator('#app').getAttribute('data-pan-x'));
  assert.ok(Math.abs(pan)>20,'Dragging pans the map');
  await page.locator('#app').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#nexus-card').isVisible(),true);
  assert.match(await page.locator('#nexus-card-details').textContent(),/Демонстрационный узел/);
  await page.locator('#nexus-card-close').click();
  assert.equal(await page.locator('#nexus-card').isVisible(),false);
  assert.equal(await page.locator('.chat-panel').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
  assert.equal(await page.locator('.chat-body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
  assert.equal(await page.locator('.cloud-section').count(),1);
  assert.equal(await page.locator('.shell > .topbar').count(),1);
  await page.locator('#settings-toggle').click();
  assert.equal(await page.locator('#settings-panel').isVisible(),true);
  assert.equal(await page.locator('#settings-toggle').getAttribute('aria-expanded'),'true');
  await page.locator('#animation-speed').fill('150');
  assert.equal(await page.locator('#speed-value').textContent(),'150%');
  await page.locator('#chat-width').fill('45');
  assert.equal(await page.locator('#width-value').textContent(),'45%');
  await page.locator('#reset-settings').click();
  assert.equal(await page.locator('#width-value').textContent(),'35%');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#settings-panel').isVisible(),false);
  await page.locator('#app').hover({position:{x:220,y:220}});
  await page.mouse.wheel(0,-420);
  await page.waitForTimeout(300);
  await page.locator('#settings-toggle').click();
  await page.locator('#reset-view').click();
  await page.keyboard.press('Escape');
  assert.ok(result.placeholder);
  await page.locator('#chat-input').fill('Тест');
  await page.locator('#chat-form button[type=submit]').click();
  await page.getByText(/Сначала подключите Cloud.ru/).last().waitFor();
  // Mock only the local API boundary; no provider requests or secret storage in tests.
  await page.route('**/api/cloud/key',async route=>{
    if(route.request().method()==='POST') await route.fulfill({json:{configured:true,persisted:true}});
    else await route.fulfill({json:{configured:false}});
  });
  await page.route('**/api/cloud/models',route=>route.fulfill({json:{models:['test/first','test/second'],selected:''}}));
  await page.route('**/api/cloud/model',route=>route.fulfill({json:{model:'test/first'}}));
  await page.route('**/api/cloud/chat',route=>route.fulfill({json:{answer:'Ответ тестовой модели',model:'test/first'}}));
  await page.locator('#settings-toggle').click();
  await page.locator('#cloud-key').fill('example-fake-key');
  await page.locator('#cloud-save').click();
  await page.getByText(/Доступно моделей: 2/).waitFor();
  assert.equal(await page.locator('#cloud-key').inputValue(),'');
  await page.locator('#cloud-model').selectOption('test/first');
  await page.getByText(/Модель выбрана/).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#chat-input').fill('Привет, тест');
  await page.locator('#chat-form button[type=submit]').click();
  await page.getByText('Ответ тестовой модели').waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.chat-panel').count(),1);
  assert.deepEqual(errors,[]);
  console.log('[YATSUMIRA] Canvas, chat, responsive layout, console: OK');
} finally {await browser?.close();await server.close();}
