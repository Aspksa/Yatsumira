import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#app");
const log = document.querySelector<HTMLDivElement>("#messages");
const form = document.querySelector<HTMLFormElement>("#chat-form");
const input = document.querySelector<HTMLTextAreaElement>("#chat-input");
if (!canvas || !log || !form || !input) throw new Error("Yatsumira interface elements missing");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas 2D is not supported");

const palette = ["#5adbd0", "#88d7e7", "#b2a8ed", "#d8aa75", "#62b99d", "#75a8bb", "#c4b0a1", "#9d90cf"];
const labels = ["MEMORY", "SKILLS", "NETWORK", "ANALYTICS", "CORE", "SYSTEM", "ARCHIVE", "SECURITY"];
const TWO_PI = Math.PI * 2;
let width = 0;
let height = 0;
let pixelRatio = 1;
let pointerX = -9999;
let pointerY = -9999;
let activeSector = -1;

let zoom = 1;
let targetZoom = 1;
let panX = 0;
let panY = 0;
let targetPanX = 0;
let targetPanY = 0;
let animationSpeed = 1;
const zoomMin = .65;
const zoomMax = 3.5;
const settingsButton = document.querySelector<HTMLButtonElement>("#settings-toggle");
const settingsPanel = document.querySelector<HTMLElement>("#settings-panel");
const speedInput = document.querySelector<HTMLInputElement>("#animation-speed");
const widthInput = document.querySelector<HTMLInputElement>("#chat-width");
const speedValue = document.querySelector<HTMLOutputElement>("#speed-value");
const widthValue = document.querySelector<HTMLOutputElement>("#width-value");
const resetViewButton = document.querySelector<HTMLButtonElement>("#reset-view");
const resetSettingsButton = document.querySelector<HTMLButtonElement>("#reset-settings");
if (!settingsButton || !settingsPanel || !speedInput || !widthInput || !speedValue || !widthValue || !resetViewButton || !resetSettingsButton) {
  throw new Error("Settings controls are missing");
}
type Preferences = { speed?: number; width?: number };
let preferences: Preferences = {};
try {
  const raw: unknown = JSON.parse(localStorage.getItem("yatsumira-ui") || "{}");
  if (raw && typeof raw === "object") preferences = raw as Preferences;
} catch { /* Invalid or disabled local storage */ }
function clamp(n: number, low: number, high: number): number { return Math.max(low,Math.min(high,n)); }
if (typeof preferences.speed === "number" && Number.isFinite(preferences.speed)) speedInput.value = String(clamp(preferences.speed,0,200));
if (typeof preferences.width === "number" && Number.isFinite(preferences.width)) widthInput.value = String(clamp(preferences.width,25,55));
function syncSettings(): void {
  animationSpeed = Number(speedInput!.value)/100;
  speedValue!.value = speedInput!.value+"%";
  const widthPercent = Number(widthInput!.value);
  widthValue!.value = widthPercent+"%";
  document.documentElement.style.setProperty("--chat-share", String(widthPercent/100));
  try { localStorage.setItem("yatsumira-ui",JSON.stringify({speed:Number(speedInput!.value),width:widthPercent})); } catch { /* Optional preference storage */ }
}
syncSettings();
speedInput.addEventListener("input",syncSettings);
widthInput.addEventListener("input",syncSettings);
function resetView():void {targetZoom=1;targetPanX=0;targetPanY=0;}
resetViewButton.addEventListener("click",resetView);
resetSettingsButton.addEventListener("click",()=>{
  speedInput.value="100"; widthInput.value="35"; syncSettings(); resetView();
});
function closeSettings():void {
  settingsPanel!.hidden=true;
  settingsButton!.setAttribute("aria-expanded","false");
}
settingsButton.addEventListener("click",()=>{
  const opening=settingsPanel!.hidden;
  settingsPanel!.hidden=!opening;
  settingsButton!.setAttribute("aria-expanded",String(opening));
});
document.addEventListener("keydown",(event)=>{
  if(event.key==="Escape" && !settingsPanel!.hidden) { closeSettings(); settingsButton!.focus(); }
});
document.addEventListener("pointerdown",(event)=>{
  if (!settingsPanel!.hidden && event.target instanceof Node && !settingsPanel!.contains(event.target) && !settingsButton!.contains(event.target)) closeSettings();
});
canvas.addEventListener("wheel",(event:WheelEvent)=>{
  event.preventDefault();
  const bounds=canvas.getBoundingClientRect();
  const px=event.clientX-bounds.left;
  const py=event.clientY-bounds.top;
  const previous=targetZoom;
  targetZoom=clamp(previous*Math.exp(-event.deltaY*.0012),zoomMin,zoomMax);
  const ratio=targetZoom/previous;
  targetPanX=px-width/2-(px-width/2-targetPanX)*ratio;
  targetPanY=py-height/2-(py-height/2-targetPanY)*ratio;
},{passive:false});

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const started = performance.now();

