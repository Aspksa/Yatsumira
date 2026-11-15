/**
 * Opt-in external embedding adapter. A provider's *documented* embeddings URL
 * and key must be explicitly configured; Cloud.ru chat API does not imply one.
 * Secrets are never persisted in SQLite or returned through HTTP.
 */
import {withCoreDatabase} from "./core-db.mjs";
import {confidential} from "./memory-store.mjs";
import {recallMemory} from "./long-memory.mjs";
import {graphRecall} from "./universal-memory-graph.mjs";
import {personalizedGraphRank} from "./memory-v5-reasoning.mjs";
import {storeEmbedding,vectorRecall,reciprocalFusion,rerankCandidates} from "./memory-vectors.mjs";
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
function rerankerSettings(){
  const url=process.env.YATSUMIRA_MEMORY_RERANK_URL||"";
  const key=process.env.YATSUMIRA_MEMORY_RERANK_KEY||"";
  const model=process.env.YATSUMIRA_MEMORY_RERANK_MODEL||"";
  if(!url||!key||!model)return null;
  const parsed=new URL(url);
  if(parsed.protocol!=="https:" && !(parsed.protocol==="http:"&&["localhost","127.0.0.1"].includes(parsed.hostname)))
    throw Error("Reranker endpoint must use HTTPS or local loopback HTTP");
  if(parsed.username||parsed.password)throw Error("Reranker URL must not contain credentials");
  return {url:parsed.href,key,model};
}
export async function rerankWithProvider(query,items,{request=fetch}={}){
  const config=rerankerSettings();
  if(!config||!items.length)return items;
  return rerankCandidates(query,items,async(q,docs)=>{
    const response=await request(config.url,{
      method:"POST",
      headers:{"Authorization":"Bearer "+config.key,"Content-Type":"application/json"},
      body:JSON.stringify({model:config.model,query:q,documents:docs}),
      signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)throw Error("Reranker provider HTTP "+response.status);
    const json=await response.json();
    const results=json?.results;
    if(!Array.isArray(results)||results.length!==docs.length)throw Error("Invalid reranker results");
    const scores=new Array(docs.length).fill(null);
    for(const row of results){
      const index=row?.index;
      const score=row?.relevance_score??row?.score;
      if(!Number.isInteger(index)||index<0||index>=docs.length||!Number.isFinite(score))throw Error("Invalid reranker score");
      scores[index]=score;
    }
    if(scores.some(x=>x===null))throw Error("Incomplete reranker response");
    return scores;
  });
}
export async function hybridRecall(query,{limit=8,request=fetch}={}){
  const lexical=recallMemory(query,{limit:Math.min(30,Math.max(limit*3,12))});
  const associations=graphRecall(query,{limit:Math.min(20,Math.max(limit*2,8)),hops:2});
  const rankedGraph=personalizedGraphRank(query,{limit:Math.min(20,Math.max(limit*2,8))});
  // Candidate links improve retrieval, but never change the verification state of source memories.
  const graphCombined=rankedGraph.length?reciprocalFusion(associations,rankedGraph,{limit:Math.max(15,limit*3)}):associations;
  const local=graphCombined.length?reciprocalFusion(lexical,graphCombined,{limit:Math.max(15,limit*3)}):lexical;
  if(!settings())return {mode:"lexical-subword",results:local.slice(0,limit),graphResults:associations.length};
  try{
    const embedding=await embedText(query,{request});
    const semantic=vectorRecall(embedding.vector,{model:embedding.model,limit:Math.min(50,limit*3)});
    // All results must obey the same secret filter as lexical recall.
    const filtered=semantic.filter(row=>!confidential.test(row.content));
    const fusion=reciprocalFusion(local,filtered,{limit:Math.max(12,limit)});
    let ranked=fusion;
    let reranked=false;
    try{
      if(rerankerSettings()){ranked=await rerankWithProvider(query,fusion,{request});reranked=true;}
    }catch{/* No reranker may block the user chat. Keep the hybrid results. */}
    return {mode:"hybrid-neural",results:ranked.slice(0,limit),model:embedding.model,reranked,graphResults:associations.length};
  }catch{
    // Provider outages cannot stop local memory or the normal chat response.
    return {mode:"lexical-fallback",results:local.slice(0,limit),graphResults:associations.length};
  }
}
