/** CORE v7: domain-agnostic graph analytics on source-backed, time-valid edges. */
import {withCoreDatabase} from "./core-db.mjs";
import {normalizeMemory,memoryTokens} from "./memory-store.mjs";
const atDate=s=>{const t=Date.parse(s||new Date().toISOString());if(!Number.isFinite(t))throw Error("Invalid date");return new Date(t).toISOString();};
function snapshot(db,asOf){
  const stamp=atDate(asOf);
  const nodes=db.prepare("SELECT id,label,node_type AS type FROM graph_nodes").all();
  const edges=db.prepare("SELECT a.id,a.subject_id AS fromId,a.object_id AS toId,a.predicate,a.memory_id AS memoryId,a.confidence,a.review_state AS reviewState,a.valid_from AS validFrom,a.valid_to AS validTo FROM graph_assertions a JOIN memory_entries m ON m.id=a.memory_id WHERE a.review_state<>'rejected' AND a.valid_from<=? AND (a.valid_to IS NULL OR a.valid_to>?) AND (m.state='active' OR m.valid_to>?)").all(stamp,stamp,stamp);
  return {nodes,edges,asOf:stamp};
}
export function temporalGraph({asOf,limit=100}={}){
  return withCoreDatabase(db=>{
    const graph=snapshot(db,asOf);
    return {...graph,edges:graph.edges.slice(0,Math.max(1,Math.min(300,limit))),evidenceRequired:true};
  });
}
export function hierarchicalClusters({asOf,maxRounds=5}={}){
  return withCoreDatabase(db=>{
    const {nodes,edges}=snapshot(db,asOf);
    const adj=new Map(nodes.map(n=>[n.id,new Map()]));
    for(const e of edges){const w=Math.max(.01,e.confidence)*(e.reviewState==="reviewed"?1:.55);adj.get(e.fromId)?.set(e.toId,w);adj.get(e.toId)?.set(e.fromId,w);}
    let labels=new Map(nodes.map(n=>[n.id,n.id]));
    for(let round=0;round<Math.max(1,Math.min(10,maxRounds));round++){
      const next=new Map(labels);
      for(const node of [...nodes].sort((a,b)=>a.id.localeCompare(b.id))){
        const weights=new Map([[labels.get(node.id),.01]]);
        for(const [neighbor,w] of adj.get(node.id))weights.set(labels.get(neighbor),(weights.get(labels.get(neighbor))||0)+w);
        const best=[...weights].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
        next.set(node.id,best[0]);
      }
      if([...labels].every(([id,label])=>next.get(id)===label))break;
      labels=next;
    }
    const groups=new Map();
    for(const n of nodes){const key=labels.get(n.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);}
    const communities=[...groups].map(([id,members])=>({id,memberIds:members.map(x=>x.id),labels:members.map(x=>x.label),size:members.length}))
      .sort((a,b)=>b.size-a.size||a.id.localeCompare(b.id));
    const byNode=new Map(nodes.map(n=>[n.id,labels.get(n.id)]));
    const bridges=edges.filter(e=>byNode.get(e.fromId)!==byNode.get(e.toId))
      .map(e=>({fromCommunity:byNode.get(e.fromId),toCommunity:byNode.get(e.toId),memoryId:e.memoryId,assertionId:e.id}));
    return {communities,bridges,algorithm:"deterministic-weighted-label-propagation",notLouvain:true,asOf:atDate(asOf)};
  });
}
export function temporalContradictions({asOf,limit=40}={}){
  return withCoreDatabase(db=>{
    const {edges,nodes}=snapshot(db,asOf);
    const name=new Map(nodes.map(x=>[x.id,x.label])),groups=new Map();
    for(const e of edges){
      const key=e.fromId+"|"+e.predicate;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(e);
    }
    const result=[];
    for(const group of groups.values()){
      const objects=new Set(group.map(x=>x.toId));
      if(objects.size<2)continue;
      // No cardinality declaration means only an ambiguous-value candidate.
      result.push({subject:name.get(group[0].fromId),predicate:group[0].predicate,
        values:[...objects].map(x=>name.get(x)),sourceIds:group.map(x=>x.memoryId),
        status:"potential-ambiguity",confirmedConflict:false});
    }
    return result.slice(0,Math.min(100,limit));
  });
}
export function rankGraphPaths(fromLabel,toLabel,{asOf,maxHops=4,limit=5}={}){
  const from=normalizeMemory(fromLabel),to=normalizeMemory(toLabel),hops=Math.min(6,Math.max(1,maxHops));
  return withCoreDatabase(db=>{
    const {nodes,edges}=snapshot(db,asOf),labels=new Map(nodes.map(n=>[n.id,n.label]));
    const start=nodes.filter(n=>normalizeMemory(n.label)===from).map(n=>n.id);
    const dest=new Set(nodes.filter(n=>normalizeMemory(n.label)===to).map(n=>n.id));
    const adj=new Map(nodes.map(n=>[n.id,[]]));
    for(const e of edges){adj.get(e.fromId).push({to:e.toId,e});adj.get(e.toId).push({to:e.fromId,e});}
    const queue=start.map(id=>({id,visited:new Set([id]),path:[],score:1})),found=[];
    while(queue.length&&found.length<100){
      const cur=queue.shift();
      if(dest.has(cur.id)&&cur.path.length){found.push(cur);continue;}
      if(cur.path.length>=hops)continue;
      for(const next of adj.get(cur.id)||[]){
        if(cur.visited.has(next.to))continue;
        const visited=new Set(cur.visited);visited.add(next.to);
        const weight=Math.max(.02,next.e.confidence)*(next.e.reviewState==="reviewed"?1:.6);
        queue.push({id:next.to,visited,path:[...cur.path,{from:labels.get(cur.id),to:labels.get(next.to),relation:next.e.predicate,memoryId:next.e.memoryId,reviewState:next.e.reviewState}],score:cur.score*weight*.92});
      }
      if(queue.length>4000)queue.length=4000;
    }
    return found.sort((a,b)=>b.score-a.score||a.path.length-b.path.length).slice(0,Math.min(20,limit))
      .map(x=>({score:Number(x.score.toFixed(6)),steps:x.path,verified:x.path.every(s=>s.reviewState==="reviewed")}));
  });
}
export function graphRepairPlan(){
  return withCoreDatabase(db=>{
    const integrity=db.prepare("PRAGMA integrity_check").get().integrity_check;
    const foreignKeys=db.prepare("PRAGMA foreign_key_check").all();
    const sourceCount=db.prepare("SELECT COUNT(*) AS n FROM graph_assertions a LEFT JOIN memory_entries m ON m.id=a.memory_id WHERE m.id IS NULL").get().n;
    return {healthy:integrity==="ok"&&!foreignKeys.length&&!sourceCount,
      integrity,foreignKeyErrors:foreignKeys.length,orphanAssertions:sourceCount,
      repair:"Rebuild only derived graph indexes from original active memory in a verified backup; never overwrite sources automatically"};
  });
}
