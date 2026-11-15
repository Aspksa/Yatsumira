/**
 * CORE v5: graph analytics and evidence-aware retrieval.
 * Weighted propagation is a bounded deterministic graph walk, not hidden reasoning.
 */
import {withCoreDatabase} from "./core-db.mjs";
import {memoryTokens,normalizeMemory,confidential} from "./memory-store.mjs";
import {recallMemory} from "./long-memory.mjs";
import {graphRecall} from "./universal-memory-graph.mjs";
const clamp=(value,lo=0,hi=1)=>Math.max(lo,Math.min(hi,value));
const asDate=value=>{
  const parsed=Date.parse(value||new Date().toISOString());
  if(!Number.isFinite(parsed))throw Object.assign(new Error("Invalid graph date"),{status:400});
  return new Date(parsed).toISOString();
};
function snapshot(db,at){
  const nodes=db.prepare("SELECT id,label,node_type AS type FROM graph_nodes").all();
  const edges=db.prepare("SELECT a.subject_id AS fromId,a.object_id AS toId,a.memory_id AS memoryId,a.confidence,a.review_state AS reviewState,a.predicate FROM graph_assertions a JOIN memory_entries m ON m.id=a.memory_id WHERE a.review_state<>'rejected' AND a.valid_from<=? AND (a.valid_to IS NULL OR a.valid_to>?) AND (m.state='active' OR m.valid_to>?)").all(at,at,at);
  return {nodes,edges};
}
export function personalizedGraphRank(query,{asOf,maxIterations=24,limit=15}={}){
  const at=asDate(asOf),terms=memoryTokens(query);
  return withCoreDatabase(db=>{
    const {nodes,edges}=snapshot(db,at);
    if(!nodes.length||!terms.length)return [];
    const eligible=nodes.filter(n=>memoryTokens(n.label).some(word=>terms.some(term=>word.startsWith(term)||term.startsWith(word))));
    if(!eligible.length)return [];
    const index=new Map(nodes.map((n,i)=>[n.id,i])),n=nodes.length;
    const adjacency=Array.from({length:n},()=>new Map());
    for(const e of edges){
      const a=index.get(e.fromId),b=index.get(e.toId);
      if(a===undefined||b===undefined)continue;
      const confidence=clamp(e.confidence);
      const weight=Math.max(.01,confidence*(e.reviewState==="reviewed"?1:.55));
      adjacency[a].set(b,(adjacency[a].get(b)||0)+weight);
      adjacency[b].set(a,(adjacency[b].get(a)||0)+weight);
    }
    let restart=new Array(n).fill(0);
    for(const item of eligible)restart[index.get(item.id)]=1/eligible.length;
    let scores=[...restart];
    for(let i=0;i<Math.min(50,Math.max(1,maxIterations));i++){
      const next=restart.map(value=>value*.22);
      for(let j=0;j<n;j++){
        const peers=adjacency[j],degree=[...peers.values()].reduce((a,b)=>a+b,0);
        if(!degree){next[j]+=.78*scores[j];continue;}
        for(const [target,w] of peers)next[target]+=.78*scores[j]*w/degree;
      }
      scores=next;
    }
    const memoryScores=new Map();
    for(const e of edges){
      const a=index.get(e.fromId),b=index.get(e.toId);
      if(a===undefined||b===undefined)continue;
      const score=(scores[a]+scores[b])*(e.reviewState==="reviewed"?1:.65);
      memoryScores.set(e.memoryId,(memoryScores.get(e.memoryId)||0)+score);
    }
    const get=db.prepare("SELECT id,content,source_kind AS sourceKind,source_id AS sourceId,confidence,verified FROM memory_entries WHERE id=? AND state='active'");
    return [...memoryScores].map(([id,score])=>({row:get.get(id),score}))
      .filter(({row})=>row&&!confidential.test(row.content))
      .sort((a,b)=>b.score-a.score)
      .slice(0,Math.max(1,Math.min(50,Number(limit)||15)))
      .map(({row,score})=>({...row,verified:!!row.verified,score:Number(score.toFixed(6)),method:"personalized-graph-rank"}));
  });
}
export function topicCommunities({minSize=2}={}){
  return withCoreDatabase(db=>{
    const {nodes,edges}=snapshot(db,asDate());
    const neighbors=new Map(nodes.map(n=>[n.id,new Set()]));
    for(const e of edges){neighbors.get(e.fromId)?.add(e.toId);neighbors.get(e.toId)?.add(e.fromId);}
    const visited=new Set(),groups=[];
    for(const n of nodes){
      if(visited.has(n.id))continue;
      const pending=[n.id],members=[];visited.add(n.id);
      while(pending.length){
        const id=pending.pop();members.push(id);
        for(const peer of neighbors.get(id)||[])if(!visited.has(peer)){visited.add(peer);pending.push(peer);}
      }
      if(members.length>=minSize)groups.push({ids:members,size:members.length,labels:members.slice(0,15).map(id=>nodes.find(x=>x.id===id)?.label)});
    }
    return groups.sort((a,b)=>b.size-a.size);
  });
}
export function recallWithStrategy(query,{limit=8}={}){
  const local=recallMemory(query,{limit:Math.max(10,limit*2)});
  const graph=graphRecall(query,{limit:Math.max(10,limit*2),hops:3});
  const rank=personalizedGraphRank(query,{limit:Math.max(10,limit*2)});
  const merged=new Map();
  for(const [items,weight] of [[local,1],[graph,.8],[rank,.95]]){
    items.forEach((item,index)=>{
      const current=merged.get(item.id)||{...item,score:0,evidence:new Set()};
      current.score+=weight/(60+index+1);
      current.evidence.add(item.method||"lexical");
      merged.set(item.id,current);
    });
  }
  return [...merged.values()].sort((a,b)=>b.score-a.score).slice(0,Math.max(1,Math.min(30,limit))).map(item=>({...item,score:Number(item.score.toFixed(6)),evidence:[...item.evidence]}));
}
export function auditAnswerEvidence(answer,evidence){
  const text=String(answer||"").trim();
  const sources=Array.isArray(evidence)?evidence.filter(x=>typeof x?.content==="string"&&!confidential.test(x.content)):[];
  if(!text)return {supported:false,reason:"empty-answer",coverage:0,missing:[]};
  if(!sources.length)return {supported:false,reason:"no-evidence",coverage:0,missing:memoryTokens(text).slice(0,12)};
  const tokens=memoryTokens(text).filter(x=>x.length>=4);
  const words=new Set(sources.flatMap(x=>memoryTokens(x.content)));
  const matches=tokens.filter(w=>words.has(w)||[...words].some(t=>t.startsWith(w.slice(0,5))||w.startsWith(t.slice(0,5))));
  const coverage=tokens.length?matches.length/tokens.length:0;
  // Lexical coverage is a diagnostic, NEVER a proof that a claim is true.
  return {supported:false,reason:"lexical-overlap-only",coverage:Number(coverage.toFixed(3)),
    missing:tokens.filter(x=>!matches.includes(x)).slice(0,12),sourceIds:sources.map(x=>x.id).filter(Boolean)};
}
export function checkRetrievalCompleteness(query,results,{minResults=2}={}){
  const values=Array.isArray(results)?results:[];
  const tokens=memoryTokens(query);
  const represented=new Set(values.flatMap(r=>memoryTokens(r.content||"")));
  const gaps=tokens.filter(x=>![...represented].some(w=>w.startsWith(x.slice(0,5))||x.startsWith(w.slice(0,5))));
  return {complete:values.length>=Math.max(1,minResults)&&gaps.length===0,
    retrieved:values.length,uncoveredTerms:gaps,shouldRetry:values.length===0||gaps.length>0};
}
export function hypotheticalCausalLinks(text){
  // Only explicitly stated causal language, and always an unverified candidate.
  const match=String(text||"").match(/(.{4,140}?)\s+(?:потому\s+что|because)\s+(.{4,140}?)(?:[.!?]|$)/iu);
  return match?[{effect:match[1].trim(),cause:match[2].trim(),confidence:.35,reviewState:"candidate"}]:[];
}
export function graphQuality(){
  return withCoreDatabase(db=>{
    const nodes=db.prepare("SELECT COUNT(*) AS n FROM graph_nodes").get().n;
    const edges=db.prepare("SELECT COUNT(*) AS n FROM graph_assertions").get().n;
    const unsourced=db.prepare("SELECT COUNT(*) AS n FROM graph_assertions a LEFT JOIN memory_entries m ON m.id=a.memory_id WHERE m.id IS NULL").get().n;
    const pending=db.prepare("SELECT COUNT(*) AS n FROM graph_conflicts WHERE review_state='pending'").get().n;
    const orphan=db.prepare("SELECT COUNT(*) AS n FROM graph_nodes n WHERE NOT EXISTS(SELECT 1 FROM graph_assertions a WHERE a.subject_id=n.id OR a.object_id=n.id) AND NOT EXISTS(SELECT 1 FROM memory_hyperedge_nodes h WHERE h.node_id=n.id)").get().n;
    return {nodes,edges,unsourced,pendingConflicts:pending,orphanNodes:orphan,sourceCoverage:edges?Number(((edges-unsourced)/edges).toFixed(4)):1};
  });
}
