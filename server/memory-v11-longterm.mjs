/** YATSUMIRA CORE v11 — source-linked long term memory.
 * No silent edits to the underlying memory_entries records or source documents.
 */
import {randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {confidential,normalizeMemory,memoryTokens} from "./memory-store.mjs";
const stamp=()=>new Date().toISOString();
const safe=(input,max=1000)=>{
  const value=String(input??"").trim();
  if(!value||value.length>max||confidential.test(value))throw Error("Invalid or sensitive memory value");
  return value;
};
const tx=fn=>withCoreDatabase(db=>{
  db.exec("BEGIN IMMEDIATE");
  try{const result=fn(db);db.exec("COMMIT");return result;}
  catch(error){db.exec("ROLLBACK");throw error;}
});
const source=(db,id)=>{
  const m=db.prepare("SELECT id,source_kind AS sourceKind,source_id AS sourceId,conversation_id AS conversationId,valid_from AS validFrom,valid_to AS validTo,verified FROM memory_entries WHERE id=? AND state='active'").get(id);
  if(!m)throw Error("Active source memory required");
  return m;
};
const validateTime=s=>{const d=new Date(s);if(!Number.isFinite(d.getTime()))throw Error("Invalid timestamp");return d.toISOString();};
export function storeMemoryContext(memoryId,{conversationId="",topic="",who="",why="",when=null,relatedIds=[]}={}){
  return tx(db=>{
    const origin=source(db,memoryId);
    const ids=[...new Set(relatedIds)];
    if(ids.length>30)throw Error("Too many related sources");
    for(const id of ids)source(db,id);
    const context={topic:topic?safe(topic,200):"",who:who?safe(who,200):"",why:why?safe(why,400):"",
      when:when?validateTime(when):null,relatedIds:ids};
    const id=conversationId?safe(conversationId,200):origin.conversationId;
    const found=db.prepare("SELECT 1 AS yes FROM memory_v11_context WHERE memory_id=?").get(memoryId);
    if(found)return {memoryId,stored:false};
    db.prepare("INSERT INTO memory_v11_context(memory_id,conversation_id,context_json,created_at) VALUES(?,?,?,?)")
      .run(memoryId,id,JSON.stringify(context),stamp());
    return {memoryId,stored:true,context};
  });
}
export function memoryRecord(memoryId){
  return withCoreDatabase(db=>{
    const memory=db.prepare("SELECT id,content,source_kind AS sourceKind,source_id AS sourceId,conversation_id AS conversationId,importance,confidence,verified,state,valid_from AS validFrom,valid_to AS validTo,created_at AS createdAt FROM memory_entries WHERE id=?").get(memoryId);
    if(!memory)throw Error("Memory missing");
    const context=db.prepare("SELECT context_json AS data,conversation_id AS conversationId FROM memory_v11_context WHERE memory_id=?").get(memoryId);
    const revisions=db.prepare("SELECT revision,source_memory_id AS sourceMemoryId,reason,created_at AS createdAt FROM memory_v11_history WHERE memory_id=? ORDER BY revision DESC LIMIT 20").all(memoryId);
    return {...memory,verified:!!memory.verified,context:context?JSON.parse(context.data):null,revisions};
  });
}
export function memoryRevision(memoryId,{content,sourceMemoryId,reason}){
  return tx(db=>{
    source(db,memoryId);source(db,sourceMemoryId);
    const text=safe(content,4000),why=safe(reason,350);
    const previous=db.prepare("SELECT MAX(revision) AS revision FROM memory_v11_history WHERE memory_id=?").get(memoryId);
    const revision=(previous.revision||0)+1;
    db.prepare("INSERT INTO memory_v11_history(id,memory_id,revision,content,source_memory_id,reason,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(randomUUID(),memoryId,revision,text,sourceMemoryId,why,stamp());
    return {memoryId,revision,originalPreserved:true};
  });
}
export function memoryHierarchy({childId,parentId,relation="part_of"}){
  if(!["part_of","explains","derived_from"].includes(relation)||childId===parentId)throw Error("Invalid hierarchy");
  return tx(db=>{
    source(db,childId);source(db,parentId);
    const found=db.prepare("WITH RECURSIVE parents(id) AS (SELECT parent_memory_id FROM memory_v11_hierarchy WHERE memory_id=? UNION SELECT h.parent_memory_id FROM memory_v11_hierarchy h JOIN parents p ON h.memory_id=p.id) SELECT 1 AS yes FROM parents WHERE id=? LIMIT 1").get(parentId,childId);
    if(found)throw Error("Hierarchy cycle");
    const r=db.prepare("INSERT OR IGNORE INTO memory_v11_hierarchy(memory_id,parent_memory_id,relation,created_at) VALUES(?,?,?,?)").run(childId,parentId,relation,stamp());
    return {stored:!!r.changes};
  });
}
export function memoryFamily(memoryId){
  return withCoreDatabase(db=>({
    parents:db.prepare("SELECT h.parent_memory_id AS memoryId,h.relation,m.source_id AS sourceId FROM memory_v11_hierarchy h JOIN memory_entries m ON m.id=h.parent_memory_id WHERE h.memory_id=? AND m.state='active'").all(memoryId),
    children:db.prepare("SELECT h.memory_id AS memoryId,h.relation,m.source_id AS sourceId FROM memory_v11_hierarchy h JOIN memory_entries m ON m.id=h.memory_id WHERE h.parent_memory_id=? AND m.state='active'").all(memoryId)
  }));
}
export function associateMemories({fromId,toId,relation="related",confidence=.4}){
  if(!["related","duplicate_candidate","temporal","causal_candidate","contradiction_candidate"].includes(relation)||fromId===toId)throw Error("Invalid association");
  return tx(db=>{
    source(db,fromId);source(db,toId);
    const weight=Number(confidence);
    if(!Number.isFinite(weight)||weight<0||weight>1)throw Error("Invalid confidence");
    const r=db.prepare("INSERT OR IGNORE INTO memory_v11_associations(from_id,to_id,relation,confidence,created_at) VALUES(?,?,?,?,?)").run(fromId,toId,relation,Math.min(weight,.75),stamp());
    return {stored:!!r.changes,verified:false,relation};
  });
}
export function relatedMemories(memoryId,{limit=30}={}){
  return withCoreDatabase(db=>db.prepare("SELECT a.from_id AS fromId,a.to_id AS toId,a.relation,a.confidence,m.source_kind AS sourceKind,m.source_id AS sourceId FROM memory_v11_associations a JOIN memory_entries m ON m.id=CASE WHEN a.from_id=? THEN a.to_id ELSE a.from_id END WHERE (a.from_id=? OR a.to_id=?) AND m.state='active' ORDER BY a.confidence DESC LIMIT ?")
    .all(memoryId,memoryId,memoryId,Math.max(1,Math.min(100,limit))));
}
export function goalMemory({memoryId,title,description="",horizon="long"}){
  if(!["short","long"].includes(horizon))throw Error("Invalid goal horizon");
  return tx(db=>{
    source(db,memoryId);
    const id=randomUUID(),time=stamp();
    db.prepare("INSERT INTO memory_v11_goals(id,memory_id,title,description,horizon,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run(id,memoryId,safe(title,240),description?safe(description,900):"",horizon,time,time);
    return {id,status:"active",horizon};
  });
}
export function goalProgress(id,{status,memoryId,relation="outcome"}={}){
  if(!["active","achieved","cancelled"].includes(status)||!["supports","blocks","outcome"].includes(relation))throw Error("Invalid goal update");
  return tx(db=>{
    const goal=db.prepare("SELECT id,status FROM memory_v11_goals WHERE id=?").get(id);
    if(!goal)throw Error("Goal not found");
    if(goal.status!=="active"&&goal.status!==status)throw Error("Closed goal cannot be reopened");
    if(memoryId)source(db,memoryId);
    db.prepare("UPDATE memory_v11_goals SET status=?,updated_at=? WHERE id=?").run(status,stamp(),id);
    if(memoryId)db.prepare("INSERT OR IGNORE INTO memory_v11_goal_links(goal_id,memory_id,relation) VALUES(?,?,?)").run(id,memoryId,relation);
    return {id,status};
  });
}
export function goals({limit=30}={}){
  return withCoreDatabase(db=>db.prepare("SELECT g.id,g.title,g.description,g.horizon,g.status,g.memory_id AS memoryId,m.source_id AS sourceId FROM memory_v11_goals g JOIN memory_entries m ON m.id=g.memory_id WHERE m.state='active' ORDER BY CASE WHEN g.status='active' THEN 0 ELSE 1 END,g.updated_at DESC LIMIT ?")
    .all(Math.min(100,Math.max(1,limit))));
}
export function preferenceMemory({memoryId,key,value,context="",validFrom}){
  return tx(db=>{
    const m=source(db,memoryId),prefKey=normalizeMemory(safe(key,90)),prefValue=safe(value,450);
    if(!prefKey)throw Error("Invalid preference key");
    const date=validFrom?validateTime(validFrom):m.validFrom;
    const old=db.prepare("SELECT id,state FROM memory_v11_preferences WHERE memory_id=? AND pref_key=? AND pref_value=?").get(memoryId,prefKey,prefValue);
    if(old)return {id:old.id,stored:false,state:old.state};
    const id=randomUUID();
    db.prepare("INSERT INTO memory_v11_preferences(id,memory_id,pref_key,pref_value,context,valid_from,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(id,memoryId,prefKey,prefValue,context?safe(context,250):"",date,stamp());
    return {id,stored:true,state:"candidate"};
  });
}
export function reviewPreference(id,{approved,evidence}={}){
  if(typeof approved!=="boolean")throw Error("Review decision required");
  const why=safe(evidence,400);
  return tx(db=>{
    const row=db.prepare("SELECT state FROM memory_v11_preferences WHERE id=?").get(id);
    if(!row||row.state!=="candidate")throw Error("Preference not pending");
    const state=approved?"reviewed":"retracted";
    db.prepare("UPDATE memory_v11_preferences SET state=?,valid_to=? WHERE id=?").run(state,approved?null:stamp(),id);
    db.prepare("INSERT INTO core_events(id,event_type,payload,created_at) VALUES(?,?,?,?)")
      .run(randomUUID(),"v11.preference_review",JSON.stringify({id,state,evidence:why}),stamp());
    return {id,state};
  });
}
export function preferences({reviewedOnly=true,asOf,limit=50}={}){
  const at=asOf?validateTime(asOf):stamp();
  return withCoreDatabase(db=>db.prepare("SELECT p.id,p.pref_key AS key,p.pref_value AS value,p.context,p.state,p.memory_id AS memoryId,m.source_id AS sourceId FROM memory_v11_preferences p JOIN memory_entries m ON m.id=p.memory_id WHERE p.valid_from<=? AND (p.valid_to IS NULL OR p.valid_to>?) AND m.state='active' AND (?=0 OR p.state='reviewed') AND p.state<>'retracted' ORDER BY p.created_at DESC LIMIT ?")
    .all(at,at,reviewedOnly?1:0,Math.min(100,Math.max(1,limit))));
}
export function memoryAcrossSources(query,{limit=30}={}){
  const words=memoryTokens(safe(query,500)).slice(0,8);
  return withCoreDatabase(db=>{
    const recent=db.prepare("SELECT id,content,source_kind AS sourceKind,source_id AS sourceId,conversation_id AS conversationId,verified,valid_from AS validFrom FROM memory_entries WHERE state='active' ORDER BY updated_at DESC LIMIT 500").all();
    const hits=recent.map(row=>({...row,match:words.filter(t=>memoryTokens(row.content).some(w=>w.includes(t)||t.includes(w))).length}))
      .filter(x=>x.match>0&&!confidential.test(x.content)).sort((a,b)=>b.match-a.match).slice(0,Math.min(60,Math.max(1,limit)));
    return {results:hits,sourceKinds:[...new Set(hits.map(x=>x.sourceKind))],
      conversations:[...new Set(hits.map(x=>x.conversationId).filter(Boolean))],
      note:"Source-specific search includes locally indexed memories; files must be ingested first"};
  });
}

/** Controlled recall for the chat: only manually reviewed preferences and active
 * goals with active source memories; relevance filters avoid dumping unrelated history.
 */
export function longTermChatContext(query,{maxChars=800}={}){
  const terms=new Set(memoryTokens(query));
  if(!terms.size)return {text:"",entries:0};
  const activeGoals=goals({limit:35}).filter(x=>x.status==="active");
  const reviewed=preferences({reviewedOnly:true,limit:35});
  const relevant=entry=>{
    const words=memoryTokens(entry);
    return words.some(w=>[...terms].some(t=>w.startsWith(t.slice(0,5))||t.startsWith(w.slice(0,5))));
  };
  const lines=[
    ...activeGoals.filter(x=>relevant(x.title+" "+x.description)).map(x=>({text:"Цель: "+x.title,sourceId:x.sourceId})),
    ...reviewed.filter(x=>relevant(x.key+" "+x.value+" "+x.context)).map(x=>({text:"Подтверждённое предпочтение: "+x.key+" = "+x.value,sourceId:x.sourceId}))
  ];
  const result=[];
  let length=0;
  for(const line of lines){
    const rendered=line.text+" [источник: "+line.sourceId+"]";
    if(length+rendered.length+1>Math.max(150,Math.min(1500,maxChars)))continue;
    length+=rendered.length+1;result.push(rendered);
  }
  return {text:result.join("\n"),entries:result.length};
}
