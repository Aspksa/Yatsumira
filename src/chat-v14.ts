/** CHAT DESIGN v14: browser-side file picker, drag/drop and safe code formatting. */
export type UploadedAttachment={id:string;name:string;indexed:boolean};
export function createAttachmentController(panel:HTMLElement,tray:HTMLElement,select:HTMLInputElement,button:HTMLButtonElement,notice:(text:string)=>void){
  let files:File[]=[];
  const maxCount=6,maxSize=4*1024*1024;
  const render=()=>{
    tray.replaceChildren();tray.hidden=!files.length;
    files.forEach((file,index)=>{
      const chip=document.createElement("span");chip.className="attachment-chip";
      const label=document.createElement("span");label.textContent=file.name+" · "+Math.ceil(file.size/1024)+" КБ";
      label.title=file.name;
      const remove=document.createElement("button");remove.type="button";remove.textContent="×";
      remove.setAttribute("aria-label","Убрать "+file.name);
      remove.addEventListener("click",()=>{files.splice(index,1);render();});
      chip.append(label,remove);tray.append(chip);
    });
  };
  const append=(items:FileList|File[])=>{
    for(const file of Array.from(items)){
      if(files.length>=maxCount){notice("Можно прикрепить не больше 6 файлов.");break;}
      if(file.size>maxSize){notice("Файл «"+file.name+"» превышает 4 МБ.");continue;}
      if(files.some(x=>x.name===file.name&&x.size===file.size&&x.lastModified===file.lastModified))continue;
      files.push(file);
    }
    render();
  };
  button.addEventListener("click",()=>select.click());
  select.addEventListener("change",()=>{if(select.files)append(select.files);select.value="";});
  let dragDepth=0;
  panel.addEventListener("dragenter",e=>{if(e.dataTransfer?.types.includes("Files")){e.preventDefault();dragDepth++;panel.classList.add("drop-target");}});
  panel.addEventListener("dragover",e=>{if(e.dataTransfer?.types.includes("Files")){e.preventDefault();e.dataTransfer.dropEffect="copy";}});
  panel.addEventListener("dragleave",()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)panel.classList.remove("drop-target");});
  panel.addEventListener("drop",e=>{e.preventDefault();dragDepth=0;panel.classList.remove("drop-target");if(e.dataTransfer?.files)append(e.dataTransfer.files);});
  const upload=async(file:File):Promise<UploadedAttachment>=>{
    const data=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>typeof reader.result==="string"?resolve(reader.result.split(",")[1]||""):reject(new Error("Ошибка чтения"));
      reader.onerror=()=>reject(new Error("Ошибка чтения"));
      reader.readAsDataURL(file);
    });
    const response=await fetch("/api/knowledge/attachment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name,data})});
    const result=await response.json() as {id?:string;name?:string;indexed?:boolean;error?:string};
    if(!response.ok||!result.id)throw new Error(result.error||"Не удалось сохранить файл");
    return {id:result.id,name:result.name||file.name,indexed:!!result.indexed};
  };
  return {
    get size(){return files.length;},
    async uploadAll(){const result:UploadedAttachment[]=[];for(const file of files)result.push(await upload(file));return result;},
    clear(){files=[];render();}
  };
}
function highlightedCode(code:HTMLElement,content:string):void{
  const regex=/(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|class|import|export|async|await|if|else|true|false|null|undefined|SELECT|FROM|WHERE|INSERT|UPDATE|CREATE)\b|\b\d+(?:\.\d+)?\b)/gm;
  let last=0,match:RegExpExecArray|null;
  while((match=regex.exec(content))!==null){
    code.append(document.createTextNode(content.slice(last,match.index)));
    const span=document.createElement("span");
    span.className=match[0].startsWith("//")||match[0].startsWith("#")?"syntax-comment":/^["']/.test(match[0])?"syntax-string":/^\d/.test(match[0])?"syntax-number":"syntax-keyword";
    span.textContent=match[0];code.append(span);last=match.index+match[0].length;
  }
  code.append(document.createTextNode(content.slice(last)));
}
export function renderSafeAssistantText(element:HTMLElement,text:string):void{
  const fenced=/\x60{3}([a-z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n?\x60{3}/gi;
  let last=0,match:RegExpExecArray|null;
  while((match=fenced.exec(text))!==null){
    if(match.index>last)element.append(document.createTextNode(text.slice(last,match.index)));
    const frame=document.createElement("div");frame.className="code-frame";
    const title=document.createElement("div");title.className="code-language";title.textContent=(match[1]||"код").toUpperCase();
    const pre=document.createElement("pre"),code=document.createElement("code");
    highlightedCode(code,match[2]);pre.append(code);frame.append(title,pre);element.append(frame);
    last=fenced.lastIndex;
  }
  if(last<text.length)element.append(document.createTextNode(text.slice(last)));
}
