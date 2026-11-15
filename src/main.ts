import "./style.css";
import { NexusView, type NexusNode } from "./nexus";
import { isNexusMode } from "./nexus-modes";

const canvas = document.querySelector<HTMLCanvasElement>("#app");
const log = document.querySelector<HTMLDivElement>("#messages");
const form = document.querySelector<HTMLFormElement>("#chat-form");
const input = document.querySelector<HTMLTextAreaElement>("#chat-input");
const card = document.querySelector<HTMLElement>("#nexus-card");
const cardTitle = document.querySelector<HTMLElement>("#nexus-card-title");
const cardType = document.querySelector<HTMLElement>("#nexus-card-type");
const cardDetails = document.querySelector<HTMLElement>("#nexus-card-details");
const cardMeta = document.querySelector<HTMLElement>("#nexus-card-meta");
const cardRelated = document.querySelector<HTMLElement>("#nexus-card-related");
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-nexus-mode]")];
const cardClose = document.querySelector<HTMLButtonElement>("#nexus-card-close");
const nexusMetrics = document.querySelector<HTMLElement>("#nexus-metrics");
const nodeBadge = document.querySelector<HTMLElement>("#nexus-node-badge");
const knowledgeText = document.querySelector<HTMLTextAreaElement>("#knowledge-text");
const knowledgeSector = document.querySelector<HTMLSelectElement>("#knowledge-sector");
const knowledgeButton = document.querySelector<HTMLButtonElement>("#knowledge-add");
const knowledgeStatus = document.querySelector<HTMLElement>("#knowledge-status");
if (!canvas || !log || !form || !input || !card || !cardTitle || !cardType || !cardDetails || !cardClose || !nexusMetrics || !cardMeta || !cardRelated || modeButtons.length!==4 || !nodeBadge || !knowledgeText || !knowledgeSector || !knowledgeButton || !knowledgeStatus) {
  throw new Error("Yatsumira interface elements missing");
}
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
function selectNode(node:NexusNode):void {
  cardTitle!.textContent=node.title;
  cardType!.textContent=node.kind==="document"?"ДОКУМЕНТ":node.kind==="agent"?"АГЕНТ":"ФАКТ";
  nodeBadge!.textContent=node.actual?(node.verified?"ПОДТВЕРЖДЕНО":"НЕ ПРОВЕРЕНО"):"ДЕМО";
  cardDetails!.textContent=node.actual
    ? node.content || "Нет описания"
    : "Демонстрационный элемент оформления. Файл или запись не загружены.";
  cardMeta!.replaceChildren();
  function detail(name:string,value:string):void {
    const dt=document.createElement("dt");dt.textContent=name;
    const dd=document.createElement("dd");dd.textContent=value;
    cardMeta!.append(dt,dd);
  }
  detail("Категория",["Память","Знания","Агенты","Анализ","Проекты","Связи","Архив","Система"][node.sector] || "Неизвестно");
  detail("Группа",node.group || (node.actual?"Записи":"Демонстрационная группа"));
  detail("Источник",node.actual?(node.source==="chat"?"Диалог Cloud.ru":"Локальная заметка"):"Демо");
  detail("Статус",node.actual?(node.verified?"Подтверждено":"Не проверено"):"Только оформление");
  if(node.actual&&node.createdAt){
    const time=new Date(node.createdAt);
    detail("Создано",Number.isFinite(time.getTime())?time.toLocaleString("ru-RU"):node.createdAt);
  }
  if(node.actual)detail("ID",node.id);
  cardRelated!.replaceChildren();
  const connected=node.actual?nexus.connectedTo(node):[];
  if(connected.length){
    const caption=document.createElement("strong");caption.textContent="Связанные записи · "+connected.length;
    cardRelated!.appendChild(caption);
    for(const item of connected.slice(0,12)){
      const button=document.createElement("button");
      button.type="button";button.textContent=item.node.title;
      button.title="Открыть связанную запись";
      button.addEventListener("click",()=>nexus.selectById(item.node.id));
      cardRelated!.appendChild(button);
    }
  }else if(node.actual){
    const caption=document.createElement("small");caption.textContent="Связей пока нет";
    cardRelated!.appendChild(caption);
  }
  card!.hidden=false;
}
const nexus = new NexusView(canvas, selectNode);
const savedMode=(() => {try{return localStorage.getItem("yatsumira-nexus-mode") || "rings";}catch{return "rings";}})();
function activateMode(value:string):void {
  if(!isNexusMode(value))return;
  nexus.setMode(value);
  for(const button of modeButtons)button.setAttribute("aria-pressed",String(button.dataset.nexusMode===value));
  try{localStorage.setItem("yatsumira-nexus-mode",value);}catch{}
  card!.hidden=true;
}
for(const button of modeButtons){
  button.addEventListener("click",()=>activateMode(button.dataset.nexusMode || ""));
}
activateMode(savedMode);

