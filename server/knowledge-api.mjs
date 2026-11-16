/** Backward-compatible local knowledge HTTP API, now backed by SQLite. */
import {getKnowledgeGraph,addKnowledge} from "./core-db.mjs";
import {mkdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {randomUUID} from "node:crypto";

function respond(res,status,data){
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  res.end(JSON.stringify(data));
}
async function readBody(req){
  let size=0;const chunks=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>32768)throw Object.assign(new Error("Слишком большой запрос"),{status:413});
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}
  catch{throw Object.assign(new Error("Неверный JSON"),{status:400});}
}
async function readAttachment(req){
  let size=0;const chunks=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>5_700_000)throw Object.assign(new Error("Вложение слишком большое"),{status:413});
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}
  catch{throw Object.assign(new Error("Некорректный JSON"),{status:400});}
}
export async function handleKnowledge(req,res,path){
  try{
    if(path==="/api/knowledge/graph"&&req.method==="GET")return respond(res,200,getKnowledgeGraph());
    if(path==="/api/knowledge/attachment"&&req.method==="POST"){
      // Maximum 4 MiB raw data. Reject path traversal and unknown encodings.
      const input=await readAttachment(req);
      const name=String(input.name||"").trim();
      const raw=String(input.data||"");
      if(!name||name.length>180||name.includes("/")||name.includes("\\")||
         name==="."||name===".."||/[\x00-\x1f]/.test(name))
        throw Object.assign(new Error("Некорректное имя файла"),{status:400});
      if(!/^[A-Za-z0-9+/]*={0,2}$/.test(raw)||raw.length>5_600_000||
         raw.length%4!==0||!raw)
        throw Object.assign(new Error("Некорректный формат вложения"),{status:400});
      const buffer=Buffer.from(raw,"base64");
      if(buffer.length>4*1024*1024)
        throw Object.assign(new Error("Файл больше 4 МБ"),{status:413});
      const id=randomUUID();
      const ext=/\.[a-z0-9]{1,8}$/i.exec(name)?.[0].toLowerCase()||".bin";
      const root=resolve(process.cwd(),".yatsumira","attachments");
      mkdirSync(root,{recursive:true});
      writeFileSync(join(root,id+ext),buffer,{flag:"wx",mode:0o600});
      return respond(res,201,{id,name,size:buffer.length,storedLocally:true,
        indexed:false,notSentToCloud:true});
    }
    if(path==="/api/knowledge/ingest"&&req.method==="POST"){
      const data=addKnowledge(await readBody(req));
      return respond(res,data.added?201:200,data);
    }
    return respond(res,404,{error:"Маршрут не найден"});
  }catch(error){
    return respond(res,Number.isInteger(error?.status)?error.status:500,{
      error:error instanceof Error?error.message:"Ошибка базы знаний"
    });
  }
}
