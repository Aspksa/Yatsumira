/** CORE v8 safe local maintenance and benchmark experiment infrastructure.
 * No remote calls or destructive repair. SQLite checkpoints survive restart.
 */
import {randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {inspectMemoryV5} from "./memory-v5-health.mjs";
import {recallMemory} from "./long-memory.mjs";
import {graphQuality} from "./memory-v5-reasoning.mjs";
import {memoryGaps,experiencePatterns} from "./memory-v8-learning.mjs";
const stamp=()=>new Date().toISOString();
const tx=fn=>withCoreDatabase(db=>{db.exec("BEGIN IMMEDIATE");try{const out=fn(db);db.exec("COMMIT");return out;}catch(e){db.exec("ROLLBACK");throw e;}});
const types=new Set(["health","graph-audit","experience-patterns","knowledge-gaps"]);
export function scheduleMemoryJob(kind,payload={},scheduledAt=stamp()){
  if(!types.has(kind))throw Error("Unsupported memory job");
  const content=JSON.stringify(payload);
  if(content.length>500||!Number.isFinite(Date.parse(scheduledAt)))throw Error("Invalid job payload");
  return tx(db=>{
    const old=db.prepare("SELECT id,state FROM memory_v8_tasks WHERE job_type=? AND payload=?").get(kind,content);
    if(old)return {id:old.id,stored:false,state:old.state};
    const id=randomUUID();db.prepare("INSERT INTO memory_v8_tasks(id,job_type,payload,scheduled_at,created_at) VALUES(?,?,?,?,?)")
      .run(id,kind,content,new Date(scheduledAt).toISOString(),stamp());
    return {id,stored:true,state:"pending"};
  });
}
export function recoverInterruptedJobs(){
  return tx(db=>{
    const update=db.prepare("UPDATE memory_v8_tasks SET state='pending',claimed_at=NULL,last_error='Recovered interrupted job' WHERE state='running'").run();
    return {recovered:update.changes};
  });
}
export function runMemoryJob({handlers={},now=stamp(),maxAttempts=3}={}){
  const job=tx(db=>{
    const candidate=db.prepare("SELECT * FROM memory_v8_tasks WHERE state='pending' AND scheduled_at<=? AND attempts<? ORDER BY scheduled_at,id LIMIT 1").get(now,Math.max(1,Math.min(10,maxAttempts)));
    if(!candidate)return null;
    db.prepare("UPDATE memory_v8_tasks SET state='running',attempts=attempts+1,claimed_at=? WHERE id=?").run(stamp(),candidate.id);
    return candidate;
  });
  if(!job)return {worked:false};
  try{
    const payload=JSON.parse(job.payload);
    const operations={
      health:()=>inspectMemoryV5(),
      "graph-audit":()=>graphQuality(),
      "experience-patterns":()=>experiencePatterns({limit:20}),
      "knowledge-gaps":()=>memoryGaps(typeof payload.query==="string"?payload.query.slice(0,300):"unanswered questions")
    };
    const handler=handlers[job.job_type]||operations[job.job_type];
    if(!handler)throw Error("Unknown handler");
    const result=handler(payload);
    if(result&&typeof result.then==="function")throw Error("Async handlers are not supported");
    const compact=JSON.stringify(result).slice(0,2200);
    tx(db=>{
      db.prepare("UPDATE memory_v8_tasks SET state='completed',finished_at=?,last_error='' WHERE id=?").run(stamp(),job.id);
      db.prepare("INSERT INTO memory_v8_metrics(id,metric_type,payload,created_at) VALUES(?,?,?,?)")
        .run(randomUUID(),"memory-job",JSON.stringify({jobId:job.id,type:job.job_type,ok:true,result:compact}),stamp());
    });
    return {worked:true,id:job.id,state:"completed"};
  }catch(error){
    tx(db=>db.prepare("UPDATE memory_v8_tasks SET state=?,last_error=?,claimed_at=NULL WHERE id=?").run(
      (job.attempts+1)>=maxAttempts?"failed":"pending",String(error?.message||error).slice(0,200),job.id));
    return {worked:true,id:job.id,state:(job.attempts+1)>=maxAttempts?"failed":"pending",error:String(error?.message||error).slice(0,150)};
  }
}
export function memoryJobStatus(){
  return withCoreDatabase(db=>db.prepare("SELECT state,COUNT(*) AS n FROM memory_v8_tasks GROUP BY state ORDER BY state").all());
}
export function memoryQualityWatch({persist=false}={}){
  const db=inspectMemoryV5(),graph=graphQuality();
  const candidates=withCoreDatabase(sql=>({
    pendingRelations:sql.prepare("SELECT COUNT(*) AS n FROM graph_assertions WHERE review_state='candidate'").get().n,
    unresolvedConflicts:sql.prepare("SELECT COUNT(*) AS n FROM graph_conflicts WHERE review_state='pending'").get().n,
    unsupportedHypotheses:sql.prepare("SELECT COUNT(*) AS n FROM memory_hypotheses h WHERE NOT EXISTS(SELECT 1 FROM memory_hypothesis_evidence e WHERE e.hypothesis_id=h.id)").get().n
  }));
  const report={ok:db.ok&&graph.unsourced===0,integrityErrors:db.errors,sourceCoverage:graph.sourceCoverage,candidates};
  if(persist)withCoreDatabase(sql=>sql.prepare("INSERT INTO memory_v8_metrics(id,metric_type,payload,created_at) VALUES(?,?,?,?)")
    .run(randomUUID(),"quality-watch",JSON.stringify(report),stamp()));
  return report;
}
export function compareMemoryAlgorithms(cases,baseline,candidate,{name="controlled-comparison",persist=false}={}){
  if(!Array.isArray(cases)||typeof baseline!=="function"||typeof candidate!=="function")throw Error("Invalid experiment");
  if(cases.length===0||cases.length>50)throw Error("Need 1–50 evaluation cases");
  const evaluate=fn=>{
    const sample=cases.map(c=>{
      if(typeof c.query!=="string"||!c.expectedId)throw Error("Evaluation requires labeled source");
      const rows=fn(c.query).slice(0,20);
      const pos=rows.findIndex(x=>x.id===c.expectedId);
      return {found:pos>=0,rr:pos>=0?1/(pos+1):0};
    });
    return {cases:sample.length,recallAt20:sample.filter(s=>s.found).length/sample.length,
      mrr:sample.reduce((a,b)=>a+b.rr,0)/sample.length};
  };
  const b=evaluate(baseline),c=evaluate(candidate);
  // Guard recall and reciprocal rank: never accept a model that regresses either.
  const accepted=c.recallAt20>=b.recallAt20&&c.mrr>=b.mrr;
  const result={baseline:b,candidate:c,accepted,reason:accepted?"no-regression-on-labeled-cases":"regression-detected"};
  if(persist)withCoreDatabase(db=>db.prepare("INSERT INTO memory_v8_experiments(id,name,baseline_json,candidate_json,accepted,created_at) VALUES(?,?,?,?,?,?)").run(
    randomUUID(),String(name).slice(0,100),JSON.stringify(b),JSON.stringify(c),accepted?1:0,stamp()));
  return result;
}
export function offlineMemoryStatus(){
  const quality=memoryQualityWatch();
  return {localAvailable:quality.ok,searchMode:"SQLite FTS5 and graph remain local",
    remoteModelNeededForAnswerGeneration:true,maintenanceRequiresRunningServer:true};
}
