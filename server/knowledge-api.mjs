/** Backward-compatible local knowledge HTTP API, now backed by SQLite. */
import {getKnowledgeGraph,addKnowledge} from "./core-db.mjs";
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
export async function handleKnowledge(req,res,path){
  try{
    if(path==="/api/knowledge/graph"&&req.method==="GET")return respond(res,200,getKnowledgeGraph());
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
