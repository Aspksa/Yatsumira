import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

const directory = resolve(process.cwd(), ".yatsumira");
const file = join(directory, "knowledge.json");
const allowedSectors = new Set([0,1,2,3,4,5,6,7]);
const maxRecords = 2500;
const maxBody = 32768;
const stopwords = new Set(["это","для","как","при","что","или","уже","все","если","будет","когда","они","меня","тебя","только","надо","теперь","также","есть","можно","нужно","чтобы","тебе","пока","после","the","and","with","from","this"]);

function respond(res,status,data){
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  res.end(JSON.stringify(data));
}
async function readBody(req){
  let size=0;const parts=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>maxBody)throw Object.assign(new Error("Слишком большой запрос"),{status:413});
    parts.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(parts).toString("utf8"));}
  catch{throw Object.assign(new Error("Неверный JSON"),{status:400});}
}
function empty(){return {version:1,revision:0,records:[],links:[]};}
function readStore(){
  try{
    const data=JSON.parse(readFileSync(file,"utf8"));
    if(data?.version===1 && Array.isArray(data.records)&&Array.isArray(data.links))return data;
  }catch(error){
    if(error?.code!=="ENOENT")throw Object.assign(new Error("Ошибка чтения базы знаний"),{status:500});
  }
  return empty();
}
function saveStore(data){
  mkdirSync(directory,{recursive:true});
  const temp=join(directory,"knowledge-"+randomUUID()+".tmp");
  try{
    writeFileSync(temp,JSON.stringify(data,null,2),{encoding:"utf8",mode:0o600,flag:"wx"});
    renameSync(temp,file);
  }catch(error){
    try{unlinkSync(temp);}catch{}
    throw error;
  }
}
function tokens(text){
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[]).filter(word=>!stopwords.has(word)).slice(0,120))];
}
function hash(text){return createHash("sha256").update(text).digest("hex");}
function publicState(data){return {revision:data.revision,records:data.records,links:data.links};}
export async function handleKnowledge(req,res,path){
  try{
    if(path==="/api/knowledge/graph"&&req.method==="GET"){
      return respond(res,200,publicState(readStore()));
    }
    if(path==="/api/knowledge/ingest"&&req.method==="POST"){
      const input=await readBody(req);
      const content=typeof input.content==="string"?input.content.trim():"";
      const title=typeof input.title==="string"?input.title.trim().slice(0,100):"";
      const sector=Number.isInteger(input.sector)&&allowedSectors.has(input.sector)?input.sector:0;
      const source=input.source==="chat"?"chat":"note";
      if(!content || content.length>4000) return respond(res,400,{error:"Текст должен содержать от 1 до 4000 символов"});
      const data=readStore();
      const digest=hash(source+"\u0000"+content);
      const known=data.records.find(row=>row.digest===digest);
      if(known)return respond(res,200,{...publicState(data),added:false,id:known.id});
      if(data.records.length>=maxRecords)return respond(res,409,{error:"Лимит записей достигнут. Требуется архивирование."});
      const record={
        id:randomUUID(), title:title||content.slice(0,75),content,sector,
        kind:"fact",importance:source==="note"?2:1,source,
        verified:false,digest,createdAt:new Date().toISOString()
      };
      const newWords=tokens(content);
      // Deterministic lexical relationships, not claims of semantic equivalence.
      const candidates=data.records.map(other=>{
        const overlap=newWords.filter(word=>tokens(other.content).includes(word)).length;
        return {other,overlap};
      }).filter(match=>match.overlap>=2).sort((a,b)=>b.overlap-a.overlap).slice(0,4);
      for(const match of candidates){
        data.links.push({source:record.id,target:match.other.id,kind:"shared-terms",strength:match.overlap});
      }
      data.records.push(record);
      data.revision++;
      saveStore(data);
      return respond(res,201,{...publicState(data),added:true,id:record.id});
    }
    return respond(res,404,{error:"Маршрут не найден"});
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:500;
    return respond(res,status,{error:error instanceof Error?error.message:"Ошибка сохранения"});
  }
}