function resize(): void {
  const rect = canvas!.getBoundingClientRect();
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  canvas!.width = Math.max(1, Math.round(width * pixelRatio));
  canvas!.height = Math.max(1, Math.round(height * pixelRatio));
}
window.addEventListener("resize", resize, { passive:true });
const observer = new ResizeObserver(resize);
observer.observe(canvas);
resize();

function ring(x:number,y:number,r:number,color:string,alpha=1,lineWidth=1):void {
  ctx!.beginPath();ctx!.arc(x,y,r,0,TWO_PI);ctx!.strokeStyle=color;ctx!.globalAlpha=alpha;ctx!.lineWidth=lineWidth;ctx!.stroke();ctx!.globalAlpha=1;
}
function dot(x:number,y:number,r:number,color:string,glow=0):void {
  ctx!.beginPath();ctx!.arc(x,y,r,0,TWO_PI);ctx!.fillStyle=color;
  if (glow) {ctx!.shadowBlur=glow;ctx!.shadowColor=color;}
  ctx!.fill();ctx!.shadowBlur=0;
}
function point(cx:number,cy:number,r:number,a:number):[number,number] {return [cx+Math.cos(a)*r,cy+Math.sin(a)*r];}

function frame(now:number):void {
  const t = reducedMotion ? 0 : (now-started)/1000*animationSpeed;
  ctx!.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  ctx!.clearRect(0,0,width,height);
  const cx=width*.5, cy=height*.5;
  const smooth = reducedMotion ? 1 : .2;
  zoom += (targetZoom-zoom)*smooth;
  panX += (targetPanX-panX)*smooth;
  panY += (targetPanY-panY)*smooth;
  ctx!.save();
  ctx!.translate(cx+panX,cy+panY);
  ctx!.scale(zoom,zoom);
  ctx!.translate(-cx,-cy);
  const R=Math.min(width*.485,height*.465,385);
  if (R<20) {ctx!.restore();requestAnimationFrame(frame);return;}

  const glow=ctx!.createRadialGradient(cx,cy,R*.07,cx,cy,R*1.2);
  glow.addColorStop(0,"#0b2628");glow.addColorStop(.28,"#071619");glow.addColorStop(.72,"#030a0e");glow.addColorStop(1,"#000000");
  ctx!.fillStyle=glow;ctx!.fillRect(0,0,width,height);
  ring(cx,cy,R*1.008,"#315056",.23);
  ring(cx,cy,R*.975,"#456d74",.15);
  ring(cx,cy,R*.51,"#365963",.20);
  ring(cx,cy,R*.37,"#345560",.15);
  ring(cx,cy,R*.20,"#527f80",.20);
  ring(cx,cy,R*.122,"#467c7a",.32);

  // Eight distinct orbital sectors: concentric terminal nodes.
  for(let sector=0;sector<8;sector++){
    const center=-Math.PI/2+sector*TWO_PI/8;
    const start=center-.34, end=center+.34;
    const color=palette[sector];
    for(let row=0;row<3;row++){
      const r=R*(.80+row*.075);
      const count=18+row*2;
      for(let i=0;i<count;i++){
        const a=start+(end-start)*i/(count-1);
        const [x,y]=point(cx,cy,r,a);
        const emphasis=(i+sector*3+row*2)%7===0;
        ring(x,y,R*.0122,color,sector===activeSector?.95:.37,emphasis?1.15:.8);
        if(emphasis) dot(x,y,R*.0025,color,0);
      }
    }
    const [lx,ly]=point(cx,cy,R*.67,center);
    ctx!.fillStyle=sector===activeSector?"#c7fff3":"#688e92";
    ctx!.font=`${Math.max(8,R*.026)}px Consolas,monospace`;
    ctx!.textAlign="center";ctx!.textBaseline="middle";
    ctx!.fillText(labels[sector],lx,ly);
    const [px,py]=point(cx,cy,R*.51,center);
    const [qx,qy]=point(cx,cy,R*.58,center);
    ctx!.beginPath();ctx!.moveTo(px,py);ctx!.lineTo(qx,qy);ctx!.strokeStyle=color;ctx!.globalAlpha=.24;ctx!.stroke();ctx!.globalAlpha=1;
  }

  // Data fields between the core and orbital rings.
  for(let sector=0;sector<8;sector++){
    const center=-Math.PI/2+sector*TWO_PI/8;
    const color=palette[sector];
    for(let row=0;row<12;row++){
      const radius=R*(.30+row*.020);
      for(let col=0;col<8;col++){
        const a=center+((col-3.5)*.034);
        const [x,y]=point(cx,cy,radius,a);
        const pulse=.35+.4*(.5+.5*Math.sin(t*1.3+row*.6+col*.7+sector));
        dot(x,y,Math.max(.8,R*.0032),color,pulse>.64?5:0);
        ctx!.globalAlpha=1;
      }
    }
  }

  // Sparse moving particles around the perimeter.
  for(let i=0;i<44;i++){
    const a=(i/44)*TWO_PI+t*(.008+(i%3)*.003);
    const r=R*(.58+(i%5)*.072);
    const [x,y]=point(cx,cy,r,a);
    ctx!.globalAlpha=.12+(i%5)*.055;
    dot(x,y,Math.max(.6,R*.0025),palette[i%8],3);
  }
  ctx!.globalAlpha=1;

  const centerGlow=ctx!.createRadialGradient(cx,cy,0,cx,cy,R*.18);
  centerGlow.addColorStop(0,"#102e30");centerGlow.addColorStop(.7,"#071115");centerGlow.addColorStop(1,"#03090c");
  ctx!.fillStyle=centerGlow;ctx!.beginPath();ctx!.arc(cx,cy,R*.119,0,TWO_PI);ctx!.fill();
  ring(cx,cy,R*.116,"#5ddbd0",.8,1.7);
  ring(cx,cy,R*.100,"#79c3bd",.35,.8);
  ring(cx,cy,R*.048,"#bcebe2",.7);
  const spin=t*.24;
  ctx!.beginPath();ctx!.arc(cx,cy,R*.048,spin,spin+Math.PI*1.36);
  ctx!.strokeStyle="#9ef5e4";ctx!.lineWidth=2;ctx!.shadowBlur=11;ctx!.shadowColor="#3df4dc";ctx!.stroke();ctx!.shadowBlur=0;
  ctx!.textAlign="center";ctx!.textBaseline="middle";
  ctx!.font=`${Math.max(9,R*.029)}px Consolas,monospace`;ctx!.fillStyle="#b9e7df";
  ctx!.fillText("YATSUMIRA",cx,cy+R*.163);
  ctx!.font=`${Math.max(7,R*.020)}px Consolas,monospace`;ctx!.fillStyle="#648e8f";
  ctx!.fillText("NEXUS / 08",cx,cy+R*.201);

  const dx=(pointerX-cx-panX)/zoom,dy=(pointerY-cy-panY)/zoom,pr=Math.hypot(dx,dy),theta=Math.atan2(dy,dx);
  activeSector=pr>R*.72&&pr<R*1.04?Math.round((theta+Math.PI/2)/(TWO_PI/8)+16)%8:-1;
  ctx!.restore();
  requestAnimationFrame(frame);
}
canvas.addEventListener("pointermove",(event:PointerEvent)=>{
  const rect=canvas.getBoundingClientRect();pointerX=event.clientX-rect.left;pointerY=event.clientY-rect.top;
});
canvas.addEventListener("pointerleave",()=>{pointerX=-9999;pointerY=-9999;activeSector=-1;});
requestAnimationFrame(frame);


