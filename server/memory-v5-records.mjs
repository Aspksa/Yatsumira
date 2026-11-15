/** CORE v5: domain-neutral provenance records, episodic decisions and resumable tasks.
 * Every durable claim links to a real memory source. No autonomous fact verification.
 */
import {randomUUID,createHash} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {normalizeMemory,confidential} from "./memory-store.mjs";
const now=()=>new Date().toISOString();
const string=(v,max=500)=>String(v??"").trim().slice(0,max);
const needed=(v,max=500)=>{const s=string(v,max);if(!s||confidential.test(s))throw Object.assign(new Error("Invalid or sensitive record"),{status:400});return s;};
const source=(db,id)=>{
  const row=db.prepare("SELECT id,state FROM memory_entries WHERE id=?").get(id);
  if(!row||row.state!=="active")throw Object.assign(new Error("Active source memory required"),{status:404});
  return row;
};
const transaction=(fn)=>withCoreDatabase(db=>{
  db.exec("BEGIN IMMEDIATE");
  try{const result=fn(db);db.exec("COMMIT");return result;}
  catch(error){db.exec("ROLLBACK");throw error;}
});
export function detectIntent(text){
  const s=normalizeMemory(text);
  if(!s)return {intent:"empty",confidence:1};
  if(/(?:^|\s)(?:запомни|сохрани|remember|зафиксируй)(?:\s|$)/u.test(s))return {intent:"remember",confidence:.9};
  if(/(?:^|\s)(?:найди|поищи|search|где)(?:\s|$)/u.test(s))return {intent:"search",confidence:.85};
  if(/(?:^|\s)(?:сделай|создай|исправь|выполни|обнови)(?:\s|$)/u.test(s))return {intent:"request",confidence:.8};
  if(/[?？]/u.test(String(text)))return {intent:"question",confidence:.8};
  if(/(?:^|\s)(?:возможно|предполагаю|наверное|maybe|вероятно)(?:\s|$)/u.test(s))return {intent:"uncertain",confidence:.8};
  return {intent:"statement",confidence:.4};
}
export function detectReferences(text){
  const s=String(text||"");
  return [...s.matchAll(/(?:^|[\s,])(?:он|она|оно|они|это|тот|та|этот|those|it|they)(?=[\s,.!?]|$)/giu)]
    .slice(0,16).map(m=>({pronoun:m[0].trim(),offset:m.index,requiresContext:true}));
}
export function multilingualKeywords(text){
  const s=normalizeMemory(text);
  const aliases={"car":"автомобиль","auto":"автомобиль","vehicle":"автомобиль","ai":"ии","memory":"память","project":"проект","graph":"граф","task":"задача"};
  const tokens=s.split(" ").filter(x=>x.length>=2).slice(0,100);
  return [...new Set(tokens.flatMap(x=>aliases[x]?[x,aliases[x]]:[x]))];
}
export function registerAlias({nodeId,alias,memoryId}){
  return transaction(db=>{
    source(db,memoryId);
    if(!db.prepare("SELECT id FROM graph_nodes WHERE id=?").get(nodeId))throw Object.assign(new Error("Node not found"),{status:404});
    const name=needed(alias,120),normalized=normalizeMemory(name);
    const found=db.prepare("SELECT id FROM memory_aliases WHERE node_id=? AND normalized_alias=? AND source_memory_id=?").get(nodeId,normalized,memoryId);
    if(found)return {id:found.id,stored:false};
    const id=randomUUID();
    db.prepare("INSERT INTO memory_aliases(id,node_id,alias,normalized_alias,source_memory_id,created_at) VALUES(?,?,?,?,?,?)")
      .run(id,nodeId,name,normalized,memoryId,now());
    return {id,stored:true,reviewState:"candidate"};
  });
}
export function resolveAliases(label,{reviewedOnly=true}={}){
  return withCoreDatabase(db=>db.prepare(
    "SELECT n.id,n.label,n.node_type AS type,a.review_state AS reviewState,a.source_memory_id AS memoryId FROM memory_aliases a JOIN graph_nodes n ON n.id=a.node_id JOIN memory_entries m ON m.id=a.source_memory_id WHERE a.normalized_alias=? AND (?=0 OR a.review_state='reviewed') AND a.review_state<>'rejected' AND m.state='active' ORDER BY n.label"
  ).all(normalizeMemory(label),reviewedOnly?1:0));
}
export function reviewAlias(id,{approved,evidence}={}){
  if(typeof approved!=="boolean"||!string(evidence))throw Object.assign(new Error("Alias review requires evidence"),{status:400});
  return transaction(db=>{
    const row=db.prepare("SELECT review_state FROM memory_aliases WHERE id=?").get(id);
    if(!row||row.review_state!=="candidate")throw Object.assign(new Error("Alias cannot be reviewed"),{status:409});
    const state=approved?"reviewed":"rejected";
    db.prepare("UPDATE memory_aliases SET review_state=? WHERE id=?").run(state,id);
    db.prepare("INSERT INTO core_events(id,event_type,payload,created_at) VALUES(?,?,?,?)").run(randomUUID(),"memory.alias_review",JSON.stringify({id,state,evidence:string(evidence,400)}),now());
    return {id,state};
  });
}
export function recordDecision({memoryId,subject,choice,rationale=""}){
  return transaction(db=>{
    source(db,memoryId);
    const id=randomUUID();
    db.prepare("INSERT INTO memory_decisions(id,memory_id,subject,choice,rationale,created_at) VALUES(?,?,?,?,?,?)")
      .run(id,memoryId,needed(subject,150),needed(choice,500),string(rationale,1000),now());
    return {id,state:"candidate"};
  });
}
export function decisions({limit=50}={}){
  return withCoreDatabase(db=>db.prepare("SELECT d.id,d.subject,d.choice,d.rationale,d.state,d.created_at AS createdAt,m.source_kind AS sourceKind,m.source_id AS sourceId FROM memory_decisions d JOIN memory_entries m ON m.id=d.memory_id WHERE m.state='active' ORDER BY d.created_at DESC LIMIT ?").all(Math.max(1,Math.min(100,limit))));
}
export function createMemoryTask({memoryId,title,checkpoint=""}){
  return transaction(db=>{
    source(db,memoryId);
    const id=randomUUID(),date=now();
    db.prepare("INSERT INTO memory_tasks(id,memory_id,title,checkpoint,updated_at,created_at) VALUES(?,?,?,?,?,?)")
      .run(id,memoryId,needed(title,240),string(checkpoint,1500),date,date);
    return {id,status:"open"};
  });
}
export function updateMemoryTask(id,{status,checkpoint,outcome}={}){
  return transaction(db=>{
    const current=db.prepare("SELECT * FROM memory_tasks WHERE id=?").get(id);
    if(!current)throw Object.assign(new Error("Task not found"),{status:404});
    if(current.status!=="open")throw Object.assign(new Error("Task already closed"),{status:409});
    if(status!==undefined&&!["open","done","cancelled"].includes(status))throw Object.assign(new Error("Invalid task status"),{status:400});
    const state=status??current.status;
    db.prepare("UPDATE memory_tasks SET status=?,checkpoint=?,outcome=?,updated_at=? WHERE id=?").run(state,checkpoint===undefined?current.checkpoint:string(checkpoint,1500),outcome===undefined?current.outcome:string(outcome,1500),now(),id);
    return {id,status:state};
  });
}
export function openMemoryTasks({limit=50}={}){
  return withCoreDatabase(db=>db.prepare("SELECT t.id,t.title,t.checkpoint,t.created_at AS createdAt,t.updated_at AS updatedAt,m.source_id AS sourceId FROM memory_tasks t JOIN memory_entries m ON m.id=t.memory_id WHERE t.status='open' AND m.state='active' ORDER BY t.updated_at DESC LIMIT ?").all(Math.min(100,Math.max(1,limit))));
}
export function addHyperedge({memoryId,relationType,participants,confidence=.5}){
  if(!Array.isArray(participants)||participants.length<2||participants.length>15)throw Object.assign(new Error("Need 2-15 participants"),{status:400});
  return transaction(db=>{
    source(db,memoryId);
    const id=randomUUID(),kind=needed(relationType,80).toLowerCase();
    const roles=new Set();
    for(const p of participants){
      if(!db.prepare("SELECT id FROM graph_nodes WHERE id=?").get(p.nodeId))throw Object.assign(new Error("Participant node not found"),{status:404});
      const pair=p.nodeId+"#"+p.role;
      if(roles.has(pair))throw Object.assign(new Error("Duplicate role"),{status:400});
      roles.add(pair);
    }
    db.prepare("INSERT INTO memory_hyperedges(id,relation_type,source_memory_id,confidence,created_at) VALUES(?,?,?,?,?)").run(id,kind,memoryId,Math.max(0,Math.min(1,Number(confidence)||0)),now());
    const insert=db.prepare("INSERT INTO memory_hyperedge_nodes(hyperedge_id,node_id,role) VALUES(?,?,?)");
    for(const p of participants)insert.run(id,p.nodeId,needed(p.role,60));
    return {id,members:participants.length};
  });
}
export function hyperedgesFor(nodeId){
  return withCoreDatabase(db=>db.prepare("SELECT h.id,h.relation_type AS relation,h.confidence,h.source_memory_id AS memoryId,x.role FROM memory_hyperedges h JOIN memory_hyperedge_nodes x ON x.hyperedge_id=h.id JOIN memory_entries m ON m.id=h.source_memory_id WHERE x.node_id=? AND m.state='active'").all(nodeId));
}
export function needsReindex(sourceKey,content){
  const key=needed(sourceKey,300),hash=createHash("sha256").update(String(content??"")).digest("hex");
  return withCoreDatabase(db=>({changed:db.prepare("SELECT digest FROM memory_document_index WHERE source_key=?").get(key)?.digest!==hash,digest:hash}));
}
export function markIndexed(sourceKey,content,result={}){
  const {digest}=needsReindex(sourceKey,content);
  const data=JSON.stringify(result);
  if(data.length>3000)throw Object.assign(new Error("Index result too large"),{status:400});
  return withCoreDatabase(db=>{
    const previous=db.prepare("SELECT digest FROM memory_document_index WHERE source_key=?").get(sourceKey);
    db.prepare("INSERT INTO memory_document_index(source_key,digest,indexed_at,result_json) VALUES(?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET digest=excluded.digest,indexed_at=excluded.indexed_at,result_json=excluded.result_json")
      .run(sourceKey,digest,now(),data);
    return {changed:previous?.digest!==digest,digest};
  });
}
