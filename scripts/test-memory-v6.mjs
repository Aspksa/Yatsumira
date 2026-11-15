import assert from "node:assert/strict";
import {contraryEvidenceCandidates,traceAnswerClaims,evaluateAnswerContext} from "../server/memory-v6-evidence.mjs";
import {structuralGraphFeatures,suggestMissingGraphLinks,graphOfCommunities,causalGraph} from "../server/memory-v6-graph-features.mjs";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {addKnowledge,withCoreDatabase,coreStatus} from "../server/core-db.mjs";
import {indexUniversalGraph,assertGraphRelation} from "../server/universal-memory-graph.mjs";
import {
  planMemoryQuery,expandMemoryQueries,analyzeMemoryQuestion,proposeHypothesis,
  examineHypothesis,openKnowledgeQuestions,detectGraphAnomalies,proposeOntologyType,
  memoryReflection,retrievalTrustScore,ageAwarePriority,recordMemorySnapshot
} from "../server/memory-v6-intelligence.mjs";
const base=process.cwd(),root=mkdtempSync(join(tmpdir(),"yatsumira-memory-v6-"));
try{
  process.chdir(root);
  assert.equal(coreStatus().version,8);
  const x=addKnowledge({content:"«Проект Заря» использует «Модуль Лира». Система тестируется.",sector:0,source:"note"});
  const y=addKnowledge({content:"«Модуль Лира» находится в «Лаборатория Феникс». Проверка прошла.",sector:1,source:"note"});
  const z=addKnowledge({content:"«Машина Омега» использует «Проект Заря». Прототип работает.",sector:2,source:"note"});
  const sourceId=id=>withCoreDatabase(db=>db.prepare("SELECT id FROM memory_entries WHERE source_kind='knowledge' AND source_id=?").get(id).id);
  const sx=sourceId(x.id),sy=sourceId(y.id),sz=sourceId(z.id);
  assert.equal(indexUniversalGraph({batch:20}).claims,3);
  const plan=planMemoryQuery("Как связан проект и модуль?");
  assert.ok(plan.depth>=1);
  assert.ok(plan.graph);
  assert.ok(expandMemoryQueries("память и граф").length>=2);
  assert.equal(planMemoryQuery("история проекта").temporal,true);
  const search=analyzeMemoryQuestion("Проект Заря",{limit:8});
  assert.ok(search.results.some(r=>r.id===sx));
  assert.ok(search.results.every(r=>r.sourceId));
  assert.equal(search.confidenceClass==="unknown",false);
  const questions=openKnowledgeQuestions("что известно о неизвестном устройстве");
  assert.ok(questions.questions.length>0);
  const hypothesis=proposeHypothesis({
    kind:"causal",claim:"Работа системы зависит от модуля",
    memoryIds:[sx],opposingIds:[sy]
  });
  assert.equal(hypothesis.verified,false);
  const examination=examineHypothesis(hypothesis.id);
  assert.equal(examination.verdict,"contested");
  assert.equal(examination.supportCount,1);
  assert.equal(examination.oppositionCount,1);
  assert.throws(()=>proposeHypothesis({claim:"x",memoryIds:[sx],opposingIds:[sx]}),/both stances/);
  assert.throws(()=>proposeHypothesis({claim:"x",memoryIds:["missing"]}),/Evidence memory/);
  const analogy=proposeHypothesis({kind:"analogy",claim:"Система напоминает предыдущую архитектуру",memoryIds:[sx]});
  assert.equal(examineHypothesis(analogy.id).verdict,"unverified");
  const counter=proposeHypothesis({kind:"counterfactual",claim:"Если убрать модуль, проект мог бы измениться"});
  assert.equal(examineHypothesis(counter.id).verdict,"no-evidence");
  const anomalies=detectGraphAnomalies();
  assert.ok(Array.isArray(anomalies.selfLoops));
  assert.equal(anomalies.status,"diagnostics-not-proof-of-error");
  assert.equal(proposeOntologyType("device").stored,true);
  assert.equal(proposeOntologyType("sensor",{parentType:"device"}).stored,true);
  assert.throws(()=>proposeOntologyType("component",{parentType:"unknown"}),/Parent type/);
  const representation=memoryReflection(sx,{mode:"distillation"});
  assert.equal(representation.extractive,true);
  assert.equal(representation.verified,false);
  const stored=withCoreDatabase(db=>db.prepare("SELECT content FROM memory_representations WHERE memory_id=?").get(sx));
  assert.equal(JSON.parse(stored.content).sourceId,sx);
  assert.ok(retrievalTrustScore([{id:sx,confidence:.8,verified:false}])[0].trustScore<.85);
  assert.ok(ageAwarePriority({createdAt:"2020-01-01"})<ageAwarePriority({createdAt:new Date().toISOString()}));
  assertGraphRelation({memoryId:sx,subject:"Датчик К",predicate:"uses",object:"Модуль Лира",validFrom:"2025-01-01"});
  const features=structuralGraphFeatures({rounds:2});
  assert.ok(features.length>=4);
  assert.equal(features.every(x=>x.vector.length===4&&x.vector.every(Number.isFinite)),true);
  assert.ok(Array.isArray(suggestMissingGraphLinks()));
  assert.ok(graphOfCommunities().communities.length>0);
  assert.deepEqual(causalGraph({reviewedOnly:true}),[]);
  const recalls=analyzeMemoryQuestion("Проект Заря",{limit:5}).results;
  assert.ok(Array.isArray(contraryEvidenceCandidates("Проект Заря")));
  const traced=traceAnswerClaims("Проект Заря использует Модуль Лира.",recalls);
  assert.equal(traced.claims.length,1);
  assert.equal(traced.claims[0].requiresValidation,true);
  const answerQuality=evaluateAnswerContext("Проект Заря","Проект Заря использует Модуль Лира.",recalls);
  assert.equal(typeof answerQuality.needMoreEvidence,"boolean");
  assert.ok(answerQuality.decision.includes("Never assert"));
  const snapshot=recordMemorySnapshot("test-baseline");
  assert.match(snapshot.checksum,/^[a-f0-9]{64}$/);
  assert.equal(snapshot.memories,3);
  assert.equal(withCoreDatabase(db=>db.prepare("PRAGMA integrity_check").get().integrity_check),"ok");
  console.log("[YATSUMIRA CORE v6] query planning, multiquery, graph retrieval, evidence, hypotheses, temporal graph, ontology, representations, trust, snapshots: OK");
}finally{process.chdir(base);rmSync(root,{recursive:true,force:true});}
