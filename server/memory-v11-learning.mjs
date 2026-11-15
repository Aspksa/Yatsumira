/** CORE v11: source-grounded extraction of experience and generalizations.
 * Candidate patterns never become true automatically.
 */
import {randomUUID,createHash} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {memoryTokens,confidential} from "./memory-store.mjs";
import {consolidateSources} from "./memory-v7-experience.mjs";
import {memoryGaps} from "./memory-v8-learning.mjs";
const stamp=()=>new Date().toISOString();
const fingerprint=(kind,ids)=>createHash("sha256").update(kind+"|"+[...ids].sort().join("|")).digest("hex");
const tx=fn=>withCoreDatabase(db=>{db.exec("BEGIN IMMEDIATE");try{const result=fn(db);db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}});
export function taskExperience({limit=100}={}){
  return withCoreDatabase(db=>db.prepare("SELECT t.id,t.memory_id AS memoryId,t.title,t.status,t.outcome,t.checkpoint,t.updated_at AS updatedAt,m.source_kind AS sourceKind,m.source_id AS sourceId FROM memory_tasks t JOIN memory_entries m ON m.id=t.memory_id WHERE m.state='active' AND t.status IN ('done','cancelled') ORDER BY t.updated_at DESC LIMIT ?").all(Math.max(1,Math.min(300,limit))));
}
export function summarizeExperience({kind="success",limit=30}={}){
  if(!["success","failure","generalization","reflection"].includes(kind))throw Error("Invalid pattern type");
  const records=taskExperience({limit:Math.min(100,Math.max(3,limit*3))});
  const selected=records.filter(x=>kind==="failure"?x.status==="cancelled":
    kind==="success"?x.status==="done":true).filter(x=>!confidential.test(x.title+" "+x.outcome));
  const groups=new Map();
  for(const row of selected){
    const key=memoryTokens(row.title).slice(0,3).sort().join(" ");
    if(!key)continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  return [...groups].filter(([,rows])=>rows.length>=2).slice(0,limit).map(([topic,rows])=>({
    topic,kind,sourceMemoryIds:[...new Set(rows.map(r=>r.memoryId))],
    taskIds:rows.map(r=>r.id),successes:rows.filter(r=>r.status==="done").length,
    failures:rows.filter(r=>r.status==="cancelled").length,
    excerpts:rows.slice(0,4).map(r=>({taskId:r.id,title:r.title,outcome:r.outcome.slice(0,180)})),
    status:"unverified-extractive-candidate"
  }));
}
export function recordExperiencePattern({kind="generalization",memoryIds=[],description}={}){
  if(!["success","failure","generalization","reflection"].includes(kind))throw Error("Invalid pattern kind");
  const ids=[...new Set(memoryIds)].sort();
  if(ids.length<2||ids.length>20)throw Error("Require 2–20 source memories");
  const explanation=String(description??"").trim();
  if(!explanation||explanation.length>1200||confidential.test(explanation))throw Error("Invalid explanation");
  return tx(db=>{
    const get=db.prepare("SELECT id,content,source_kind AS sourceKind,source_id AS sourceId FROM memory_entries WHERE id=? AND state='active'");
    const records=ids.map(id=>get.get(id));
    if(records.some(x=>!x||confidential.test(x.content)))throw Error("Invalid source");
    const key=fingerprint(kind,ids);
    const previous=db.prepare("SELECT id FROM memory_v11_patterns WHERE fingerprint=?").get(key);
    if(previous)return {id:previous.id,stored:false};
    const id=randomUUID(),data=JSON.stringify({description:explanation,method:"source-grounded-candidate",
      evidence:records.map(r=>({memoryId:r.id,sourceKind:r.sourceKind,sourceId:r.sourceId,quote:r.content.slice(0,200)}))});
    db.prepare("INSERT INTO memory_v11_patterns(id,kind,fingerprint,content,created_at) VALUES(?,?,?,?,?)").run(id,kind,key,data,stamp());
    for(const memoryId of ids)db.prepare("INSERT INTO memory_v11_pattern_sources(pattern_id,memory_id) VALUES(?,?)").run(id,memoryId);
    return {id,kind,stored:true,verified:false};
  });
}
export function verifyExperiencePattern(id,{approved,evidence}={}){
  if(typeof approved!=="boolean")throw Error("Review decision required");
  const why=String(evidence??"").trim();
  if(!why||why.length>500||confidential.test(why))throw Error("Review evidence required");
  return tx(db=>{
    const p=db.prepare("SELECT review_state FROM memory_v11_patterns WHERE id=?").get(id);
    if(!p||p.review_state!=="candidate")throw Error("Pattern not pending");
    const state=approved?"reviewed":"rejected";
    db.prepare("UPDATE memory_v11_patterns SET review_state=? WHERE id=?").run(state,id);
    db.prepare("INSERT INTO core_events(id,event_type,payload,created_at) VALUES(?,?,?,?)").run(randomUUID(),"v11.pattern_review",JSON.stringify({id,state,evidence:why}),stamp());
    return {id,state};
  });
}
export function experiencePatternsV11({kind,reviewedOnly=false,limit=50}={}){
  if(kind&&!["success","failure","generalization","reflection"].includes(kind))throw Error("Invalid kind");
  return withCoreDatabase(db=>db.prepare("SELECT p.id,p.kind,p.content,p.review_state AS reviewState,COUNT(s.memory_id) AS sourceCount FROM memory_v11_patterns p JOIN memory_v11_pattern_sources s ON s.pattern_id=p.id JOIN memory_entries m ON m.id=s.memory_id WHERE m.state='active' AND (? IS NULL OR p.kind=?) AND (?=0 OR p.review_state='reviewed') AND p.review_state<>'rejected' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?")
    .all(kind||null,kind||null,reviewedOnly?1:0,Math.min(100,Math.max(1,limit))).map(x=>({...x,content:JSON.parse(x.content)})));
}
export function consolidateDialoguesAcrossSources(memoryIds){
  return consolidateSources(memoryIds,{kind:"episode"});
}
export function semanticMemoryConsolidation(memoryIds){
  return consolidateSources(memoryIds,{kind:"semantic"});
}
export function verifyUnderstanding(query,{limit=20}={}){
  const gap=memoryGaps(query);
  return {query,sourceCount:gap.sourceCount,missingTerms:gap.missingTerms,
    candidates:gap.questions.slice(0,4),validated:false,
    note:"Term coverage and source presence are not proof of actual understanding"};
}
export function memoryLearningStatus(){
  return withCoreDatabase(db=>({
    goals:db.prepare("SELECT COUNT(*) AS n FROM memory_v11_goals").get().n,
    preferences:db.prepare("SELECT COUNT(*) AS n FROM memory_v11_preferences").get().n,
    contexts:db.prepare("SELECT COUNT(*) AS n FROM memory_v11_context").get().n,
    revisions:db.prepare("SELECT COUNT(*) AS n FROM memory_v11_history").get().n,
    patterns:db.prepare("SELECT kind,review_state AS status,COUNT(*) AS n FROM memory_v11_patterns GROUP BY kind,review_state").all(),
    recordedEpisodes:db.prepare("SELECT COUNT(*) AS n FROM memory_consolidations WHERE kind='episode'").get().n
  }));
}