type ChatMessage = { role: "user" | "assistant"; content: string };
const history: ChatMessage[] = [];
const cloudKey = document.querySelector<HTMLInputElement>("#cloud-key")!;
const cloudSave = document.querySelector<HTMLButtonElement>("#cloud-save")!;
const cloudLoad = document.querySelector<HTMLButtonElement>("#cloud-load")!;
const cloudRemove = document.querySelector<HTMLButtonElement>("#cloud-remove")!;
const cloudModel = document.querySelector<HTMLSelectElement>("#cloud-model")!;
const cloudStatus = document.querySelector<HTMLElement>("#cloud-status")!;
const connectionIndicator = document.querySelector<HTMLElement>("#connection-indicator")!;
const modelIndicator = document.querySelector<HTMLElement>("#chat-model-indicator")!;
const introStatus = document.querySelector<HTMLElement>("#chat-intro-status")!;
const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
let connected = false;
let selectedModel = "";
let busy = false;

async function requestApi<T>(path:string, options:RequestInit={}):Promise<T> {
  const response = await fetch("/api/cloud/"+path,{
    ...options,
    headers: {"Content-Type":"application/json",...options.headers},
    cache:"no-store",
  });
  let result: Record<string,unknown>;
  try {result = await response.json() as Record<string,unknown>;}
  catch {throw new Error("Некорректный ответ локального сервера");}
  if (!response.ok) throw new Error(typeof result.error==="string" ? result.error : "Ошибка запроса");
  return result as T;
}
function notify(message:string, error=false):void {
  cloudStatus.textContent=message;
  cloudStatus.classList.toggle("error",error);
}
function syncConnection():void {
  const ready=connected && !!selectedModel;
  connectionIndicator.textContent=ready ? "CLOUD.RU ONLINE" : connected ? "ВЫБЕРИТЕ МОДЕЛЬ" : "НЕ ПОДКЛЮЧЕНО";
  connectionIndicator.classList.toggle("connected",ready);
  modelIndicator.textContent=ready ? selectedModel : "МОДЕЛЬ НЕ ВЫБРАНА";
  if (introStatus) introStatus.textContent=ready ? "Подключено к Cloud.ru" : "Подключите Cloud.ru в настройках";
}
async function refreshModels(savedModel=""):Promise<void> {
  const response=await requestApi<{models:string[];selected:string}>("models");
  cloudModel.replaceChildren();
  const placeholder=new Option("Выберите модель","");cloudModel.add(placeholder);
  for (const id of response.models) cloudModel.add(new Option(id,id));
  const chosen=savedModel || response.selected;
  selectedModel=response.models.includes(chosen) ? chosen : "";
  cloudModel.value=selectedModel;
  syncConnection();
  notify(response.models.length ? "Доступно моделей: "+response.models.length : "Для этого ключа модели не найдены");
}
async function loadCloudConfig():Promise<void> {
  try {
    const data=await requestApi<{configured:boolean;persisted:boolean;model:string}>("config");
    connected=data.configured;
    selectedModel=data.model;
    syncConnection();
    if(connected) {
      notify(data.persisted ? "Ключ сохранён на этом компьютере" : "Ключ доступен только в текущем сеансе");
      await refreshModels(data.model);
    } else notify("Введите API-ключ Cloud.ru и нажмите «Сохранить»");
  } catch (err) {
    connected=false;selectedModel="";syncConnection();
    notify(err instanceof Error ? err.message : "Локальный API недоступен",true);
  }
}
cloudSave.addEventListener("click",async()=>{
  const key=cloudKey.value.trim();
  if(key.length<8){notify("Введите действительный API-ключ",true);return;}
  cloudSave.disabled=true;notify("Сохраняем ключ...");
  try {
    const saved=await requestApi<{configured:boolean;persisted:boolean}>("key",{method:"POST",body:JSON.stringify({key})});
    cloudKey.value="";
    connected=saved.configured;
    selectedModel="";
    history.length=0;
    syncConnection();
    notify(saved.persisted ? "Ключ защищён Windows DPAPI. Загружаем модели..." : "Ключ доступен до перезапуска сервера");
    await refreshModels();
  } catch(err){cloudKey.value="";notify(err instanceof Error?err.message:"Не удалось сохранить ключ",true);}
  finally{cloudSave.disabled=false;}
});
cloudLoad.addEventListener("click",async()=>{
  cloudLoad.disabled=true;notify("Загружаем модели Cloud.ru...");
  try{await refreshModels();}
  catch(err){notify(err instanceof Error?err.message:"Не удалось получить модели",true);}
  finally{cloudLoad.disabled=false;}
});
cloudModel.addEventListener("change",async()=>{
  const model=cloudModel.value;
  if (!model) {notify("Выберите модель из списка",true);return;}
  cloudModel.disabled=true;
  try{
    await requestApi("model",{method:"POST",body:JSON.stringify({model})});
    selectedModel=model;history.length=0;syncConnection();notify("Модель выбрана: "+model);
  }catch(err){cloudModel.value=selectedModel;notify(err instanceof Error?err.message:"Не удалось выбрать модель",true);}
  finally{cloudModel.disabled=false;}
});
cloudRemove.addEventListener("click",async()=>{
  cloudRemove.disabled=true;
  try {
    await requestApi("key",{method:"DELETE"});
    connected=false;selectedModel="";history.length=0;cloudKey.value="";
    cloudModel.replaceChildren(new Option("Сначала подключите Cloud.ru",""));
    syncConnection();notify("Локальный ключ удалён");
  }catch(err){notify(err instanceof Error?err.message:"Не удалось удалить ключ",true);}
  finally{cloudRemove.disabled=false;}
});
function addMessage(text:string,kind:"user"|"system"|"assistant"):void {
  const intro=log!.querySelector(".chat-intro");
  if (intro) intro.remove();
  const el=document.createElement("div");
  el.className="message "+kind;
  el.textContent=text;
  log!.appendChild(el);
  log!.scrollTop=log!.scrollHeight;
}
async function submitMessage():Promise<void> {
  if(busy)return;
  const text=input!.value.trim();
  if(!text)return;
  if(!connected || !selectedModel){
    addMessage("Сначала подключите Cloud.ru и выберите модель в настройках.","system");
    return;
  }
  busy=true;submitButton.disabled=true;
  addMessage(text,"user");
  input!.value="";input!.style.height="auto";
  const outgoing:ChatMessage[]=[...history,{role:"user" as const,content:text}].slice(-29);
  try{
    const result=await requestApi<{answer:string}>("chat",{method:"POST",body:JSON.stringify({messages:outgoing})});
    history.splice(0,history.length,...outgoing,{role:"assistant",content:result.answer});
    if(history.length>28)history.splice(0,history.length-28);
    addMessage(result.answer,"assistant");
  }catch(err){
    addMessage("Ошибка Cloud.ru: "+(err instanceof Error?err.message:"неизвестная ошибка"),"system");
  }finally{busy=false;submitButton.disabled=false;input!.focus();}
}
form.addEventListener("submit",(e:SubmitEvent)=>{e.preventDefault();void submitMessage();});
input.addEventListener("keydown",(e:KeyboardEvent)=>{
  if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void submitMessage();}
});
input.addEventListener("input",()=>{
  input!.style.height="auto";
  input!.style.height=Math.min(input!.scrollHeight,130)+"px";
});
void loadCloudConfig();
