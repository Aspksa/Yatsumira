import assert from "node:assert/strict";
import {extractionConfigured,requestStructuredExtraction,extractMemoryUsingProvider} from "../server/memory-v5-provider.mjs";
import {inspectMemoryV5,assertMemoryHealthy,maybeRecordMemoryHealth} from "../server/memory-v5-health.mjs";
import {recordAnswerAudit} from "../server/memory-v5-quality.mjs";

import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {addKnowledge,withCoreDatabase,coreStatus} from "../server/core-db.mjs";
import {indexUniversalGraph,graphOverview} from "../server/universal-memory-graph.mjs";
import {recallMemory} from "../server/long-memory.mjs";
import {
  detectIntent,detectReferences,multilingualKeywords,registerAlias,resolveAliases,reviewAlias,
  recordDecision,decisions,createMemoryTask,updateMemoryTask,openMemoryTasks,addHyperedge,
  hyperedgesFor,needsReindex,markIndexed
} from "../server/memory-v5-records.mjs";
import {
  personalizedGraphRank,topicCommunities,recallWithStrategy,auditAnswerEvidence,
  checkRetrievalCompleteness,hypotheticalCausalLinks,graphQuality
} from "../server/memory-v5-reasoning.mjs";
import {validateExtractedKnowledge,extractKnowledgeWithModel,extractInterpretation} from "../server/memory-v5-extraction.mjs";
const original=process.cwd(),root=mkdtempSync(join(tmpdir(),"yatsumira-core-v5-"));
try{
  process.chdir(root);
  assert.equal(coreStatus().version,13);
  const alpha=addKnowledge({content:"«Платформа Аврора» использует «Движок Север». Это программный проект.",sector:0,source:"note"});
  const beta=addKnowledge({content:"«Движок Север» находится в «Лаборатория Титан». Разработка продукта.",sector:1,source:"note"});
  const gamma=addKnowledge({content:"«Робот Омега» использует «Платформа Аврора». Техника работает.",sector:2,source:"note"});
  const mid=sourceId=>withCoreDatabase(db=>db.prepare("SELECT id FROM memory_entries WHERE source_kind='knowledge' AND source_id=?").get(sourceId)?.id);
  const ma=mid(alpha.id),mb=mid(beta.id),mc=mid(gamma.id);
  assert.ok(ma&&mb&&mc);
  assert.equal(indexUniversalGraph({batch:50}).claims,3);
  assert.ok(graphOverview().nodes>=4);
  const nodes=withCoreDatabase(db=>db.prepare("SELECT id,label FROM graph_nodes ORDER BY label").all());
  const platform=nodes.find(n=>n.label==="Платформа Аврора");
  const engine=nodes.find(n=>n.label==="Движок Север");
  const laboratory=nodes.find(n=>n.label==="Лаборатория Титан");
  assert.ok(platform&&engine&&laboratory);

  // 1-8: generic extraction, intent, contextual references, identity and multilingual terms.
  assert.equal(detectIntent("Найди мои проекты").intent,"search");
  assert.equal(detectIntent("Возможно это другая версия").intent,"uncertain");
  assert.equal(detectReferences("Она использует его.").length,2);
  assert.ok(multilingualKeywords("AI project memory graph").includes("память"));
  const suggestion=extractInterpretation("Она работает с ним?",{recentMessages:[{role:"user",content:"«Платформа Аврора» использует «Движок Север»."}]});
  assert.equal(suggestion.references.needsResolution,true);
  assert.ok(suggestion.references.candidates.length>=1);
  assert.equal(suggestion.references.automaticReplacement,false);
  const alias=registerAlias({nodeId:platform.id,alias:"Aurora platform",memoryId:ma});
  assert.equal(alias.stored,true);
  assert.equal(resolveAliases("Aurora platform").length,0,"Unreviewed aliases cannot be trusted");
  assert.throws(()=>reviewAlias(alias.id,{approved:true}),/evidence/);
  assert.equal(reviewAlias(alias.id,{approved:true,evidence:"Подтверждено автором проекта"}).state,"reviewed");
  assert.equal(resolveAliases("Aurora platform").length,1);

  // 9-16: PageRank, relation weights, complex relations, topics, causal candidates, sources.
  const pagerank=personalizedGraphRank("Платформа Аврора",{limit:10});
  assert.ok(pagerank.some(x=>x.id===ma));
  assert.ok(pagerank.every(x=>x.score>=0&&x.score<=1));
  assert.ok(topicCommunities().some(x=>x.size>=4));
  const hyper=addHyperedge({memoryId:ma,relationType:"collaboration",participants:[
    {nodeId:platform.id,role:"software"},{nodeId:engine.id,role:"runtime"},{nodeId:laboratory.id,role:"organization"}]});
  assert.equal(hyper.members,3);
  assert.equal(hyperedgesFor(platform.id).length,1);
  const strategy=recallWithStrategy("Платформа Аврора",{limit:10});
  assert.ok(strategy.some(x=>x.id===ma));
  assert.ok(strategy.some(x=>x.evidence.length>=1));
  const quality=graphQuality();
  assert.equal(quality.unsourced,0);
  assert.equal(quality.sourceCoverage,1);
  assert.ok(hypotheticalCausalLinks("Проект остановился потому что выключили питание.").length===1);
  assert.equal(hypotheticalCausalLinks("Проект остановился.").length,0);

  // 18, 22-24: decisions, source-preserving experience and resumption checkpoints.
  const decision=recordDecision({memoryId:ma,subject:"Выбор платформы",choice:"Аврора",rationale:"Совместимость с существующим движком"});
  assert.ok(decisions().some(x=>x.id===decision.id));
  const task=createMemoryTask({memoryId:mc,title:"Проверить двигатель робота",checkpoint:"Шаг 1 — измерить питание"});
  assert.ok(openMemoryTasks().some(x=>x.id===task.id));
  updateMemoryTask(task.id,{checkpoint:"Шаг 2 — проверена проводка"});
  assert.ok(openMemoryTasks().some(x=>x.checkpoint.includes("Шаг 2")));
  updateMemoryTask(task.id,{status:"done",outcome:"Исправлен контакт"});
  assert.equal(openMemoryTasks().some(x=>x.id===task.id),false);
  assert.throws(()=>updateMemoryTask(task.id,{status:"open"}),/already closed/);

  // 25-27,29: unsupported claims remain flagged, no unverifiable truth assertions.
  const evidence=recallMemory("Платформа Аврора",{limit:5});
  const audit=auditAnswerEvidence("Платформа Аврора использует Движок Север",evidence);
  assert.equal(audit.supported,false,"Lexical overlap cannot prove truth");
  assert.ok(audit.coverage>0);
  assert.equal(auditAnswerEvidence("Любое утверждение",[]).reason,"no-evidence");
  assert.equal(checkRetrievalCompleteness("неизвестная сверхзадача",[]).shouldRetry,true);

  // 34: incremental indexing can detect content changes while keeping source identity.
  assert.equal(needsReindex("file:notes/alpha.md","Содержимое").changed,true);
  assert.equal(markIndexed("file:notes/alpha.md","Содержимое",{count:1}).changed,true);
  assert.equal(needsReindex("file:notes/alpha.md","Содержимое").changed,false);
  assert.equal(markIndexed("file:notes/alpha.md","Содержимое").changed,false);
  assert.equal(needsReindex("file:notes/alpha.md","Изменено").changed,true);

  // Safe opt-in structured extraction, no network calls or silent verified knowledge.
  const parsed=validateExtractedKnowledge({entities:[{type:"product",name:"Робот Омега",confidence:1}],
    relations:[{subject:"Робот Омега",predicate:"uses",object:"Платформа Аврора",confidence:1}]});
  assert.equal(parsed.verified,false);
  assert.ok(parsed.relations[0].confidence<=.75);
  assert.equal((await extractKnowledgeWithModel({memoryId:mc,extractor:async()=>parsed})).stored,0);
  assert.throws(()=>validateExtractedKnowledge(null),/Invalid extraction/);
  assert.equal(extractionConfigured(),false);
  const oldVars={
    url:process.env.YATSUMIRA_MEMORY_EXTRACT_URL,
    key:process.env.YATSUMIRA_MEMORY_EXTRACT_KEY,
    model:process.env.YATSUMIRA_MEMORY_EXTRACT_MODEL
  };
  try{
    process.env.YATSUMIRA_MEMORY_EXTRACT_URL="https://extract.example/v1/chat/completions";
    process.env.YATSUMIRA_MEMORY_EXTRACT_KEY="test-only-key";
    process.env.YATSUMIRA_MEMORY_EXTRACT_MODEL="test-chat";
    const fake=async(_url,options)=>{
      assert.equal(options.headers.Authorization,"Bearer test-only-key");
      const request=JSON.parse(options.body);
      assert.equal(request.messages.at(-1).role,"user");
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
        entities:[{name:"Робот Омега",type:"device"}],
        relations:[{subject:"Робот Омега",predicate:"uses",object:"Платформа Аврора"}]
      })}}]}),{status:200});
    };
    const payload=await requestStructuredExtraction({text:"Робот Омега использует Аврору"},{request:fake});
    assert.equal(payload.relations.length,1);
    const extracted=await extractMemoryUsingProvider(mc,{request:fake,dryRun:true});
    assert.equal(extracted.stored,0);
    assert.ok(extracted.proposals.relations.length>0);
    assert.equal(extracted.proposals.verified,false);
  }finally{
    for(const [env,value] of [["YATSUMIRA_MEMORY_EXTRACT_URL",oldVars.url],["YATSUMIRA_MEMORY_EXTRACT_KEY",oldVars.key],["YATSUMIRA_MEMORY_EXTRACT_MODEL",oldVars.model]]){
      if(value===undefined)delete process.env[env];else process.env[env]=value;
    }
  }
  const report=recordAnswerAudit("Что известно о платформе?","Платформа Аврора использует Движок Север",evidence);
  assert.equal(report.supportedByIndependentVerification,false);
  assert.ok(report.retrieved>0);
  assert.ok(withCoreDatabase(db=>db.prepare("SELECT COUNT(*) AS n FROM memory_quality_runs WHERE kind='answer-evidence'").get().n)>=1);
  const health=inspectMemoryV5();
  assert.equal(health.ok,true,JSON.stringify(health.errors));
  assert.ok(health.structures.hyperedges>=1);
  assert.equal(assertMemoryHealthy().ok,true);
  assert.equal(maybeRecordMemoryHealth().performed,true);
  assert.equal(maybeRecordMemoryHealth().performed,false);
  assert.equal(withCoreDatabase(db=>db.prepare("SELECT COUNT(*) AS n FROM memory_quality_runs WHERE kind=\'sqlite-health\'").get().n),1);

  assert.equal(withCoreDatabase(db=>db.prepare("PRAGMA integrity_check").get().integrity_check),"ok");
  console.log("[YATSUMIRA CORE v5] universal aliases, decisions, task checkpoints, hyperedges, PageRank, evidence audit, extraction, incremental index: OK");
}finally{
  process.chdir(original);rmSync(root,{recursive:true,force:true});
}
