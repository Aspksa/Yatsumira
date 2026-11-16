/**
 * Neural-vector storage and bounded cosine search.
 * Embeddings are accepted only from an explicitly configured real provider.
 * No pseudo-vector is ever called an embedding. Provider runtime is optional.
 */
import {withCoreDatabase} from "./core-db.mjs";
import {confidential} from "./memory-store.mjs";
const validVector=x=>Array.isArray(x)&&x.length>=2&&x.length<=4096&&x.every(n=>Number.isFinite(n))&&Math.hypot(...x)>0;
function normalized(vector){
  if(!validVector(vector))throw Object.assign(new Error("Invalid embedding vector"),{status:400});
  const norm=Math.sqrt(vector.reduce((sum,x)=>sum+x*x,0));
  return vector.map(x=>x/norm);
}
const normalizedModel=x=>typeof x==="string"&&x.length>=3&&x.length<=130&&/^[\w/.-]+$/.test(x);
export function storeEmbedding(memoryId,model,vector){
  if(!normalizedModel(model))throw Object.assign(new Error("Invalid model name"),{status:400});
  const data=normalized(vector);
  return withCoreDatabase(db=>{
    const exists=db.prepare("SELECT id FROM memory_entries WHERE id=? AND state='active'").get(memoryId);
    if(!exists)throw Object.assign(new Error("Active memory not found"),{status:404});
    const matched=db.prepare("SELECT dimensions FROM memory_vectors WHERE model=? LIMIT 1").get(model);
    if(matched&&matched.dimensions!==data.length)throw Object.assign(new Error("Embedding dimension mismatch"),{status:409});
    const result=db.prepare("INSERT INTO memory_vectors(memory_id,model,dimensions,vector_json,created_at) VALUES(?,?,?,?,?) ON CONFLICT(memory_id,model) DO UPDATE SET dimensions=excluded.dimensions,vector_json=excluded.vector_json,created_at=excluded.created_at")
      .run(memoryId,model,data.length,JSON.stringify(data),new Date().toISOString());
    return {stored:result.changes===1,model,dimensions:data.length};
  });
}
export function vectorRecall(vector,{model,limit=15}={}){
  if(!normalizedModel(model))throw Object.assign(new Error("Specify the embedding model"),{status:400});
  const query=normalized(vector);
  return withCoreDatabase(db=>{
    const rows=db.prepare("SELECT m.id,m.content,m.source_kind AS sourceKind,m.source_id AS sourceId,m.verified,v.vector_json FROM memory_vectors v JOIN memory_entries m ON m.id=v.memory_id WHERE v.model=? AND v.dimensions=? AND m.state='active' ORDER BY m.rowid DESC LIMIT 5000").all(model,query.length);
    // A malformed or legacy vector must not break recall for all other rows.
    // Do not persist repairs here: search remains a read-only operation.
    const matches=[];
    for(const row of rows){
      // Apply the same confidentiality guard to direct vector recall as to
      // hybrid recall, including memories indexed before the guard existed.
      if(confidential.test(row.content))continue;
      let embedding;
      try{embedding=JSON.parse(row.vector_json);}catch{continue;}
      if(!Array.isArray(embedding)||embedding.length!==query.length||
         !embedding.every(x=>typeof x==="number"&&Number.isFinite(x)))continue;
      const score=query.reduce((sum,x,i)=>sum+x*embedding[i],0);
      if(!Number.isFinite(score))continue;
      matches.push({id:row.id,content:row.content,sourceKind:row.sourceKind,sourceId:row.sourceId,verified:!!row.verified,score:Number(score.toFixed(5)),method:"vector"});
    }
    return matches.sort((a,b)=>b.score-a.score).slice(0,Math.max(1,Math.min(50,Number(limit)||15)));
  });
}
export function vectorOverview(){
  return withCoreDatabase(db=>db.prepare("SELECT model,dimensions,COUNT(*) AS count FROM memory_vectors GROUP BY model,dimensions").all());
}
export function reciprocalFusion(lexical,semantic,{limit=12}={}){
  const rank=new Map(),byId=new Map();
  for(const [name,list,weight] of [["lexical",lexical,1],["vector",semantic,1.2]]){
    list.forEach((item,index)=>{
      const old=rank.get(item.id)||0;
      rank.set(item.id,old+weight/(60+index+1));
      byId.set(item.id,{...byId.get(item.id),...item});
    });
  }
  return [...rank].sort((a,b)=>b[1]-a[1]).slice(0,Math.max(1,Math.min(50,limit)))
    .map(([id,score])=>({...byId.get(id),fusionScore:Number(score.toFixed(6))}));
}
export async function rerankCandidates(query,items,reranker){
  // A pluggable, verified provider callback; no unconfigured network calls.
  if(typeof reranker!=="function")return items;
  const selected=items.slice(0,20);
  const scores=await reranker(String(query).slice(0,500),selected.map(item=>item.content.slice(0,1600)));
  if(!Array.isArray(scores)||scores.length!==selected.length||scores.some(x=>!Number.isFinite(x)))
    throw Object.assign(new Error("Invalid reranker output"),{status:502});
  return selected.map((item,i)=>({...item,rerankScore:scores[i]})).sort((a,b)=>b.rerankScore-a.rerankScore);
}
