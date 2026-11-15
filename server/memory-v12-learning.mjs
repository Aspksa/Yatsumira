/** CORE v12: bounded evidence-based learning and error memory.
 * Every proposal is a candidate; recording is not model training or proof.
 */
import {randomUUID,createHash} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {confidential,memoryTokens} from "./memory-store.mjs";
import {taskExperience,summarizeExperience} from "./memory-v11-learning.mjs";
import {memoryGaps} from "./memory-v8-learning.mjs";
const now=()=>new Date().toISOString();
const valid=(text,max=900)=>{const value=String(text??"").trim();if(!value||value.length>max||confidential.test(value))throw Error("Invalid or sensitive input");return value;};
const tx=fn=>withCoreDatabase(db=>{db.exec("BEGIN IMMEDIATE");try{const result=fn(db);db.exec("COMMIT");return result;}catch(error){db.exec("ROLLBACK");throw error;}});
const kinds=new Set(["success","failure","reflection","analogy","counterfactual","strategy","hypothesis","correction"]);
const digest=s=>createHash("sha256").update(s).digest("hex");
export function proposeLesson({kind,description,memoryIds,score=.3}){
  if(!kinds.has(kind))throw Error("Unknown lesson kind");
  const ids=[...new Set(memoryIds||[])].sort();
  if(ids.length<1||ids.length>20)throw Error("Requires 1-20 source memories");
  const content=valid(description),weight=Number(score);
  if(!Number.isFinite(weight)||weight<0||weight>1)throw Error("Invalid score");
  return tx(db=>{
    const get=db.prepare("SELECT id FROM memory_entries WHERE id=? AND state='active'");
    if(ids.some(id=>!get.get(id)))throw Error("Active sources required");
    const fingerprint=digest(JSON.stringify({kind,content,ids}));
    const existing=db.prepare("SELECT id,state FROM memory_v12_lessons WHERE fingerprint=?").get(fingerprint);
    if(existing)return {id:existing.id,state:existing.state,stored:false};
    const id=randomUUID();db.prepare("INSERT INTO memory_v12_lessons(id,kind,fingerprint,description,score,created_at) VALUES(?,?,?,?,?,?)")
      .run(id,kind,fingerprint,content,Math.min(.8,weight),now());
    for(const memoryId of ids)db.prepare("INSERT INTO memory_v12_lesson_sources(lesson_id,memory_id) VALUES(?,?)").run(id,memoryId);
    return {id,state:"candidate",stored:true,verified:false};
  });
}
export function reviewLesson(id,{approved,evidence}={}){
  if(typeof approved!=="boolean")throw Error("Decision required");
  const explanation=valid(evidence,500);
  return tx(db=>{
    const row=db.prepare("SELECT id,state FROM memory_v12_lessons WHERE id=?").get(id);
    if(!row||row.state!=="candidate")throw Error("Pending lesson not found");
    const state=approved?"reviewed":"rejected";
    db.prepare("UPDATE memory_v12_lessons SET state=? WHERE id=?").run(state,id);
    db.prepare("INSERT INTO core_events(id,event_type,payload,created_at) VALUES(?,?,?,?)")
      .run(randomUUID(),"v12.lesson_review",JSON.stringify({id,state,evidence:explanation}),now());
    return {id,state};
  });
}
export function lessons({kind,reviewedOnly=true,limit=30}={}){
  if(kind&&!kinds.has(kind))throw Error("Unknown kind");
  return withCoreDatabase(db=>db.prepare("SELECT l.id,l.kind,l.description,l.score,l.state,COUNT(s.memory_id) AS sourceCount FROM memory_v12_lessons l JOIN memory_v12_lesson_sources s ON s.lesson_id=l.id JOIN memory_entries m ON m.id=s.memory_id WHERE m.state='active' AND (? IS NULL OR l.kind=?) AND (?=0 OR l.state='reviewed') AND l.state<>'rejected' GROUP BY l.id ORDER BY l.created_at DESC LIMIT ?")
    .all(kind||null,kind||null,reviewedOnly?1:0,Math.max(1,Math.min(100,limit))));
}
export function learnFromOutcomes({limit=8}={}){
  const candidates=[...summarizeExperience({kind:"success",limit}),...summarizeExperience({kind:"failure",limit})];
  let created=0,existing=0;
  for(const row of candidates.slice(0,Math.max(1,Math.min(30,limit)))){
    const memoryIds=[...new Set(row.sourceMemoryIds)];
    if(memoryIds.length<2)continue;
    const description=(row.kind==="success"?"Observed repeated completed tasks: ":"Observed repeated cancellations: ")+row.topic+
      " (successes="+row.successes+", failures="+row.failures+")";
    const stored=proposeLesson({kind:row.kind,memoryIds,description,score:.25});
    if(stored.stored)created++;else existing++;
  }
  return {created,existing,verified:false,noAutomaticModelTraining:true};
}
export function feedbackMemory({query,memoryId,kind,evidence}){
  if(!["useful","incorrect","irrelevant","correction"].includes(kind))throw Error("Invalid feedback kind");
  return tx(db=>{
    if(!db.prepare("SELECT id FROM memory_entries WHERE id=? AND state='active'").get(memoryId))throw Error("Active memory required");
    const id=randomUUID();
    db.prepare("INSERT INTO memory_v12_feedback(id,query,memory_id,kind,evidence,created_at) VALUES(?,?,?,?,?,?)")
      .run(id,valid(query,500),memoryId,kind,valid(evidence,800),now());
    return {id,kind,recorded:true,notAnAutomaticFactEdit:true};
  });
}
export function feedbackPriority(memoryId){
  return withCoreDatabase(db=>{
    const rows=db.prepare("SELECT kind,COUNT(*) AS n FROM memory_v12_feedback WHERE memory_id=? GROUP BY kind").all(memoryId);
    const scores=Object.fromEntries(rows.map(x=>[x.kind,x.n]));
    const boost=.035*Math.min(5,scores.useful||0)-.09*Math.min(5,scores.incorrect||0)-.04*Math.min(5,scores.irrelevant||0);
    return {memoryId,boost:Math.max(-.5,Math.min(.175,boost)),votes:scores,notReliabilityProbability:true};
  });
}
export function researchGaps({query,limit=5}={}){
  const value=valid(query,500),gaps=memoryGaps(value);
  return {query:value,missingTerms:gaps.missingTerms.slice(0,limit),questions:gaps.questions.slice(0,limit),
    reviewState:"candidate",searchedExistingSourcesOnly:true};
}
export function learningReport({persist=false}={}){
  const result=withCoreDatabase(db=>({
    activeSources:db.prepare("SELECT COUNT(*) AS n FROM memory_entries WHERE state='active'").get().n,
    pendingLessons:db.prepare("SELECT COUNT(*) AS n FROM memory_v12_lessons WHERE state='candidate'").get().n,
    reviewedLessons:db.prepare("SELECT COUNT(*) AS n FROM memory_v12_lessons WHERE state='reviewed'").get().n,
    feedback:db.prepare("SELECT COUNT(*) AS n FROM memory_v12_feedback").get().n,
    reviewedPatterns:db.prepare("SELECT COUNT(*) AS n FROM memory_v11_patterns WHERE review_state='reviewed'").get().n,
    datedRuns:db.prepare("SELECT COUNT(*) AS n FROM memory_v12_learning_runs").get().n
  }));
  if(persist)withCoreDatabase(db=>db.prepare("INSERT INTO memory_v12_learning_runs(id,job,report_json,source_count,created_at) VALUES(?,?,?,?,?)")
    .run(randomUUID(),"report",JSON.stringify(result),result.activeSources,now()));
  return {...result,learningMeans:"source-recorded-heuristics-not-model-weight-updates"};
}
