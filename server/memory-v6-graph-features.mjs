/**
 * CORE v6 experimental graph features. Pure deterministic structural descriptors
 * and review-only link predictions; no trained GNN is claimed or silently loaded.
 */
import {withCoreDatabase} from "./core-db.mjs";
import {normalizeMemory,memoryTokens} from "./memory-store.mjs";
function snapshot(db){
  const nodes=db.prepare("SELECT id,label,node_type AS type FROM graph_nodes").all();
  const edges=db.prepare("SELECT a.subject_id AS s,a.object_id AS o,a.predicate,a.confidence,a.review_state AS reviewState,a.memory_id AS memoryId FROM graph_assertions a JOIN memory_entries m ON m.id=a.memory_id WHERE a.review_state<>'rejected' AND (a.valid_to IS NULL OR a.valid_to>?) AND m.state='active'").all(new Date().toISOString());
  return {nodes,edges};
}
function adjacency({nodes,edges}){
  const map=new Map(nodes.map(n=>[n.id,new Map()]));
  for(const e of edges){
    if(!map.has(e.s)||!map.has(e.o))continue;
    const weight=Math.max(.01,Math.min(1,e.confidence))*(e.reviewState==="reviewed"?1:.65);
    map.get(e.s).set(e.o,(map.get(e.s).get(e.o)||0)+weight);
    map.get(e.o).set(e.s,(map.get(e.o).get(e.s)||0)+weight);
  }
  return map;
}
/** Two iterations of normalized neighborhood aggregation: a GNN-compatible
 * feature pipeline, NOT a trained GNN or an autonomous factual inference. */
export function structuralGraphFeatures({rounds=2}={}){
  return withCoreDatabase(db=>{
    const data=snapshot(db),adj=adjacency(data);
    if(data.nodes.length>3000)throw Object.assign(new Error("Graph feature job limit exceeded"),{status:413});
    let features=new Map(data.nodes.map(n=>[n.id,[
      Math.log1p(adj.get(n.id).size),Math.min(1,n.label.length/80),
      n.type==="unknown"?0:1,1
    ]]));
    for(let i=0;i<Math.max(1,Math.min(3,rounds));i++){
      const next=new Map();
      for(const n of data.nodes){
        const current=features.get(n.id),peers=adj.get(n.id);
        const total=[0,0,0,0];let weight=0;
        for(const [other,w] of peers){
          const f=features.get(other);
          if(!f)continue;
          for(let j=0;j<4;j++)total[j]+=f[j]*w;
          weight+=w;
        }
        const updated=current.map((x,j)=>.6*x+.4*(weight?total[j]/weight:x));
        next.set(n.id,updated.map(x=>Number(x.toFixed(5))));
      }
      features=next;
    }
    return data.nodes.map(n=>({id:n.id,label:n.label,type:n.type,vector:features.get(n.id),degree:adj.get(n.id).size}));
  });
}
/** Common-neighbor candidates only, never new asserted edges. */
export function suggestMissingGraphLinks({limit=20}={}){
  const nodes=structuralGraphFeatures();
  return withCoreDatabase(db=>{
    const edges= snapshot(db).edges,neighbors=new Map(nodes.map(n=>[n.id,new Set()]));
    for(const e of edges){neighbors.get(e.s)?.add(e.o);neighbors.get(e.o)?.add(e.s);}
    const suggestions=[];
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j],aa=neighbors.get(a.id),bb=neighbors.get(b.id);
      if(aa.has(b.id))continue;
      const shared=[...aa].filter(id=>bb.has(id));
      if(shared.length<2)continue;
      const score=shared.length/Math.sqrt(Math.max(1,aa.size*bb.size));
      suggestions.push({from:a.label,to:b.label,commonNeighbors:shared.length,
        score:Number(score.toFixed(4)),reviewState:"candidate",verified:false});
    }
    return suggestions.sort((a,b)=>b.score-a.score).slice(0,Math.min(100,Math.max(1,limit)));
  });
}
/** Communities of communities, descriptive only; no false hierarchy claims. */
export function graphOfCommunities({limit=30}={}){
  return withCoreDatabase(db=>{
    const data=snapshot(db),adj=adjacency(data);
    const seen=new Set(),groups=[];
    for(const node of data.nodes){
      if(seen.has(node.id))continue;
      const queue=[node.id],ids=[];seen.add(node.id);
      while(queue.length){
        const id=queue.shift();ids.push(id);
        for(const other of adj.get(id).keys())if(!seen.has(other)){seen.add(other);queue.push(other);}
      }
      groups.push({id:"community-"+groups.length,size:ids.length,members:ids});
    }
    // Components are disjoint by definition. Cross-community links are proposals,
    // based only on lexical similarity between labels; never actual graph facts.
    const proposals=[];
    for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
      const a=new Set(groups[i].members.flatMap(id=>memoryTokens(data.nodes.find(n=>n.id===id)?.label)));
      const b=new Set(groups[j].members.flatMap(id=>memoryTokens(data.nodes.find(n=>n.id===id)?.label)));
      const shared=[...a].filter(x=>b.has(x));
      if(shared.length)proposals.push({a:groups[i].id,b:groups[j].id,sharedTokens:shared.length,asserted:false});
    }
    return {communities:groups.sort((a,b)=>b.size-a.size).slice(0,limit),proposedBridges:proposals.slice(0,30)};
  });
}
/** Keep separate known causal edges and candidate causal edges. */
export function causalGraph({reviewedOnly=true,limit=100}={}){
  return withCoreDatabase(db=>db.prepare("SELECT a.id,s.label AS effect,o.label AS cause,a.predicate,a.memory_id AS memoryId,a.review_state AS reviewState FROM graph_assertions a JOIN graph_nodes s ON s.id=a.subject_id JOIN graph_nodes o ON o.id=a.object_id JOIN memory_entries m ON m.id=a.memory_id WHERE a.predicate IN ('caused_by','because_of','leads_to','depends_on') AND a.review_state<>'rejected' AND (?=0 OR a.review_state='reviewed') AND m.state='active' ORDER BY a.created_at DESC LIMIT ?")
    .all(reviewedOnly?1:0,Math.max(1,Math.min(200,limit))));
}
