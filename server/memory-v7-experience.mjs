import {randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {confidential,memoryTokens} from "./memory-store.mjs";
const now=()=>new Date().toISOString();
const safe=(x,n=1000)=>{const s=String(x??"").trim();if(!s||s.length>n||confidential.test(s))throw Error("Invalid or sensitive text");return s;};
const tx=fn=>withCoreDatabase(db=>{db.exec("BEGIN IMMEDIATE");try{const result=fn(db);db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}});
const source=(db,id)=>{if(!db.prepare("SELECT id FROM memory_entries WHERE id=? AND state='active'").get(id))throw Error("Active source required");};
export function reasoningStep({sessionId,stepKey,kind,content,evidenceIds=[]}){
  if(!["question","hypothesis","evidence","inference","conclusion"].includes(kind))throw Error("Invalid reasoning kind");
  return tx(db=>{
    const session=safe(sessionId,120),key=safe(stepKey,120),text=safe(content,1400);
    const old=db.prepare("SELECT id FROM memory_reasoning_steps WHERE session_id=? AND step_key=?").get(session,key);
    if(old)return {id:old.id,stored:false};
    for(const id of evidenceIds)source(db,id);
    const id=randomUUID();
    db.prepare("INSERT INTO memory_reasoning_steps(id,session_id,step_key,kind,content,created_at) VALUES(?,?,?,?,?,?)").run(id,session,key,kind,text,now());
    for(const memoryId of new Set(evidenceIds))db.prepare("INSERT INTO memory_reasoning_evidence(step_id,memory_id,stance) VALUES(?,?,'supports')").run(id,memoryId);
    return {id,stored:true,verified:false};
  });
}
export function reasoningLink(fromId,toId,relation="derived_from"){
  if(!["supports","challenges","derived_from"].includes(relation)||fromId===toId)throw Error("Invalid reasoning link");
  return tx(db=>{
    const get=db.prepare("SELECT session_id FROM memory_reasoning_steps WHERE id=?");
    const a=get.get(fromId),b=get.get(toId);
    if(!a||!b||a.session_id!==b.session_id)throw Error("Reasoning session mismatch");
    const cycle=db.prepare("WITH RECURSIVE walk(id) AS (SELECT to_step FROM memory_reasoning_edges WHERE from_step=? UNION SELECT e.to_step FROM memory_reasoning_edges e JOIN walk w ON e.from_step=w.id) SELECT 1 AS found FROM walk WHERE id=? LIMIT 1").get(toId,fromId);
    if(cycle)throw Error("Reasoning cycle");
    const r=db.prepare("INSERT OR IGNORE INTO memory_reasoning_edges(from_step,to_step,relation) VALUES(?,?,?)").run(fromId,toId,relation);
    return {stored:!!r.changes};
  });
}
export function reasoningTrace(sessionId){
  return withCoreDatabase(db=>({
    steps:db.prepare("SELECT id,step_key AS stepKey,kind,content,review_state AS reviewState FROM memory_reasoning_steps WHERE session_id=? ORDER BY created_at,id").all(sessionId),
    edges:db.prepare("SELECT e.from_step AS source,e.to_step AS target,e.relation FROM memory_reasoning_edges e JOIN memory_reasoning_steps s ON s.id=e.from_step WHERE s.session_id=?").all(sessionId),
    evidence:db.prepare("SELECT e.step_id AS stepId,e.memory_id AS memoryId,e.stance FROM memory_reasoning_evidence e JOIN memory_reasoning_steps s ON s.id=e.step_id WHERE s.session_id=?").all(sessionId),
    verified:false
  }));
}
export function alignmentCandidates({limit=20}={}){
  return withCoreDatabase(db=>{
    const nodes=db.prepare("SELECT id,label,node_type AS type FROM graph_nodes LIMIT 600").all(),found=[];
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j];
      if(a.type!==b.type||a.type==="unknown")continue;
      const words=new Set(memoryTokens(a.label)),other=new Set(memoryTokens(b.label));
      const overlap=[...words].filter(x=>other.has(x)).length/Math.max(1,Math.max(words.size,other.size));
      if(overlap>=.5)found.push({leftId:a.id,rightId:b.id,score:overlap,verified:false});
    }
    return found.sort((a,b)=>b.score-a.score).slice(0,limit);
  });
}
export function proposeAlignment({leftId,rightId,memoryId,confidence=.5}){
  return tx(db=>{
    source(db,memoryId);
    const [left,right]=[leftId,rightId].sort();
    if(left===right)throw Error("Same graph node");
    const get=db.prepare("SELECT id FROM graph_nodes WHERE id=?");
    if(!get.get(left)||!get.get(right))throw Error("Graph node absent");
    const old=db.prepare("SELECT id FROM memory_entity_alignments WHERE left_node=? AND right_node=? AND source_memory_id=?").get(left,right,memoryId);
    if(old)return {id:old.id,stored:false};
    const id=randomUUID();
    db.prepare("INSERT INTO memory_entity_alignments(id,left_node,right_node,source_memory_id,confidence,created_at) VALUES(?,?,?,?,?,?)").run(id,left,right,memoryId,Math.max(0,Math.min(.8,confidence)),now());
    return {id,stored:true,status:"candidate"};
  });
}
export function reviewAlignment(id,{approved,evidence}){
  safe(evidence,500);
  if(typeof approved!=="boolean")throw Error("Review decision required");
  return tx(db=>{
    const state=approved?"reviewed":"rejected";
    const r=db.prepare("UPDATE memory_entity_alignments SET status=? WHERE id=? AND status='candidate'").run(state,id);
    if(!r.changes)throw Error("No pending alignment");
    db.prepare("INSERT INTO core_events(id,event_type,payload,created_at) VALUES(?,?,?,?)").run(randomUUID(),"memory.alignment_review",JSON.stringify({id,state,evidence}),now());
    return {id,status:state};
  });
}
export function procedureFromTask(taskId){
  return tx(db=>{
    const task=db.prepare("SELECT * FROM memory_tasks WHERE id=?").get(taskId);
    if(!task||task.status!=="done"||!task.outcome.trim())throw Error("Completed task required");
    source(db,task.memory_id);
    const old=db.prepare("SELECT id FROM memory_procedures WHERE source_task_id=?").get(taskId);
    if(old)return {id:old.id,stored:false};
    const id=randomUUID(),steps=[task.title,task.checkpoint,task.outcome].filter(Boolean);
    db.prepare("INSERT INTO memory_procedures(id,source_task_id,memory_id,description,steps_json,created_at) VALUES(?,?,?,?,?,?)").run(id,taskId,task.memory_id,task.title,JSON.stringify(steps),now());
    return {id,stored:true,verified:false};
  });
}
export function consolidateSources(ids,{kind="semantic"}={}){
  if(!["episode","semantic","compressed"].includes(kind))throw Error("Invalid kind");
  const unique=[...new Set(ids)];
  if(unique.length<2||unique.length>12)throw Error("Requires 2-12 sources");
  return tx(db=>{
    const get=db.prepare("SELECT content FROM memory_entries WHERE id=? AND state='active'");
    const excerpts=unique.map(id=>{const m=get.get(id);if(!m||confidential.test(m.content))throw Error("Source unavailable");return {memoryId:id,excerpt:m.content.slice(0,kind==="compressed"?100:250)};});
    const id=randomUUID(),content=JSON.stringify({method:"extractive",excerpts,verified:false});
    db.prepare("INSERT INTO memory_consolidations(id,content,kind,created_at) VALUES(?,?,?,?)").run(id,content,kind,now());
    for(const sourceId of unique)db.prepare("INSERT INTO memory_consolidation_sources(consolidation_id,memory_id) VALUES(?,?)").run(id,sourceId);
    return {id,sourceCount:unique.length,originalsPreserved:true};
  });
}
export function reinforceLink(linkId,{memoryId,decision="strengthen"}={}){
  if(!["strengthen","weaken"].includes(decision))throw Error("Invalid decision");
  return tx(db=>{
    source(db,memoryId);
    const link=db.prepare("SELECT score FROM memory_links WHERE id=?").get(linkId);
    if(!link)throw Error("Link absent");
    const score=Math.min(1,Math.max(0,link.score+(decision==="strengthen"?.04:-.04)));
    db.prepare("UPDATE memory_links SET score=? WHERE id=?").run(score,linkId);
    db.prepare("INSERT INTO memory_association_reviews(id,link_id,source_memory_id,decision,created_at) VALUES(?,?,?,?,?)").run(randomUUID(),linkId,memoryId,decision,now());
    return {score,audited:true};
  });
}

