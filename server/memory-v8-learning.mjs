/** CORE v8: source-preserving fusion, experience, semantic overlap diagnostics.
 * All inferred patterns are review-only; original memories stay untouched.
 */
import {randomUUID,createHash} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {memoryTokens,normalizeMemory,confidential} from "./memory-store.mjs";
import {recallMemory} from "./long-memory.mjs";
const stamp=()=>new Date().toISOString();
const hash=x=>createHash("sha256").update(x).digest("hex");
const safe=(x,max=1000)=>{const s=String(x??"").trim();if(!s||s.length>max||confidential.test(s))throw Error("Invalid or sensitive record");return s;};
const tx=fn=>withCoreDatabase(db=>{db.exec("BEGIN IMMEDIATE");try{const r=fn(db);db.exec("COMMIT");return r;}catch(e){db.exec("ROLLBACK");throw e;}});
const overlap=(a,b)=>{const x=new Set(memoryTokens(a)),y=new Set(memoryTokens(b));return x.size&&y.size?[...x].filter(t=>y.has(t)).length/Math.max(x.size,y.size):0;};
export function fusionPreview(query,{limit=16}={}){
  const rows=recallMemory(query,{limit:Math.min(30,Math.max(2,limit))});
  const groups=[];
  for(const item of rows){
    let group=groups.find(g=>g.members.some(other=>overlap(item.content,other.content)>=.65));
    if(!group){group={members:[]};groups.push(group);}
    group.members.push(item);
  }
  return groups.filter(g=>g.members.length>1).map(g=>({
    sourceIds:g.members.map(x=>x.id),count:g.members.length,
    sharedTokens:[...new Set(memoryTokens(g.members[0].content))].filter(t=>g.members.every(m=>memoryTokens(m.content).includes(t))).slice(0,20),
    reviewed:false,method:"lexical-overlap-candidate"
  }));
}
export function storeFusion(memoryIds,{kind="fusion"}={}){
  if(!["fusion","pattern","skill","gap"].includes(kind))throw Error("Invalid fusion kind");
  const ids=[...new Set(memoryIds)].sort();
  if(ids.length<2||ids.length>15)throw Error("Requires two to fifteen source memories");
  return tx(db=>{
    const read=db.prepare("SELECT id,content,source_kind AS sourceKind,source_id AS sourceId FROM memory_entries WHERE id=? AND state='active'");
    const records=ids.map(id=>read.get(id));
    if(records.some(x=>!x||confidential.test(x.content)))throw Error("Missing or sensitive source");
    const fingerprint=hash(kind+":"+ids.join("|"));
    const existing=db.prepare("SELECT id FROM memory_source_fusions WHERE fingerprint=?").get(fingerprint);
    if(existing)return {id:existing.id,stored:false};
    const excerpts=records.map(x=>({memoryId:x.id,sourceKind:x.sourceKind,sourceId:x.sourceId,excerpt:x.content.slice(0,220)}));
    const id=randomUUID(),data=JSON.stringify({method:"extractive-only",kind,excerpts,verified:false});
    db.prepare("INSERT INTO memory_source_fusions(id,fingerprint,kind,content,created_at) VALUES(?,?,?,?,?)").run(id,fingerprint,kind,data,stamp());
    const add=db.prepare("INSERT INTO memory_source_fusion_refs(fusion_id,memory_id) VALUES(?,?)");
    for(const memoryId of ids)add.run(id,memoryId);
    return {id,stored:true,sourceCount:ids.length,verified:false,originalsPreserved:true};
  });
}
export function fusionSources(fusionId){
  return withCoreDatabase(db=>db.prepare("SELECT f.kind,f.review_state AS reviewState,r.memory_id AS memoryId,m.state,m.source_kind AS sourceKind,m.source_id AS sourceId FROM memory_source_fusions f JOIN memory_source_fusion_refs r ON r.fusion_id=f.id JOIN memory_entries m ON m.id=r.memory_id WHERE f.id=? ORDER BY r.memory_id").all(fusionId));
}
export function sourceInterference(query,{limit=25}={}){
  const rows=recallMemory(query,{limit:Math.min(30,Math.max(2,limit))});
  const pairs=[];
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const a=rows[i],b=rows[j],sim=overlap(a.content,b.content);
    if(sim>=.45)pairs.push({a:a.id,b:b.id,overlap:Number(sim.toFixed(3)),
      differentOrigins:a.sourceKind!==b.sourceKind||a.sourceId!==b.sourceId,
      verdict:"possible-interference-not-a-proven-duplicate"});
  }
  return pairs.sort((a,b)=>b.overlap-a.overlap).slice(0,20);
}
export function experiencePatterns({limit=30}={}){
  return withCoreDatabase(db=>{
    const tasks=db.prepare("SELECT t.id,t.title,t.checkpoint,t.outcome,t.status,t.memory_id AS memoryId,m.source_id AS sourceId FROM memory_tasks t JOIN memory_entries m ON m.id=t.memory_id WHERE m.state='active' AND t.status IN ('done','cancelled') ORDER BY t.updated_at DESC LIMIT ?").all(Math.min(200,Math.max(2,limit*4)));
    const groups=new Map();
    for(const task of tasks){
      const signature=memoryTokens(task.title).slice(0,3).sort().join(" ");
      if(!signature)continue;
      if(!groups.has(signature))groups.set(signature,[]);
      groups.get(signature).push(task);
    }
    return [...groups].filter(([,items])=>items.length>=2).slice(0,limit).map(([signature,items])=>({
      signature,attempts:items.length,completed:items.filter(x=>x.status==="done").length,
      failures:items.filter(x=>x.status==="cancelled").length,
      sourceMemoryIds:[...new Set(items.map(x=>x.memoryId))],
      candidate:true,notCausal:true
    }));
  });
}
export function memoryGaps(query){
  const records=recallMemory(query,{limit:12});
  const tokens=memoryTokens(query);
  const present=new Set(records.flatMap(x=>memoryTokens(x.content)));
  const missing=tokens.filter(x=>![...present].some(t=>t.startsWith(x.slice(0,5))||x.startsWith(t.slice(0,5))));
  return {query,sourceCount:records.length,missingTerms:missing,
    questions:missing.slice(0,4).map(t=>"Какие первоисточники содержат проверяемые сведения о «"+t+"»?"),
    status:"candidate-gaps-not-proof-of-absence"};
}
export function decisionOutcome({decisionId,memoryId,outcome}){
  return tx(db=>{
    const decision=db.prepare("SELECT id FROM memory_decisions WHERE id=?").get(decisionId);
    const source=db.prepare("SELECT id FROM memory_entries WHERE id=? AND state='active'").get(memoryId);
    if(!decision||!source)throw Error("Decision and active evidence required");
    const id=randomUUID();
    db.prepare("INSERT INTO memory_v8_decision_outcomes(id,decision_id,memory_id,outcome,created_at) VALUES(?,?,?,?,?)").run(id,decisionId,memoryId,safe(outcome,800),stamp());
    return {id,reviewed:false,sourceMemoryId:memoryId};
  });
}
export function decisionHistory(decisionId){
  return withCoreDatabase(db=>db.prepare("SELECT o.id,o.outcome,o.review_state AS reviewState,o.memory_id AS memoryId,m.source_id AS sourceId,m.state FROM memory_v8_decision_outcomes o JOIN memory_entries m ON m.id=o.memory_id WHERE o.decision_id=? ORDER BY o.created_at").all(decisionId));
}
export function memoryPriority(memoryId,{asOf=Date.now()}={}){
  return withCoreDatabase(db=>{
    const m=db.prepare("SELECT importance,confidence,verified,created_at AS createdAt,state FROM memory_entries WHERE id=?").get(memoryId);
    if(!m)return null;
    const votes=db.prepare("SELECT kind,COUNT(*) AS n FROM memory_feedback WHERE memory_id=? GROUP BY kind").all(memoryId);
    const counts=Object.fromEntries(votes.map(v=>[v.kind,v.n]));
    const age=Math.max(0,(asOf-Date.parse(m.createdAt))/86400000);
    const decay=Math.exp(-Math.LN2*age/365);
    const score=Math.max(0,Math.min(1,.12*m.importance+.2*m.confidence+.15*(m.verified?1:0)+.12*decay+
      .03*Math.min(5,counts.useful||0)-.08*Math.min(5,counts.incorrect||0)));
    return {memoryId,score:Number(score.toFixed(4)),eligible:m.state==="active",
      reason:"ranking-priority-not-factual-truth",decayNonDestructive:true};
  });
}
