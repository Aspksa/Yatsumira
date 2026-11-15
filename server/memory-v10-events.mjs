/** CORE v10: graph provenance, consistency, temporal events, causal candidates and experience links.
 * All automatic relations remain candidates. Never certify causality from co-occurrence.
 */
import {randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {confidential} from "./memory-store.mjs";
const now=()=>new Date().toISOString();
const safe=x=>{const s=String(x??"").trim();if(!s||s.length>500||confidential.test(s))throw Error("Invalid/sensitive text");return s;};
const tx=fn=>withCoreDatabase(db=>{db.exec("BEGIN IMMEDIATE");try{const r=fn(db);db.exec("COMMIT");return r;}catch(e){db.exec("ROLLBACK");throw e;}});
const source=(db,id)=>{if(!db.prepare("SELECT id FROM memory_entries WHERE id=? AND state='active'").get(id))throw Error("Active evidence required");};
export function graphProvenance(assertionId){
  return withCoreDatabase(db=>{
    const row=db.prepare("SELECT a.id,a.predicate,a.confidence,a.review_state AS reviewState,a.valid_from AS validFrom,a.valid_to AS validTo,m.id AS memoryId,m.source_kind AS sourceKind,m.source_id AS sourceId,m.verified,m.state,s.label AS subject,o.label AS object FROM graph_assertions a JOIN graph_nodes s ON s.id=a.subject_id JOIN graph_nodes o ON o.id=a.object_id JOIN memory_entries m ON m.id=a.memory_id WHERE a.id=?").get(assertionId);
    if(!row)throw Error("Assertion not found");
    return {...row,verified:!!row.verified&&row.reviewState==="reviewed",sourceAvailable:row.state==="active"};
  });
}
export function inspectGraphRules({limit=50}={}){
  return withCoreDatabase(db=>{
    const errors=[],cap=Math.min(100,Math.max(1,limit));
    const invalid=db.prepare("SELECT a.id FROM graph_assertions a WHERE a.valid_to IS NOT NULL AND a.valid_to<=a.valid_from LIMIT ?").all(cap);
    errors.push(...invalid.map(x=>({id:x.id,reason:"invalid-interval"})));
    const orphans=db.prepare("SELECT a.id FROM graph_assertions a LEFT JOIN memory_entries m ON m.id=a.memory_id WHERE m.id IS NULL LIMIT ?").all(cap);
    errors.push(...orphans.map(x=>({id:x.id,reason:"missing-source"})));
    const ambiguous=db.prepare("SELECT a.id,s.node_type AS subjectType,o.node_type AS objectType,a.predicate FROM graph_assertions a JOIN graph_nodes s ON s.id=a.subject_id JOIN graph_nodes o ON o.id=a.object_id WHERE a.subject_id=a.object_id LIMIT ?").all(cap);
    return {ok:errors.length===0,errors,candidates:ambiguous.map(x=>({...x,warning:"self-relation-may-be-intended"})),
      note:"Structural constraints only; semantic correctness requires review"};
  });
}
export function linkEventNode({eventId,nodeId,role}){
  return tx(db=>{
    const event=db.prepare("SELECT e.id,e.memory_id AS memoryId FROM graph_events e JOIN memory_entries m ON m.id=e.memory_id WHERE e.id=? AND m.state='active'").get(eventId);
    if(!event||!db.prepare("SELECT id FROM graph_nodes WHERE id=?").get(nodeId))throw Error("Missing event or node");
    const name=safe(role).slice(0,80);
    const r=db.prepare("INSERT OR IGNORE INTO graph_v10_event_links(event_id,node_id,role) VALUES(?,?,?)").run(eventId,nodeId,name);
    return {stored:!!r.changes,memoryId:event.memoryId};
  });
}
export function eventHistory({from,to,limit=50}={}){
  return withCoreDatabase(db=>{
    const first=from?new Date(from).toISOString():"0001-01-01T00:00:00.000Z";
    const end=to?new Date(to).toISOString():"9999-12-31T23:59:59.999Z";
    if(first>end)throw Error("Invalid date interval");
    return db.prepare("SELECT e.id,e.title,e.event_type AS eventType,e.occurred_at AS occurredAt,e.memory_id AS memoryId,m.source_kind AS sourceKind,m.source_id AS sourceId FROM graph_events e JOIN memory_entries m ON m.id=e.memory_id WHERE m.state='active' AND e.occurred_at>=? AND e.occurred_at<=? ORDER BY e.occurred_at DESC LIMIT ?").all(first,end,Math.min(100,Math.max(1,limit)));
  });
}
export function proposeEventCause({causeEventId,effectEventId,memoryId}){
  if(causeEventId===effectEventId)throw Error("An event cannot cause itself");
  return tx(db=>{
    source(db,memoryId);
    const read=db.prepare("SELECT occurred_at AS occurredAt FROM graph_events WHERE id=?");
    const cause=read.get(causeEventId),effect=read.get(effectEventId);
    if(!cause||!effect||cause.occurredAt>effect.occurredAt)throw Error("Invalid event temporal order");
    const old=db.prepare("SELECT id FROM graph_v10_causal WHERE cause_event_id=? AND effect_event_id=? AND source_memory_id=?").get(causeEventId,effectEventId,memoryId);
    if(old)return {id:old.id,stored:false};
    const id=randomUUID();
    db.prepare("INSERT INTO graph_v10_causal(id,cause_event_id,effect_event_id,source_memory_id,created_at) VALUES(?,?,?,?,?)")
      .run(id,causeEventId,effectEventId,memoryId,now());
    return {id,stored:true,state:"candidate",verified:false};
  });
}
export function inspectEventCauses({reviewedOnly=false,limit=60}={}){
  return withCoreDatabase(db=>db.prepare("SELECT c.id,c.cause_event_id AS causeEventId,c.effect_event_id AS effectEventId,c.state,c.source_memory_id AS sourceMemoryId FROM graph_v10_causal c JOIN memory_entries m ON m.id=c.source_memory_id WHERE m.state='active' AND c.state<>'rejected' AND (?=0 OR c.state='reviewed') LIMIT ?").all(reviewedOnly?1:0,Math.min(100,limit)));
}
export function connectTaskEvent({taskId,eventId,role="result"}){
  return tx(db=>{
    const task=db.prepare("SELECT id,memory_id AS memoryId FROM memory_tasks WHERE id=?").get(taskId);
    const event=db.prepare("SELECT id FROM graph_events WHERE id=?").get(eventId);
    if(!task||!event)throw Error("Task or event not found");
    source(db,task.memoryId);
    const r=db.prepare("INSERT OR IGNORE INTO graph_v10_experience(id,task_id,event_id,role,created_at) VALUES(?,?,?,?,?)").run(randomUUID(),taskId,eventId,safe(role).slice(0,60),now());
    return {stored:!!r.changes};
  });
}
export function experienceGraph({limit=50}={}){
  return withCoreDatabase(db=>db.prepare("SELECT x.task_id AS taskId,t.title AS task,x.event_id AS eventId,e.title AS event,x.role,e.memory_id AS memoryId FROM graph_v10_experience x JOIN memory_tasks t ON t.id=x.task_id JOIN graph_events e ON e.id=x.event_id JOIN memory_entries m ON m.id=e.memory_id WHERE m.state='active' ORDER BY x.created_at DESC LIMIT ?").all(Math.min(100,limit)));
}
