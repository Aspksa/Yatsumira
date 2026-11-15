/** CORE v10 graph identity and ontology: reversible, source-backed mappings.
 * Merging never deletes or rewires original nodes, so split is lossless.
 */
import {randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {normalizeMemory,confidential,memoryTokens} from "./memory-store.mjs";
const now=()=>new Date().toISOString();
const safe=(x,max=500)=>{const s=String(x??"").trim();if(!s||s.length>max||confidential.test(s))throw Error("Invalid or sensitive input");return s;};
const tx=fn=>withCoreDatabase(db=>{db.exec("BEGIN IMMEDIATE");try{const r=fn(db);db.exec("COMMIT");return r;}catch(e){db.exec("ROLLBACK");throw e;}});
const active=(db,id)=>{if(!db.prepare("SELECT id FROM memory_entries WHERE id=? AND state='active'").get(id))throw Error("Active source required");};
const node=(db,id)=>{const row=db.prepare("SELECT id,node_type AS type,label FROM graph_nodes WHERE id=?").get(id);if(!row)throw Error("Node not found");return row;};
export function proposeGraphType({name,parentName,memoryId}){
  const type=safe(name,50).toLowerCase().replace(/\s+/gu,"_");
  if(!/^[\p{L}\p{N}_-]+$/u.test(type))throw Error("Invalid graph type");
  return tx(db=>{
    active(db,memoryId);
    const prior=db.prepare("SELECT id,state FROM graph_v10_type_proposals WHERE name=?").get(type);
    if(prior)return {id:prior.id,stored:false,state:prior.state};
    const id=randomUUID();
    db.prepare("INSERT INTO graph_v10_type_proposals(id,name,parent_name,source_memory_id,created_at) VALUES(?,?,?,?,?)")
      .run(id,type,parentName?safe(parentName,50):null,memoryId,now());
    return {id,stored:true,state:"candidate"};
  });
}
export function reviewGraphType(id,{approved,evidence}){
  safe(evidence,500);
  if(typeof approved!=="boolean")throw Error("Review decision required");
  return tx(db=>{
    const row=db.prepare("SELECT name,parent_name,state FROM graph_v10_type_proposals WHERE id=?").get(id);
    if(!row||row.state!=="candidate")throw Error("Type not pending");
    const state=approved?"reviewed":"rejected";
    if(approved){
      if(row.parent_name&&!db.prepare("SELECT type_name FROM memory_ontology_types WHERE type_name=? AND state='reviewed'").get(row.parent_name))throw Error("Parent must be reviewed");
      db.prepare("INSERT OR IGNORE INTO memory_ontology_types(type_name,parent_type,state,created_at) VALUES(?,?,'reviewed',?)").run(row.name,row.parent_name,now());
      db.prepare("UPDATE memory_ontology_types SET state='reviewed' WHERE type_name=?").run(row.name);
    }
    db.prepare("UPDATE graph_v10_type_proposals SET state=? WHERE id=?").run(state,id);
    db.prepare("INSERT INTO core_events(id,event_type,payload,created_at) VALUES(?,?,?,?)")
      .run(randomUUID(),"v10.type_review",JSON.stringify({id,state,evidence}),now());
    return {id,state};
  });
}
export function proposeIdentity({canonicalId,aliasId,memoryId,evidence}){
  if(canonicalId===aliasId)throw Error("Identical nodes");
  return tx(db=>{
    active(db,memoryId);const left=node(db,canonicalId),right=node(db,aliasId);
    if(left.type!==right.type&&left.type!=="unknown"&&right.type!=="unknown")throw Error("Conflicting node types");
    const detail=safe(evidence,500);
    const previous=db.prepare("SELECT id,state FROM graph_v10_identity WHERE canonical_id=? AND alias_id=? AND source_memory_id=?").get(canonicalId,aliasId,memoryId);
    if(previous)return {id:previous.id,stored:false,state:previous.state};
    const id=randomUUID();
    db.prepare("INSERT INTO graph_v10_identity(id,canonical_id,alias_id,source_memory_id,state,evidence,created_at,updated_at) VALUES(?,?,?,?,'proposed',?,?,?)")
      .run(id,canonicalId,aliasId,memoryId,detail,now(),now());
    return {id,stored:true,state:"proposed"};
  });
}
export function mergeIdentity(id,{evidence}){
  return tx(db=>{
    const row=db.prepare("SELECT * FROM graph_v10_identity WHERE id=?").get(id);
    if(!row||row.state!=="proposed")throw Error("Identity proposal not pending");
    active(db,row.source_memory_id);
    safe(evidence,500);
    const current=db.prepare("SELECT canonical_id FROM graph_v10_identity WHERE alias_id=? AND state='merged'").get(row.alias_id);
    if(current&&current.canonical_id!==row.canonical_id)throw Error("Conflicting canonical identity");
    const reverse=db.prepare("SELECT 1 AS n FROM graph_v10_identity WHERE alias_id=? AND canonical_id=? AND state='merged'").get(row.canonical_id,row.alias_id);
    if(reverse)throw Error("Identity cycle");
    db.prepare("UPDATE graph_v10_identity SET state='merged',updated_at=? WHERE id=?").run(now(),id);
    db.prepare("INSERT INTO core_events(id,event_type,payload,created_at) VALUES(?,?,?,?)").run(randomUUID(),"v10.identity_merge",JSON.stringify({id,evidence}),now());
    return {id,state:"merged",originalNodesPreserved:true};
  });
}
export function splitIdentity(id,{evidence}){
  return tx(db=>{
    const row=db.prepare("SELECT state FROM graph_v10_identity WHERE id=?").get(id);
    if(!row||row.state!=="merged")throw Error("No active identity mapping");
    safe(evidence,500);
    db.prepare("UPDATE graph_v10_identity SET state='split',updated_at=? WHERE id=?").run(now(),id);
    db.prepare("INSERT INTO core_events(id,event_type,payload,created_at) VALUES(?,?,?,?)").run(randomUUID(),"v10.identity_split",JSON.stringify({id,evidence}),now());
    return {id,state:"split",originalNodesPreserved:true};
  });
}
export function resolveIdentity(nodeId){
  return withCoreDatabase(db=>{
    node(db,nodeId);
    const path=[nodeId],seen=new Set(path);
    let cursor=nodeId;
    for(let i=0;i<32;i++){
      const rows=db.prepare("SELECT i.canonical_id AS target FROM graph_v10_identity i JOIN memory_entries m ON m.id=i.source_memory_id WHERE i.alias_id=? AND i.state='merged' AND m.state='active' ORDER BY i.created_at DESC").all(cursor);
      if(rows.length===0)break;
      if(new Set(rows.map(x=>x.target)).size!==1)throw Error("Ambiguous identity");
      cursor=rows[0].target;
      if(seen.has(cursor))throw Error("Identity cycle detected");
      path.push(cursor);seen.add(cursor);
    }
    return {canonicalId:cursor,path,merged:path.length>1};
  });
}
export function identityCandidates({limit=20}={}){
  return withCoreDatabase(db=>{
    const nodes=db.prepare("SELECT id,label,node_type AS type FROM graph_nodes ORDER BY created_at DESC LIMIT 500").all();
    const candidates=[];
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j];
      if(a.type!==b.type||a.type==="unknown")continue;
      const ta=new Set(memoryTokens(a.label)),tb=new Set(memoryTokens(b.label));
      const shared=[...ta].filter(x=>tb.has(x)).length/Math.max(1,Math.max(ta.size,tb.size));
      if(shared>=.5)candidates.push({leftId:a.id,rightId:b.id,similarity:shared,verified:false});
    }
    return candidates.sort((a,b)=>b.similarity-a.similarity).slice(0,Math.min(50,Math.max(1,limit)));
  });
}
