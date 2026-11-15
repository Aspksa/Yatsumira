/**
 * Opt-in external embedding adapter. A provider's *documented* embeddings URL
 * and key must be explicitly configured; Cloud.ru chat API does not imply one.
 * Secrets are never persisted in SQLite or returned through HTTP.
 */
import {withCoreDatabase} from "./core-db.mjs";
import {confidential} from "./memory-store.mjs";
import {recallMemory} from "./long-memory.mjs";
import {storeEmbedding,vectorRecall,reciprocalFusion} from "./memory-vectors.mjs";
function settings(){
  const url=process.env.YATSUMIRA_MEMORY_EMBED_URL||"";
  const key=process.env.YATSUMIRA_MEMORY_EMBED_KEY||"";
  const model=process.env.YATSUMIRA_MEMORY_EMBED_MODEL||"";
  if(!url||!key||!model)return null;
  const parsed=new URL(url);
  if(parsed.protocol!=="https:" && !(parsed.protocol==="http:" && ["127.0.0.1","localhost"].includes(parsed.hostname)))
    throw Error("Embedding endpoint must use HTTPS or local loopback HTTP");
  if(parsed.username||parsed.password)throw Error("Embedding URL must not contain credentials");
  return {url:parsed.href,key,model};
}
export function embeddingConfigured(){return !!settings();}
export async function embedText(text,{request=fetch}={}){
  const config=settings();
  if(!config)throw Object.assign(new Error("Embedding provider not configured"),{status:503});
  const content=String(text??"").slice(0,4000);
  if(!content||confidential.test(content))throw Object.assign(new Error("Embedding input invalid or sensitive"),{status:400});
  const response=await request(config.url,{
    method:"POST",
    headers:{"Authorization":"Bearer "+config.key,"Content-Type":"application/json"},
    body:JSON.stringify({model:config.model,input:content}),
    signal:AbortSignal.timeout(20000)
  });
  if(!response.ok)throw Object.assign(new Error("Embedding provider HTTP "+response.status),{status:502});
  const json=await response.json();
  const vector=json?.data?.[0]?.embedding;
  if(!Array.isArray(vector)||vector.length<2||vector.length>4096||vector.some(x=>!Number.isFinite(x)))
    throw Object.assign(new Error("Invalid embedding response"),{status:502});
  return {model:config.model,vector};
}
export async function indexMissingEmbeddings({batch=12,request=fetch}={}){
  const config=settings();
  if(!config)return {enabled:false,indexed:0};
  const rows=withCoreDatabase(db=>db.prepare("SELECT m.id,m.content FROM memory_entries m LEFT JOIN memory_vectors v ON v.memory_id=m.id AND v.model=? WHERE m.state='active' AND v.memory_id IS NULL ORDER BY m.rowid LIMIT ?").all(config.model,Math.max(1,Math.min(20,batch))));
  let indexed=0,skipped=0;
  for(const row of rows){
    if(confidential.test(row.content)){skipped++;continue;}
    const result=await embedText(row.content,{request});
    storeEmbedding(row.id,result.model,result.vector);
    indexed++;
  }
  return {enabled:true,indexed,skipped,remainingUnknown:true,model:config.model};
}
export async function hybridRecall(query,{limit=8,request=fetch}={}){
  const lexical=recallMemory(query,{limit:Math.min(30,Math.max(limit*3,12))});
  if(!settings())return {mode:"lexical-subword",results:lexical.slice(0,limit)};
  try{
    const embedding=await embedText(query,{request});
    const semantic=vectorRecall(embedding.vector,{model:embedding.model,limit:Math.min(50,limit*3)});
    // All results must obey the same secret filter as lexical recall.
    const filtered=semantic.filter(row=>!confidential.test(row.content));
    return {mode:"hybrid-neural",results:reciprocalFusion(lexical,filtered,{limit}),model:embedding.model};
  }catch{
    // Provider outages cannot stop local memory or the normal chat response.
    return {mode:"lexical-fallback",results:lexical.slice(0,limit)};
  }
}