/** Autobiographical audit: actual task completions, decisions, and reviewed outcomes. */
export function experienceTimeline({limit=50}={}){
  return withCoreDatabase(db=>{
    const size=Math.min(100,Math.max(1,Number(limit)||50));
    const tasks=db.prepare("SELECT t.id,t.title,t.status,t.outcome,t.updated_at AS occurredAt,m.source_kind AS sourceKind,m.source_id AS sourceId FROM memory_tasks t JOIN memory_entries m ON m.id=t.memory_id WHERE m.state='active' ORDER BY t.updated_at DESC LIMIT ?").all(size);
    const decisions=db.prepare("SELECT d.id,d.subject,d.choice,d.rationale,d.state,d.created_at AS occurredAt,m.source_id AS sourceId FROM memory_decisions d JOIN memory_entries m ON m.id=d.memory_id WHERE m.state='active' ORDER BY d.created_at DESC LIMIT ?").all(size);
    return [...tasks.map(t=>({...t,kind:"task"})),...decisions.map(d=>({...d,kind:"decision"}))]
      .sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,size);
  });
}
/** Bounded, idempotent conversion of completed tasks to unverified procedure candidates. */
export function consolidateCompletedTasks({limit=20}={}){
  const tasks=withCoreDatabase(db=>db.prepare("SELECT t.id FROM memory_tasks t JOIN memory_entries m ON m.id=t.memory_id WHERE t.status='done' AND LENGTH(TRIM(t.outcome))>0 AND m.state='active' AND NOT EXISTS(SELECT 1 FROM memory_procedures p WHERE p.source_task_id=t.id) ORDER BY t.updated_at LIMIT ?").all(Math.min(40,Math.max(1,Number(limit)||20))));
  let stored=0;
  for(const task of tasks)if(procedureFromTask(task.id).stored)stored++;
  return {processed:tasks.length,stored,reviewed:false};
}
