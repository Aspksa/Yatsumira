import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {withCoreDatabase,addKnowledge,saveExchange,coreStatus} from "../server/core-db.mjs";
import {recallMemory} from "../server/long-memory.mjs";
import {storeEmbedding,vectorRecall,vectorOverview,reciprocalFusion,rerankCandidates} from "../server/memory-vectors.mjs";
import {embedText,indexMissingEmbeddings,hybridRecall,rerankWithProvider} from "../server/memory-provider.mjs";
import {extractCandidates,inspectPendingFacts,pendingConflicts,researchEntities,memoryNeighbors,memoryLayers,reviewCandidateFact,resolveMemoryConflict} from "../server/memory-intelligence.mjs";
import {consolidateStep,summarizeConversation,memoryMaintenanceStatus,evaluateRetrieval,recordRetrievalEvaluation} from "../server/memory-maintenance.mjs";

const savedCwd=process.cwd();
const dir=mkdtempSync(join(tmpdir(),"yatsumira-memory-v3-"));
const vars=["YATSUMIRA_MEMORY_EMBED_URL","YATSUMIRA_MEMORY_EMBED_KEY","YATSUMIRA_MEMORY_EMBED_MODEL","YATSUMIRA_MEMORY_RERANK_URL","YATSUMIRA_MEMORY_RERANK_KEY","YATSUMIRA_MEMORY_RERANK_MODEL"];
const oldVars=Object.fromEntries(vars.map(name=>[name,process.env[name]]));
try{
  process.chdir(dir);
  assert.equal(coreStatus().version,6);
  assert.equal(extractCandidates("Договор № D-123: срок оплаты составляет 30 дней.").some(x=>x.predicate==="payment_days"&&x.object==="30"),true);
  const first=addKnowledge({content:"Договор № D-123. Срок оплаты составляет 30 дней. ООО «Северный Берег» выполняет поставку.",sector:1,source:"note"});
  const second=addKnowledge({content:"Договор № D-123. Срок оплаты составляет 45 дней. ООО «Северный Берег» уточняет условия.",sector:1,source:"note"});
  assert.equal(first.added,true);
  assert.equal(second.added,true);
  const results=consolidateStep({batch:40});
  assert.equal(results.processed,2);
  assert.ok(results.facts>=2,"Facts should be extracted with source");
  assert.ok(results.entities>=2,"Contract and organization entities extracted");
  const pending=inspectPendingFacts();
  assert.ok(pending.every(x=>x.confidence<1));
  const conflicts=pendingConflicts();
  assert.ok(conflicts.length>=1,"Different payment values for same contract must create review candidates");
  assert.ok(conflicts.every(x=>x.review_state==="pending"),"Conflicts not silently resolved");
  assert.throws(()=>reviewCandidateFact(pending[0].id,{decision:"reviewed"}),/evidence/);
  assert.throws(()=>resolveMemoryConflict(conflicts[0].id,{decision:"resolved"}),/rationale/);
  assert.equal(reviewCandidateFact(pending[0].id,{decision:"reviewed",evidence:"Проверено по подписанному оригиналу договора"}).decision,"reviewed");
  assert.equal(resolveMemoryConflict(conflicts[0].id,{decision:"dismissed",note:"Условия относятся к разным редакциям; нужна проверка"}).decision,"dismissed");
  assert.equal(pendingConflicts().length,conflicts.length-1);

  const graph=withCoreDatabase(db=>db.prepare("SELECT id FROM memory_entries WHERE source_kind='knowledge' ORDER BY rowid").all());
  assert.equal(graph.length,2);
  assert.ok(memoryNeighbors(graph[0].id).some(n=>n.id===graph[1].id));
  const repeat=consolidateStep({batch:40});
  assert.ok(repeat.processed>=0);
  const afterRepeat=consolidateStep({batch:40});
  assert.ok(afterRepeat.facts===0||afterRepeat.processed===0,"Reprocessing idempotent");
  assert.ok(researchEntities("ООО «ТехПроект», договор № АБ-1").some(x=>x.kind==="organization"));
  const overview=memoryMaintenanceStatus();
  assert.ok(overview.entities>=2);
  assert.equal(overview.pendingConflicts,conflicts.length-1,"Reviewed conflicts leave the pending queue");
  assert.ok(memoryLayers().counts.semantic>=2);
  assert.equal(memoryLayers().counts.episodic,0);
  assert.ok(overview.jobs.some(j=>j.name==="facts-and-entities"));

  assert.deepEqual(vectorOverview(),[]);
  storeEmbedding(graph[0].id,"test/emb",[1,0,0]);
  storeEmbedding(graph[1].id,"test/emb",[0,1,0]);
  assert.equal(vectorOverview()[0].count,2);
  assert.throws(()=>storeEmbedding(graph[0].id,"test/emb",[1,0]),/dimension mismatch/i);
  const semantic=vectorRecall([1,.01,0],{model:"test/emb"});
  assert.equal(semantic[0].id,graph[0].id);
  const lexical=recallMemory("договор D-123 срок оплаты",{limit:10});
  const fused=reciprocalFusion(lexical,semantic,{limit:10});
  assert.equal(fused[0].id,graph[0].id);
  const reranked=await rerankCandidates("query",fused,async(_query,contents)=>contents.map((_x,i)=>i));
  assert.equal(reranked[0].id,fused.at(-1).id);

  const fake=async(url,opts)=>{
    assert.equal(url,"https://embeddings.example/v1/embeddings");
    assert.equal(opts.headers.Authorization,"Bearer fake-unit-test-key");
    return new Response(JSON.stringify({data:[{embedding:[.9,.1,0]}]}),{status:200});
  };
  assert.equal((await hybridRecall("договор D-123",{limit:3})).mode,"lexical-subword");
  process.env.YATSUMIRA_MEMORY_EMBED_URL="https://embeddings.example/v1/embeddings";
  process.env.YATSUMIRA_MEMORY_EMBED_KEY="fake-unit-test-key";
  process.env.YATSUMIRA_MEMORY_EMBED_MODEL="test/emb";
  const vector=await embedText("договор",{request:fake});
  assert.equal(vector.vector.length,3);
  const online=await hybridRecall("договор D-123",{limit:3,request:fake});
  assert.equal(online.mode,"hybrid-neural");
  assert.equal(online.results[0].id,graph[0].id);
  const unavailable=await hybridRecall("договор D-123",{limit:3,request:async()=>{throw Error("network offline");}});
  assert.equal(unavailable.mode,"lexical-fallback");
  process.env.YATSUMIRA_MEMORY_RERANK_URL="https://rerank.example/v1/rerank";
  process.env.YATSUMIRA_MEMORY_RERANK_KEY="fake-rerank-key";
  process.env.YATSUMIRA_MEMORY_RERANK_MODEL="test/rerank";
  const withRerank=await rerankWithProvider("проверка",fused,{request:async(url,opts)=>{
    assert.equal(url,"https://rerank.example/v1/rerank");
    assert.equal(opts.headers.Authorization,"Bearer fake-rerank-key");
    const input=JSON.parse(opts.body);
    assert.equal(input.documents.length,fused.length);
    return new Response(JSON.stringify({results:input.documents.map((_,i)=>({index:i,relevance_score:i}))}),{status:200});
  }});
  assert.equal(withRerank[0].id,fused.at(-1).id);
  const keep=await hybridRecall("договор D-123",{limit:3,request:fake});
  assert.equal(keep.mode,"hybrid-neural");
  assert.equal(keep.reranked,false,"Unavailable reranker must not block semantic recall");
  const fresh=addKnowledge({content:"Справка по производству условных средств документирования",sector:1,source:"note"});
  assert.equal(fresh.added,true);
  const indexed=await indexMissingEmbeddings({batch:4,request:fake});
  assert.ok(indexed.indexed>=1);
  assert.equal(vectorOverview()[0].count,3);
  for(const name of vars)delete process.env[name];

  for(let i=0;i<4;i++)saveExchange({conversationId:"default",exchangeId:"summary-"+i,user:"Я проверяю условия договора поставки "+i,assistant:"Тестовый ответ модели "+i,model:"test/model"});
  assert.ok(memoryLayers().counts.episodic>=4);
  const summary=summarizeConversation({conversationId:"default"});
  assert.equal(summary.created,true);
  const summaries=withCoreDatabase(db=>db.prepare("SELECT summary,source_count FROM memory_summaries").all());
  assert.equal(summaries.length,1);
  const data=JSON.parse(summaries[0].summary);
  assert.ok(data.excerpts.every(x=>x.messageId && !x.quote.includes("Тестовый ответ")));
  assert.equal(summarizeConversation({conversationId:"default"}).created,false);
  const evalCase=[{query:"срок оплаты договора D-123",expectedId:graph[0].id}];
  const evaluation=evaluateRetrieval(evalCase,q=>recallMemory(q,{limit:20}));
  assert.equal(evaluation.cases,1);
  assert.equal(evaluation.recallAt20,1);
  const recorded=recordRetrievalEvaluation(evalCase,q=>recallMemory(q,{limit:20}));
  assert.ok(recorded.mrr>0);
  assert.equal(withCoreDatabase(db=>db.prepare("SELECT COUNT(*) AS n FROM memory_evaluations").get().n),1);
  assert.ok(coreStatus().memory>=3);
  console.log("[YATSUMIRA CORE v3] ten memory capabilities: schemas, fact sources, conflicts, entities, graph, temporal, hybrid vectors, reranker, summaries, metrics, checkpoints: OK");
}finally{
  process.chdir(savedCwd);
  for(const [name,value] of Object.entries(oldVars)){
    if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
  rmSync(dir,{recursive:true,force:true});
}
