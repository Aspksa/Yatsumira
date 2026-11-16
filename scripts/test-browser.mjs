import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

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
  // CHAT DESIGN v14: persistent typography controls and safe local attachments.
  await page.locator('#settings-toggle').click();
  await page.locator('#message-line-height').fill('1.9');
  await page.locator('#message-max-width').fill('80');
  await page.locator('#chat-text-scale').fill('115');
  const typography=await page.evaluate(()=>({
    line:getComputedStyle(document.documentElement).getPropertyValue('--chat-line-height').trim(),
    width:getComputedStyle(document.documentElement).getPropertyValue('--message-max-width').trim(),
    scale:getComputedStyle(document.documentElement).getPropertyValue('--chat-scale').trim()
  }));
  assert.equal(typography.line,'1.9');
  assert.equal(typography.width,'80%');
  assert.equal(typography.scale,'1.15');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#chat-text-scale').inputValue(),'115');
  await page.locator('#chat-file-input').setInputFiles({
    name:'example.txt',mimeType:'text/plain',buffer:Buffer.from('Sample user-owned local file')
  });
  assert.match(await page.locator('#attachment-tray').innerText(),/example.txt/);
  await page.locator('.attachment-chip button').click();
  assert.equal(await page.locator('#attachment-tray').isHidden(),true);
  const safeRender=await page.evaluate(async()=>{
    const {renderSafeAssistantText}=await import('/src/chat-v14.ts');
    const host=document.createElement('div');
    renderSafeAssistantText(host,'Код:\\n'+String.fromCharCode(96).repeat(3)+'javascript\\nconst count = 2;\\n'+String.fromCharCode(96).repeat(3));
    return {frames:host.querySelectorAll('pre code').length,keywords:host.querySelectorAll('.syntax-keyword').length};
  });
  assert.equal(safeRender.frames,1);
  assert.ok(safeRender.keywords>=1);
  const attached=await page.evaluate(async()=>{
    const response=await fetch('/api/knowledge/attachment',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'test-chat-v14.txt',data:btoa('Locally stored test')})
    });
    return {status:response.status,...await response.json()};
  });
  assert.equal(attached.status,201);
  assert.equal(attached.storedLocally,true);
  assert.equal(attached.indexed,false);

  // Snapshots are produced from actual Chromium rendering for visual review.
  const visualDir=join(root,'artifacts','visual');
  mkdirSync(visualDir,{recursive:true});
  await page.waitForTimeout(220);
  await page.locator('#app').screenshot({path:join(visualDir,'nexus-atlas-desktop.png')});
  await page.screenshot({path:join(visualDir,'yatsumira-desktop.png'),fullPage:true});
  // Multi-viewport screenshot suite catches incorrect atlas scaling, clipped controls,
  // unintentional horizontal overflow, and responsiveness regressions.
  for(const [name,viewWidth,viewHeight] of [
    ['compact-desktop',1280,720],
    ['wide-desktop',1920,1080],
    ['tablet',768,1024]
  ]){
    const comparison=await browser.newPage({viewport:{width:viewWidth,height:viewHeight}});
    try{
      await comparison.goto(url,{waitUntil:'networkidle'});
      await comparison.waitForTimeout(200);
      const measurements=await comparison.evaluate(()=>{
        const shell=document.querySelector('.shell');
        const canvas=document.querySelector('#app');
        const header=document.querySelector('.topbar');
        const chat=document.querySelector('.chat-panel');
        const modes=document.querySelector('.nexus-mode-bar');
        return {
          horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+2,
          canvasWidth:canvas?.getBoundingClientRect().width,
          canvasHeight:canvas?.getBoundingClientRect().height,
          headerVisible:!!header && header.getBoundingClientRect().width>0,
          chatVisible:!!chat && chat.getBoundingClientRect().width>0,
          modesVisible:!!modes && modes.getBoundingClientRect().width>0,
          atlasNodes:Number(canvas?.dataset.rendered||0),
        };
      });
      assert.equal(measurements.horizontalOverflow,false,name+' must not overflow horizontally');
      assert.ok(measurements.canvasWidth>250 && measurements.canvasHeight>250,name+' must display usable atlas');
      assert.ok(measurements.headerVisible && measurements.chatVisible && measurements.modesVisible);
      assert.ok(measurements.atlasNodes>0,name+' must render map nodes');
      await comparison.screenshot({path:join(visualDir,'yatsumira-'+name+'.png'),fullPage:true});
      console.log('[YATSUMIRA][VIEWPORT] '+name+' '+JSON.stringify(measurements));
    }finally{await comparison.close();}
  }

  // Reproducible visual measurements for comparing with the provided reference.
  const visualMetrics=await page.locator('#app').evaluate(canvas=>{
    const w=canvas.width,h=canvas.height;
    const pixels=canvas.getContext('2d').getImageData(0,0,w,h).data;
    const centerX=w*.5,centerY=h*.55,radius=Math.min(w,h)*.46;
    const breaks=[0,.15,.36,.65,.85,1.08];
    const total=[0,0,0,0,0],colored=[0,0,0,0,0];
    for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4){
      const distance=Math.hypot(x-centerX,y-centerY)/radius;
      const band=breaks.findIndex((value,i)=>i<breaks.length-1&&distance>=value&&distance<breaks[i+1]);
      if(band<0)continue;
      total[band]++;
      const p=(y*w+x)*4;
      const max=Math.max(pixels[p],pixels[p+1],pixels[p+2]);
      const min=Math.min(pixels[p],pixels[p+1],pixels[p+2]);
      if(max>35&&max-min>10)colored[band]++;
    }
    return {center:[.5,.55],radiusFraction:.46,
      bands:total.map((n,i)=>Number((colored[i]/Math.max(1,n)).toFixed(4)))};
  });
  console.log('[YATSUMIRA][VISUAL] '+JSON.stringify(visualMetrics));
  const referenceBands=[.191,.133,.201,.030,.159]; // Approximate from the supplied screenshot.
  const visualComparison={
    note:"Approximate radial color-density comparison; not SSIM or pixel-perfect likeness.",
    viewport:{width:1440,height:900},
    referenceBands,
    measuredBands:visualMetrics.bands,
    absoluteDifferences:visualMetrics.bands.map((x,i)=>Number(Math.abs(x-referenceBands[i]).toFixed(4))),
    center:visualMetrics.center,
    radiusFraction:visualMetrics.radiusFraction,
  };
  writeFileSync(join(visualDir,'reference-comparison.json'),JSON.stringify(visualComparison,null,2)+'\n','utf8');

  assert.ok(visualMetrics.bands.some(value=>value>.01),'Atlas must render visible colored detail');

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
    const {referenceAtlasPositions}=await import('/src/nexus-reference.ts');
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
    const grown=buildNexusLayout([300,300,300,300,300,300,300,300]);
    const artistic=referenceAtlasPositions(layout);
    const inner=layout.nodes.filter(n=>n.ring<6);
    const movedInner=inner.filter(n=>{const p=artistic.get(n.id);return p && Math.hypot(p.x-n.x,p.y-n.y)>5;}).length;
    const outer=layout.nodes.filter(n=>n.ring>=6);
    const outerSpacing=outer.every(n=>artistic.has(n.id));
    return {
      rings:layout.rings.length,nodes:layout.nodes.length,
      sectorCount:layout.sectors.length,overlap,
      wide:custom.sectors[1].end-custom.sectors[1].start,
      narrow:custom.sectors[0].end-custom.sectors[0].start,
      customCount:custom.nodes.length,
      grownCount:grown.nodes.length,grownRings:grown.rings.length,
      innerLast:layout.rings[5],outerFirst:layout.rings[6],
      positions:artistic.size,movedInner,outerSpacing,
      innerNodes:layout.nodes.filter(n=>n.ring<6).length,
      outerNodes:layout.nodes.filter(n=>n.ring>=6).length
    };
  });
  assert.equal(geometry.rings,8);
  assert.equal(geometry.positions,geometry.nodes);
  assert.ok(geometry.movedInner>geometry.innerNodes*.8,'Reference fan blocks must reorganize most inner nodes');
  assert.equal(geometry.outerSpacing,true,'Every outer icon must retain a radial position');
  assert.equal(geometry.sectorCount,8);
  assert.ok(geometry.outerFirst-geometry.innerLast>70,'Preserve reference-style open label band');
  assert.ok(geometry.innerNodes>geometry.outerNodes*2,'Dense inner dot clusters and sparse outer circular icons');
  assert.ok(geometry.nodes>700,'Demo contains hundreds of nodes');
  assert.equal(geometry.overlap,false,'Markers must not overlap');
  assert.ok(geometry.wide>geometry.narrow*3,'Sector spans should reflect data volume');
  assert.equal(geometry.customCount,272,'Custom sector node count must be preserved');
  assert.equal(geometry.grownCount,2400,'Growing layout must preserve all records');
  assert.ok(geometry.grownRings>8,'Graph must gain outer rings as knowledge grows');
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
  assert.match(await page.locator('#nexus-card-details').textContent(),/Демонстрационный элемент/);
  await page.locator('#nexus-card-close').click();
  assert.equal(await page.locator('#nexus-card').isVisible(),false);
  for(const mode of ["circle","hex","force","rings"]){
    await page.locator('[data-nexus-mode="'+mode+'"]').click();
    await page.waitForFunction(value=>document.querySelector('#app')?.dataset.mode===value,mode);
    assert.equal(await page.locator('[data-nexus-mode="'+mode+'"]').getAttribute('aria-pressed'),'true');
    assert.ok(Number(await page.locator('#app').getAttribute('data-rendered'))>0);
  }
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#app').getAttribute('data-mode'),'rings');

  assert.equal(await page.locator('.chat-panel').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
  assert.equal(await page.locator('.chat-body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
  assert.equal(await page.locator('.cloud-section').count(),1);
  const beforeGrowth=Number(await page.locator('#app').getAttribute('data-knowledge'));
  await page.locator('#settings-toggle').click();
  await page.locator('#knowledge-sector').selectOption('1');
  await page.locator('#knowledge-text').fill('Новая информация: договор поставки и граф знаний NEXUS');
  await page.locator('#knowledge-add').click();
  await page.getByText(/Новая информация сохранена/).waitFor();
  await page.waitForFunction(previous=>Number(document.querySelector('#app')?.dataset.knowledge)>previous,beforeGrowth);
  const beforeSecond=Number(await page.locator('#app').getAttribute('data-knowledge'));
  await page.locator('#knowledge-text').fill('Новая информация: договор поставки и граф оплаты NEXUS');
  await page.locator('#knowledge-add').click();
  await page.waitForFunction(previous=>Number(document.querySelector('#app')?.dataset.knowledge)>previous,beforeSecond);
  const beforeThird=Number(await page.locator('#app').getAttribute('data-knowledge'));
  await page.locator('#knowledge-text').fill('Дополнительные сведения о работе отдельных агентов');
  await page.locator('#knowledge-add').click();
  await page.waitForFunction(previous=>Number(document.querySelector('#app')?.dataset.knowledge)>previous,beforeThird);
  await page.waitForFunction(()=>Number(document.querySelector('#app')?.dataset.groupCount)>=2);
  const savedGraph=await page.evaluate(async()=>{
    const response=await fetch('/api/knowledge/graph');
    const graph=await response.json();
    return {count:graph.records.length,groups:new Set(graph.records.map(r=>r.group)).size,links:graph.links.length};
  });
  assert.ok(savedGraph.count>=3);
  assert.ok(savedGraph.groups>=2,'Different topics must create distinct groups');
  assert.ok(savedGraph.links>=1,'Related notes must produce genuine links');
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(previous=>Number(document.querySelector('#app')?.dataset.knowledge)>previous,beforeGrowth);
  await page.locator('#app').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#nexus-node-badge').textContent(),'НЕ ПРОВЕРЕНО');
  assert.match(await page.locator('#nexus-card-meta').textContent(),/Источник.*Локальная заметка/s);
  assert.ok(await page.locator('#nexus-card-related button').count()>=1,'Display selected-node links');
  await page.locator('#nexus-card-related button').first().click();
  assert.equal(await page.locator('#nexus-card').isVisible(),true);
  await page.locator('#nexus-card-close').click();
  await page.keyboard.press('Escape');
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
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2),false,'Mobile viewport must not overflow horizontally');
  const mobileAtlas=await page.locator('#app').boundingBox();
  assert.ok(mobileAtlas && mobileAtlas.width>=300 && mobileAtlas.height>=250,'Mobile Canvas must remain usable');
  await page.screenshot({path:join(visualDir,'yatsumira-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('[YATSUMIRA] Canvas, chat, responsive layout, console: OK');
} finally {await browser?.close();await server.close();}