cardClose.addEventListener("click",()=>{card.hidden=true;canvas.focus();});
document.addEventListener("keydown",event=>{if(event.key==="Escape" && !card.hidden)card.hidden=true;});
let metricsUpdate = 0;
function updateMetrics(time:number):void {
  if(time-metricsUpdate>=650) {
    nexusMetrics!.textContent="УЗЛОВ: "+nexus.stats.total+" · В КАДРЕ: "+nexus.stats.drawn+
      " · ЗНАНИЙ: "+nexus.stats.knowledge+" · СВЯЗЕЙ: "+nexus.stats.links+
      " · FPS: "+nexus.stats.fps+" · "+nexus.stats.detail.toUpperCase();
    metricsUpdate=time;
  }
  requestAnimationFrame(updateMetrics);
}
requestAnimationFrame(updateMetrics);

type Preferences = { speed?: number; width?: number };
let preferences: Preferences = {};
try {
  const raw: unknown = JSON.parse(localStorage.getItem("yatsumira-ui") || "{}");
  if (raw && typeof raw === "object") preferences = raw as Preferences;
} catch { /* Optional local storage */ }
function clamp(n:number,low:number,high:number):number{return Math.max(low,Math.min(high,n));}
if(typeof preferences.speed==="number"&&Number.isFinite(preferences.speed))speedInput.value=String(clamp(preferences.speed,0,200));
if(typeof preferences.width==="number"&&Number.isFinite(preferences.width))widthInput.value=String(clamp(preferences.width,25,55));
function syncSettings():void {
  nexus.speed=Number(speedInput!.value)/100;
  speedValue!.value=speedInput!.value+"%";
  const fraction=Number(widthInput!.value);
  widthValue!.value=fraction+"%";
  document.documentElement.style.setProperty("--chat-share",String(fraction/100));
  try{localStorage.setItem("yatsumira-ui",JSON.stringify({speed:Number(speedInput!.value),width:fraction}));}catch{}
}
syncSettings();
speedInput.addEventListener("input",syncSettings);
widthInput.addEventListener("input",syncSettings);
resetViewButton.addEventListener("click",()=>nexus.resetView());
resetSettingsButton.addEventListener("click",()=>{
  speedInput.value="100";widthInput.value="35";syncSettings();nexus.resetView();
});
function closeSettings():void{settingsPanel!.hidden=true;settingsButton!.setAttribute("aria-expanded","false");}
settingsButton.addEventListener("click",()=>{
  const opened=settingsPanel!.hidden;
  settingsPanel!.hidden=!opened;
  settingsButton!.setAttribute("aria-expanded",String(opened));
});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&!settingsPanel!.hidden){closeSettings();settingsButton!.focus();}
});
document.addEventListener("pointerdown",event=>{
  if(!settingsPanel!.hidden&&event.target instanceof Node&&!settingsPanel!.contains(event.target)&&!settingsButton!.contains(event.target))closeSettings();
});


type KnowledgeRecord = import("./nexus").KnowledgeRecord;
type KnowledgeLink = import("./nexus").KnowledgeLink;
type GraphResponse = { revision:number;records:KnowledgeRecord[];links:KnowledgeLink[];added?:boolean };
async function graphRequest(path:string,init:RequestInit={}):Promise<GraphResponse> {
  const response=await fetch("/api/knowledge/"+path,{
    ...init,headers:{"Content-Type":"application/json",...init.headers},cache:"no-store"
  });
  const data=await response.json() as GraphResponse & {error?:string};
  if(!response.ok)throw new Error(data.error || "Ошибка локального графа");
  return data;
}
function applyGraph(data:GraphResponse):void {
  nexus.setKnowledge(data.records,data.links);
  knowledgeStatus!.textContent="Сохранено записей: "+data.records.length+" · связей: "+data.links.length;
}
async function refreshGraph():Promise<void> {
  try{applyGraph(await graphRequest("graph"));}
  catch(error){knowledgeStatus!.textContent="Ошибка загрузки знаний: "+(error instanceof Error?error.message:"неизвестная ошибка");}
}
knowledgeButton!.addEventListener("click",async()=>{
  const content=knowledgeText!.value.trim();
  if(!content)return;
  knowledgeButton!.disabled=true;
  try{
    const data=await graphRequest("ingest",{method:"POST",body:JSON.stringify({content,sector:Number(knowledgeSector!.value),source:"note"})});
    applyGraph(data);knowledgeText!.value="";
    knowledgeStatus!.textContent=data.added?"Новая информация сохранена · всего "+data.records.length:"Такая запись уже существует";
  }catch(error){
    knowledgeStatus!.textContent="Ошибка: "+(error instanceof Error?error.message:"неизвестная ошибка");
  }finally{knowledgeButton!.disabled=false;}
});
void refreshGraph();

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
    // Store an unverified dialog note rather than treating the message as confirmed truth.
    try {
      const graph=await graphRequest("ingest",{method:"POST",body:JSON.stringify({content:text,sector:0,source:"chat"})});
      applyGraph(graph);
    }catch(error){
      knowledgeStatus!.textContent="Не удалось сохранить сообщение в NEXUS: "+(error instanceof Error?error.message:"ошибка");
    }
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
