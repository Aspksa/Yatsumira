/**
 * Universal graph for objects, people, places, events, projects or arbitrary labels.
 * All graph statements are sourced, date-bounded candidates until reviewed.
 * No special domain vocabulary, inference of truth, UI, or external services.
 */
import {randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {normalizeMemory,memoryTokens,confidential} from "./memory-store.mjs";

const timestamp=()=>new Date().toISOString();
const safeLabel=(value,max=120)=>{
  const label=String(value??"").trim().slice(0,max);
  if(!label||!normalizeMemory(label))throw Object.assign(new Error("Invalid graph label"),{status:400});
  return label;
};
const clamp=(value,lower=0,upper=1)=>Math.max(lower,Math.min(upper,Number(value)||0));
const normalizePredicate=value=>{
  const p=safeLabel(value,80).normalize("NFKC").toLowerCase().replace(/\s+/g,"_");
  if(!/^[\p{L}\p{N}_-]+$/u.test(p))throw Object.assign(new Error("Invalid graph predicate"),{status:400});
  return p;
};
const ensureDate=value=>{
  const d=String(value||timestamp());
  if(!Number.isFinite(Date.parse(d)))throw Object.assign(new Error("Invalid ISO date"),{status:400});
  return new Date(d).toISOString();
};
function ensureNode(db,label,type){
  const name=safeLabel(label),kind=safeLabel(type||"unknown",35).toLowerCase(),normalized=normalizeMemory(name);
  const present=db.prepare("SELECT id FROM graph_nodes WHERE node_type=? AND normalized_label=?").get(kind,normalized);
  if(present)return present.id;
  const id=randomUUID();
  db.prepare("INSERT INTO graph_nodes(id,node_type,label,normalized_label,created_at) VALUES(?,?,?,?,?)")
    .run(id,kind,name,normalized,timestamp());
  return id;
}
function addClaim(db,claim){
  const memory=db.prepare("SELECT id,state,valid_from FROM memory_entries WHERE id=?").get(claim.memoryId);
  if(!memory||memory.state!=="active")throw Object.assign(new Error("Active source memory required"),{status:404});
  if(confidential.test(String(claim.subject)+" "+String(claim.object)))throw Object.assign(new Error("Unsafe graph content"),{status:400});
  const from=ensureDate(claim.validFrom||memory.valid_from);
  const until=claim.validTo?ensureDate(claim.validTo):null;
  if(until&&until<=from)throw Object.assign(new Error("Invalid graph validity interval"),{status:400});
  const subjectId=ensureNode(db,claim.subject,claim.subjectType);
  const objectId=ensureNode(db,claim.object,claim.objectType);
  const predicate=normalizePredicate(claim.predicate);
  const confidence=clamp(claim.confidence??.45);
  const id=randomUUID(),date=timestamp();
  const insert=db.prepare("INSERT OR IGNORE INTO graph_assertions(id,subject_id,predicate,object_id,memory_id,confidence,review_state,valid_from,valid_to,created_at) VALUES(?,?,?,?,?,?,'candidate',?,?,?)")
    .run(id,subjectId,predicate,objectId,memory.id,confidence,from,until,date);
  if(!insert.changes){
    const previous=db.prepare("SELECT id FROM graph_assertions WHERE subject_id=? AND predicate=? AND object_id=? AND memory_id=?").get(subjectId,predicate,objectId,memory.id);
    return {id:previous.id,stored:false,conflicts:0};
  }
  // Contradictions need explicit declaration of a single-valued property, not a guess.
  let conflicts=0;
  if(claim.exclusive===true){
    const existing=db.prepare("SELECT id,valid_from,valid_to FROM graph_assertions WHERE subject_id=? AND predicate=? AND object_id<>? AND id<>? AND review_state<>'rejected'").all(subjectId,predicate,objectId,id);
    for(const item of existing){
      if((item.valid_to&&item.valid_to<=from)||(until&&until<=item.valid_from))continue;
      const [a,b]=[id,item.id].sort();
      const result=db.prepare("INSERT OR IGNORE INTO graph_conflicts(id,left_assertion,right_assertion,review_state,created_at) VALUES(?,?,?,'pending',?)").run(randomUUID(),a,b,date);
      conflicts+=result.changes;
    }
  }
  return {id,stored:true,conflicts,subjectId,objectId};
}
export function assertGraphRelation(claim){
  return withCoreDatabase(db=>{
    db.exec("BEGIN IMMEDIATE");
    try{const result=addClaim(db,claim);db.exec("COMMIT");return result;}
    catch(error){db.exec("ROLLBACK");throw error;}
  });
}
export function graphClaims({asOf,limit=250,reviewedOnly=false}={}){
  const at=ensureDate(asOf);
  return withCoreDatabase(db=>db.prepare("SELECT a.id,s.label AS subject,s.node_type AS subjectType,a.predicate,o.label AS object,o.node_type AS objectType,a.memory_id AS memoryId,a.confidence,a.review_state AS reviewState,a.valid_from AS validFrom,a.valid_to AS validTo FROM graph_assertions a JOIN graph_nodes s ON s.id=a.subject_id JOIN graph_nodes o ON o.id=a.object_id JOIN memory_entries m ON m.id=a.memory_id WHERE a.review_state<>'rejected' AND (?=0 OR a.review_state='reviewed') AND a.valid_from<=? AND (a.valid_to IS NULL OR a.valid_to>?) AND (m.state='active' OR m.valid_to>?) ORDER BY a.created_at DESC LIMIT ?")
    .all(reviewedOnly?1:0,at,at,at,Math.min(500,Math.max(1,Number(limit)||250))));
}
/** Heuristic name recognition — no claim that tokens are really named entities. */
export function extractGenericEntities(text){
  const input=String(text||"").slice(0,4000),results=[],seen=new Set();
  const patterns=[
    ["quoted",/[«“"]([^»”"]{3,90})[»”"]/gu],
    ["tag",/(?:^|\s)#([\p{L}\p{N}_-]{3,60})/gu],
    ["proper_name",/(?:^|[^\p{L}])([A-ZА-ЯЁ][a-zа-яё]{2,}(?:\s+[A-ZА-ЯЁ][a-zа-яё]{2,}){0,2})/gu],
    ["identifier",/\b([A-Z]{2,}-[0-9]{2,})\b/gu]
  ];
  for(const [type,re] of patterns)for(const match of input.matchAll(re)){
    const label=match[1].trim(),key=type+":"+normalizeMemory(label);
    if(seen.has(key))continue;seen.add(key);
    results.push({type,label,offset:match.index,verified:false});
    if(results.length>=24)return results;
  }
  return results;
}
/** Explicit generic relation templates only. Never silently invent triples. */
export function extractGenericRelations(text){
  const input=String(text||"").slice(0,4000),result=[];
  const re=/[«“"]([^»”"]{3,90})[»”"]\s+(связан[аоы]?\s+с|использует|находится\s+в|принадлежит|создал[ао]?|зависит\s+от)\s+[«“"]([^»”"]{3,90})[»”"]/giu;
  const predicates={"связан с":"related_to","связана с":"related_to","связано с":"related_to","связаны с":"related_to","использует":"uses","находится в":"located_in","принадлежит":"belongs_to","создал":"created","создала":"created","создало":"created","зависит от":"depends_on"};
  for(const match of input.matchAll(re)){
    result.push({subject:match[1],predicate:predicates[match[2].toLowerCase()]||"related_to",object:match[3],confidence:.55,sourceOffset:match.index});
    if(result.length>=12)break;
  }
  return result;
}
function addEvent(db,{memoryId,eventType="event",title,occurredAt,confidence=.55}){
  const memory=db.prepare("SELECT id,state FROM memory_entries WHERE id=?").get(memoryId);
  if(!memory||memory.state!=="active")throw Object.assign(new Error("Active event source required"),{status:404});
  const kind=safeLabel(eventType,45).toLowerCase(),name=safeLabel(title,240),date=ensureDate(occurredAt);
  if(confidential.test(name))throw Object.assign(new Error("Unsafe event content"),{status:400});
  const result=db.prepare("INSERT OR IGNORE INTO graph_events(id,memory_id,event_type,title,occurred_at,confidence,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(randomUUID(),memoryId,kind,name,date,clamp(confidence),timestamp());
  return {stored:result.changes===1};
}
export function recordMemoryEvent(input){
  return withCoreDatabase(db=>{
    db.exec("BEGIN IMMEDIATE");
    try{const result=addEvent(db,input);db.exec("COMMIT");return result;}
    catch(error){db.exec("ROLLBACK");throw error;}
  });
}
export function extractDatedEvents(text){
  const found=[],input=String(text||"").slice(0,4000);
  // Parse only dates directly stated in the source; do not infer 'yesterday' or invented events.
  const re=/(?:^|\n)(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?\s*[:—-]\s*([^\n]{5,160})/gu;
  for(const m of input.matchAll(re)){
    const occurredAt=m[1]+"T"+(m[2]||"00:00")+":00.000Z";
    if(Number.isFinite(Date.parse(occurredAt)))found.push({occurredAt,title:m[3].trim(),eventType:"source-stated",confidence:.7});
    if(found.length>=12)break;
  }
  return found;
}
export function memoryTimeline({asOf,limit=50}={}){
  const until=ensureDate(asOf);
  return withCoreDatabase(db=>db.prepare("SELECT e.id,e.event_type AS eventType,e.title,e.occurred_at AS occurredAt,e.confidence,m.source_kind AS sourceKind,m.source_id AS sourceId FROM graph_events e JOIN memory_entries m ON m.id=e.memory_id WHERE e.occurred_at<=? AND (m.state='active' OR m.valid_to>?) ORDER BY e.occurred_at DESC,e.id LIMIT ?")
    .all(until,until,Math.max(1,Math.min(200,Number(limit)||50))));
}

/** Incremental ingestion with source id and idempotency guarantees. */
export function indexUniversalGraph({batch=40}={}){
  return withCoreDatabase(db=>{
    db.exec("BEGIN IMMEDIATE");
    try{
      const job="universal-graph";
      const cursor=Number(db.prepare("SELECT cursor FROM memory_jobs WHERE name=?").get(job)?.cursor||0);
      let rows=db.prepare("SELECT rowid AS position,id,content FROM memory_entries WHERE rowid>? AND state='active' ORDER BY rowid LIMIT ?").all(cursor,Math.min(100,Math.max(1,batch)));
      let wrapped=false;
      if(!rows.length&&cursor>0){rows=db.prepare("SELECT rowid AS position,id,content FROM memory_entries WHERE state='active' ORDER BY rowid LIMIT ?").all(Math.min(100,Math.max(1,batch)));wrapped=true;}
      let nodes=0,claims=0,events=0;
      for(const row of rows){
        if(confidential.test(row.content))continue;
        for(const item of extractGenericEntities(row.content)){
          const old=db.prepare("SELECT id FROM graph_nodes WHERE node_type=? AND normalized_label=?").get(item.type,normalizeMemory(item.label));
          ensureNode(db,item.label,item.type);
          if(!old)nodes++;
        }
        for(const item of extractDatedEvents(row.content)){
          if(addEvent(db,{...item,memoryId:row.id}).stored)events++;
        }
        for(const item of extractGenericRelations(row.content)){
          const r=addClaim(db,{...item,memoryId:row.id});
          if(r.stored)claims++;
        }
      }
      const next=rows.at(-1)?.position??(wrapped?0:cursor),date=timestamp();
      db.prepare("INSERT INTO memory_jobs(name,cursor,last_run,last_result,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET cursor=excluded.cursor,last_run=excluded.last_run,last_result=excluded.last_result,updated_at=excluded.updated_at")
        .run(job,String(next),date,JSON.stringify({processed:rows.length,nodes,claims,events,wrapped}),date);
      db.exec("COMMIT");
      return {processed:rows.length,nodes,claims,events,wrapped};
    }catch(error){db.exec("ROLLBACK");throw error;}
  });
}
function graphSnapshot(db,{asOf,reviewedOnly=false}={}){
  const at=ensureDate(asOf);
  const edges=db.prepare("SELECT a.id,a.subject_id AS fromId,a.object_id AS toId,a.predicate,a.memory_id AS memoryId,a.confidence,a.review_state AS reviewState FROM graph_assertions a JOIN memory_entries m ON m.id=a.memory_id WHERE a.review_state<>'rejected' AND (?=0 OR a.review_state='reviewed') AND a.valid_from<=? AND (a.valid_to IS NULL OR a.valid_to>?) AND (m.state='active' OR m.valid_to>?)").all(reviewedOnly?1:0,at,at,at);
  const nodes=db.prepare("SELECT id,label,node_type AS type FROM graph_nodes").all();
  return {nodes,edges};
}
export function graphPath(fromLabel,toLabel,{asOf,maxHops=4,reviewedOnly=false}={}){
  return withCoreDatabase(db=>{
    const {nodes,edges}=graphSnapshot(db,{asOf,reviewedOnly});
    const from=normalizeMemory(fromLabel),to=normalizeMemory(toLabel);
    const starts=nodes.filter(n=>normalizeMemory(n.label)===from).map(n=>n.id);
    const ends=new Set(nodes.filter(n=>normalizeMemory(n.label)===to).map(n=>n.id));
    const adj=new Map();
    for(const e of edges)for(const [a,b] of [[e.fromId,e.toId],[e.toId,e.fromId]]){
      if(!adj.has(a))adj.set(a,[]);adj.get(a).push({next:b,edge:e});
    }
    const queue=starts.map(id=>({id,path:[],visited:new Set([id])}));
    while(queue.length){
      const current=queue.shift();
      if(ends.has(current.id))return {found:true,hops:current.path.length,path:current.path.map(x=>({...x,to:nodes.find(n=>n.id===x.toId)?.label,from:nodes.find(n=>n.id===x.fromId)?.label}))};
      if(current.path.length>=Math.min(6,Math.max(1,maxHops)))continue;
      for(const next of adj.get(current.id)||[]){
        if(current.visited.has(next.next))continue;
        const visited=new Set(current.visited);visited.add(next.next);
        queue.push({id:next.next,visited,path:[...current.path,{fromId:current.id,toId:next.next,predicate:next.edge.predicate,memoryId:next.edge.memoryId,reviewState:next.edge.reviewState}]});
      }
    }
    return {found:false,hops:null,path:[]};
  });
}
export function graphCommunities({asOf,reviewedOnly=false}={}){
  return withCoreDatabase(db=>{
    const {nodes,edges}=graphSnapshot(db,{asOf,reviewedOnly});
    const adj=new Map(nodes.map(n=>[n.id,new Set()]));
    for(const e of edges){adj.get(e.fromId)?.add(e.toId);adj.get(e.toId)?.add(e.fromId);}
    const seen=new Set(),groups=[];
    for(const node of nodes){
      if(seen.has(node.id))continue;
      const todo=[node.id],members=[];
      seen.add(node.id);
      while(todo.length){
        const id=todo.pop();members.push(id);
        for(const peer of adj.get(id)||[])if(!seen.has(peer)){seen.add(peer);todo.push(peer);}
      }
      groups.push({size:members.length,labels:members.slice(0,12).map(id=>nodes.find(n=>n.id===id)?.label),ids:members});
    }
    return groups.sort((a,b)=>b.size-a.size).slice(0,100);
  });
}
export function graphRecall(query,{limit=10,hops=2,asOf}={}){
  const tokens=new Set(memoryTokens(query));
  return withCoreDatabase(db=>{
    const {nodes,edges}=graphSnapshot(db,{asOf});
    const anchors=nodes.filter(n=>memoryTokens(n.label).some(x=>tokens.has(x)||[...tokens].some(t=>x.startsWith(t)||t.startsWith(x)))).slice(0,15);
    const adj=new Map();
    for(const e of edges)for(const [a,b] of [[e.fromId,e.toId],[e.toId,e.fromId]]){
      if(!adj.has(a))adj.set(a,[]);adj.get(a).push({other:b,edge:e});
    }
    const queue=anchors.map(n=>({id:n.id,depth:0,score:1,path:[]})),seen=new Map();
    const scores=new Map();
    while(queue.length){
      const current=queue.shift();
      if(current.depth>=Math.min(3,Math.max(1,hops)))continue;
      for(const next of adj.get(current.id)||[]){
        const score=current.score*.65*(.4+.6*next.edge.confidence);
        const best=seen.get(next.other)||0;
        if(score<=best)continue;seen.set(next.other,score);
        const prev=scores.get(next.edge.memoryId)||0;
        scores.set(next.edge.memoryId,Math.max(prev,score));
        queue.push({id:next.other,depth:current.depth+1,score,path:[]});
      }
    }
    const output=[];
    const get=db.prepare("SELECT id,content,source_kind AS sourceKind,source_id AS sourceId,verified FROM memory_entries WHERE id=? AND state='active'");
    for(const [id,score] of scores){const row=get.get(id);if(row&&!confidential.test(row.content))output.push({...row,verified:!!row.verified,score:Number(score.toFixed(5)),method:"graph"});}
    return output.sort((a,b)=>b.score-a.score).slice(0,Math.min(50,Math.max(1,limit)));
  });
}
export function graphOverview(){
  return withCoreDatabase(db=>({
    nodes:db.prepare("SELECT COUNT(*) AS n FROM graph_nodes").get().n,
    assertions:db.prepare("SELECT COUNT(*) AS n FROM graph_assertions").get().n,
    pendingConflicts:db.prepare("SELECT COUNT(*) AS n FROM graph_conflicts WHERE review_state='pending'").get().n,
    feedback:db.prepare("SELECT COUNT(*) AS n FROM memory_feedback").get().n,
    events:db.prepare("SELECT COUNT(*) AS n FROM graph_events").get().n
  }));
}
export function recordMemoryFeedback(memoryId,kind){
  if(!["useful","irrelevant","incorrect"].includes(kind))throw Object.assign(new Error("Invalid feedback"),{status:400});
  return withCoreDatabase(db=>{
    if(!db.prepare("SELECT id FROM memory_entries WHERE id=?").get(memoryId))throw Object.assign(new Error("Memory not found"),{status:404});
    const id=randomUUID();
    db.prepare("INSERT INTO memory_feedback(id,memory_id,kind,created_at) VALUES(?,?,?,?)").run(id,memoryId,kind,timestamp());
    return {id,stored:true};
  });
}
