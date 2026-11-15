import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {addKnowledge,coreStatus,withCoreDatabase} from "../server/core-db.mjs";
import {hybridRecall} from "../server/memory-provider.mjs";
import {
  extractGenericEntities,extractGenericRelations,indexUniversalGraph,assertGraphRelation,
  graphPath,graphCommunities,graphRecall,graphClaims,graphOverview,recordMemoryFeedback,recordMemoryEvent,memoryTimeline,extractDatedEvents
} from "../server/universal-memory-graph.mjs";
const previous=process.cwd(),root=mkdtempSync(join(tmpdir(),"yatsumira-universal-v4-"));
try{
  process.chdir(root);
  assert.equal(coreStatus().version,6);
  const a=addKnowledge({content:"«Система Альта» использует «База Лира». Проект хранит данные.",source:"note",sector:0});
  const b=addKnowledge({content:"«База Лира» находится в «Комплекс Орион». Это инфраструктура.",source:"note",sector:1});
  const c=addKnowledge({content:"«Мастерская» зависит от «Система Альта». Работа продолжается.",source:"note",sector:2});
  const lookupMemory=knowledgeId=>withCoreDatabase(db=>db.prepare("SELECT id FROM memory_entries WHERE source_kind='knowledge' AND source_id=?").get(knowledgeId).id);
  const ma=lookupMemory(a.id),mb=lookupMemory(b.id),mc=lookupMemory(c.id);
  assert.equal(extractDatedEvents("2026-04-21: Выпущена новая версия платформы.").length,1);
  assert.equal(extractDatedEvents("Когда-то была новая версия").length,0);
  assert.ok(extractGenericEntities("«Платформа Заря» связана с «Мастерская»").length>=2);
  assert.equal(extractGenericRelations("«Платформа Заря» связана с «Мастерская»")[0].predicate,"related_to");
  assert.equal(extractGenericRelations("Обычные слова без доказательства отношений.").length,0);
  let results=indexUniversalGraph({batch:20});
  assert.equal(results.processed,3);
  assert.equal(results.claims,3);
  assert.ok(graphOverview().nodes>=4);
  const path=graphPath("Система Альта","Комплекс Орион");
  assert.equal(path.found,true);
  assert.equal(path.hops,2);
  assert.equal(path.path.length,2);
  assert.ok(path.path.every(edge=>edge.memoryId&&edge.reviewState==="candidate"));
  const groups=graphCommunities();
  assert.ok(groups.some(g=>g.size>=4));
  const related=graphRecall("Система Альта",{hops:3});
  assert.ok(related.some(x=>x.id===ma));
  assert.ok(related.some(x=>x.id===mb),"Multi-hop recall must reach an indirectly connected source");
  const fused=await hybridRecall("Система Альта",{limit:10});
  assert.equal(fused.mode,"lexical-subword");
  assert.ok(fused.graphResults>0);
  assert.ok(fused.results.some(x=>x.id===ma));
  // Checkpointed reprocessing and stable edge counts.
  const count=graphOverview().assertions;
  indexUniversalGraph({batch:20});
  indexUniversalGraph({batch:20});
  assert.equal(graphOverview().assertions,count);
  assert.ok(withCoreDatabase(db=>db.prepare("SELECT name FROM memory_jobs WHERE name='universal-graph'").get()));

  // Generic, explicit and sourced single-valued property conflict.
  const x=assertGraphRelation({memoryId:ma,subject:"Аппарат К-5",subjectType:"device",
    predicate:"color",object:"красный",objectType:"value",exclusive:true,validFrom:"2024-01-01"});
  const y=assertGraphRelation({memoryId:mb,subject:"Аппарат К-5",subjectType:"device",
    predicate:"color",object:"синий",objectType:"value",exclusive:true,validFrom:"2025-01-01"});
  assert.equal(x.stored,true);assert.equal(y.conflicts,1);
  assert.equal(assertGraphRelation({memoryId:mb,subject:"Аппарат К-5",subjectType:"device",
    predicate:"color",object:"синий",objectType:"value",exclusive:true,validFrom:"2025-01-01"}).stored,false);
  const earlier=graphClaims({asOf:"2024-06-01"});
  assert.ok(earlier.some(item=>item.subject==="Аппарат К-5"&&item.object==="красный"));
  assert.ok(!earlier.some(item=>item.subject==="Аппарат К-5"&&item.object==="синий"));
  assert.ok(graphOverview().pendingConflicts>=1);
  // No cross-domain false contradiction for a multi-valued predicate.
  assertGraphRelation({memoryId:mc,subject:"Аппарат К-5",predicate:"uses",
    object:"Bluetooth",validFrom:"2024-01-01"});
  assertGraphRelation({memoryId:ma,subject:"Аппарат К-5",predicate:"uses",
    object:"Wi-Fi",validFrom:"2024-01-01"});
  assert.equal(graphOverview().pendingConflicts,1);
  const feedback=recordMemoryFeedback(ma,"useful");
  assert.ok(feedback.stored);
  assert.equal(graphOverview().feedback,1);
  const evt=recordMemoryEvent({memoryId:ma,eventType:"release",title:"Обновление платформы",occurredAt:"2026-04-21"});
  assert.equal(evt.stored,true);
  assert.equal(recordMemoryEvent({memoryId:ma,eventType:"release",title:"Обновление платформы",occurredAt:"2026-04-21"}).stored,false);
  assert.ok(memoryTimeline({asOf:"2026-04-22"}).some(x=>x.title==="Обновление платформы"));
  assert.equal(memoryTimeline({asOf:"2025-04-22"}).some(x=>x.title==="Обновление платформы"),false);
  assert.ok(graphOverview().events>=1);
  assert.throws(()=>recordMemoryFeedback(a.id,"truth"),/Invalid feedback/);
  assert.throws(()=>assertGraphRelation({memoryId:"missing",subject:"X",predicate:"likes",object:"Y"}),/source memory/i);
  const journal=withCoreDatabase(db=>db.prepare("PRAGMA integrity_check").get().integrity_check);
  assert.equal(journal,"ok");
  console.log("[YATSUMIRA UNIVERSAL CORE v4] arbitrary entities, relations, temporal assertions, multi-hop recall, communities, conflicts, checkpoints, feedback and search: OK");
}finally{
  process.chdir(previous);
  rmSync(root,{recursive:true,force:true});
}
