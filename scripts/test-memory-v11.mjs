import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {addKnowledge,coreStatus,withCoreDatabase} from "../server/core-db.mjs";
import {createMemoryTask,updateMemoryTask,recordDecision} from "../server/memory-v5-records.mjs";
import {
  storeMemoryContext,memoryRecord,memoryRevision,memoryHierarchy,memoryFamily,
  associateMemories,relatedMemories,goalMemory,goalProgress,goals,
  preferenceMemory,reviewPreference,preferences,memoryAcrossSources
} from "../server/memory-v11-longterm.mjs";
import {
  taskExperience,summarizeExperience,recordExperiencePattern,verifyExperiencePattern,
  experiencePatternsV11,consolidateDialoguesAcrossSources,semanticMemoryConsolidation,
  verifyUnderstanding,memoryLearningStatus
} from "../server/memory-v11-learning.mjs";
const cwd=process.cwd(),root=mkdtempSync(join(tmpdir(),"yatsumira-v11-"));
try{
  process.chdir(root);
  assert.equal(coreStatus().version,11);
  const a=addKnowledge({content:"«Проект Заря» использует «Модуль Омега». Работы продолжаются.",source:"note",sector:0});
  const b=addKnowledge({content:"«Модуль Омега» находится в «Лаборатория Север». Система готова.",source:"note",sector:1});
  const c=addKnowledge({content:"«Инженер Лира» проверяет «Проект Заря». Работы завершены.",source:"note",sector:2});
  const mid=id=>withCoreDatabase(db=>db.prepare("SELECT id FROM memory_entries WHERE source_kind='knowledge' AND source_id=?").get(id).id);
  const ma=mid(a.id),mb=mid(b.id),mc=mid(c.id);
  const ctx=storeMemoryContext(ma,{topic:"Проект Заря",why:"Проверка связей",who:"Инженер Лира",relatedIds:[mb],when:"2026-03-05"});
  assert.equal(ctx.stored,true);
  assert.equal(storeMemoryContext(ma,{topic:"Вторая попытка"}).stored,false);
  assert.equal(memoryRecord(ma).context.relatedIds[0],mb);
  assert.equal(memoryRecord(ma).sourceId,a.id);
  assert.equal(memoryRevision(ma,{content:"Уточнение по проекту Заря",sourceMemoryId:mb,reason:"Получена новая запись"}).revision,1);
  assert.equal(memoryRevision(ma,{content:"Ещё одно уточнение",sourceMemoryId:mc,reason:"Проверка"}).revision,2);
  assert.equal(memoryRecord(ma).revisions.length,2);
  assert.match(memoryRecord(ma).content,/использует/);
  assert.equal(memoryHierarchy({childId:mb,parentId:ma}).stored,true);
  assert.equal(memoryHierarchy({childId:mb,parentId:ma}).stored,false);
  assert.throws(()=>memoryHierarchy({childId:ma,parentId:mb}),/cycle/);
  assert.equal(memoryFamily(ma).children[0].memoryId,mb);
  assert.equal(associateMemories({fromId:ma,toId:mb,relation:"causal_candidate"}).verified,false);
  assert.equal(relatedMemories(ma).length,1);
  const goal=goalMemory({memoryId:ma,title:"Завершить проект",horizon:"long"});
  assert.equal(goal.status,"active");
  assert.equal(goalProgress(goal.id,{status:"achieved",memoryId:mc}).status,"achieved");
  assert.equal(goals()[0].status,"achieved");
  assert.throws(()=>goalProgress(goal.id,{status:"active"}),/Closed goal/);
  const p=preferenceMemory({memoryId:ma,key:"Тёмная тема",value:"Да",context:"Настройки проекта"});
  assert.equal(p.state,"candidate");
  assert.equal(preferences().length,0);
  assert.equal(reviewPreference(p.id,{approved:true,evidence:"Пользователь указал предпочтение"}).state,"reviewed");
  assert.equal(preferences().length,1);
  assert.equal(preferenceMemory({memoryId:ma,key:"Тёмная тема",value:"Да"}).stored,false);
  assert.ok(memoryAcrossSources("Проект Заря").results.some(x=>x.id===ma));
  const t1=createMemoryTask({memoryId:ma,title:"Проверка проекта",checkpoint:"Первый этап"});
  const t2=createMemoryTask({memoryId:mb,title:"Проверка проекта",checkpoint:"Второй этап"});
  const t3=createMemoryTask({memoryId:mc,title:"Проверка проекта",checkpoint:"Третий этап"});
  updateMemoryTask(t1.id,{status:"done",outcome:"Испытания прошли"});
  updateMemoryTask(t2.id,{status:"done",outcome:"Проверено повторно"});
  updateMemoryTask(t3.id,{status:"cancelled",outcome:"Не выполнено"});
  assert.equal(taskExperience().length,3);
  const successes=summarizeExperience({kind:"success"});
  assert.ok(successes.some(x=>x.successes===2));
  const pattern=recordExperiencePattern({kind:"success",memoryIds:[ma,mb],description:"Повторная проверка прошла"});
  assert.equal(pattern.verified,false);
  assert.equal(recordExperiencePattern({kind:"success",memoryIds:[mb,ma],description:"Другая формулировка"}).stored,false);
  assert.equal(experiencePatternsV11({reviewedOnly:true}).length,0);
  assert.equal(verifyExperiencePattern(pattern.id,{approved:true,evidence:"Два завершённых независимых испытания"}).state,"reviewed");
  assert.equal(experiencePatternsV11({reviewedOnly:true}).length,1);
  const episode=consolidateDialoguesAcrossSources([ma,mb]);
  assert.equal(episode.originalsPreserved,true);
  const semantic=semanticMemoryConsolidation([mb,mc]);
  assert.equal(semantic.sourceCount,2);
  const validation=verifyUnderstanding("что известно о другом неизвестном проекте");
  assert.equal(validation.validated,false);
  assert.equal(memoryLearningStatus().contexts,1);
  assert.equal(memoryLearningStatus().patterns[0].n,1);
  assert.deepEqual(withCoreDatabase(db=>db.prepare("PRAGMA foreign_key_check").all()),[]);
  assert.equal(withCoreDatabase(db=>db.prepare("PRAGMA integrity_check").get().integrity_check),"ok");
  console.log("[YATSUMIRA CORE v11] context, revisions, hierarchy, goals, preferences, source fusion, patterns, reflection: OK");
}finally{process.chdir(cwd);rmSync(root,{recursive:true,force:true});}
