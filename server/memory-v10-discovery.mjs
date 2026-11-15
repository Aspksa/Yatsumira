/** CORE v10: bounded, source-anchored background discovery and anomaly review.
 * Produces proposals only. Never writes unverified assertions to graph_assertions.
 */
import {randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
const now=()=>new Date().toISOString();
export function discoverGraphLinks({limit=20,persist=false}={}){
  return withCoreDatabase(db=>{
    const edges=db.prepare("SELECT a.subject_id AS leftId,a.object_id AS rightId,a.memory_id AS memoryId,a.confidence,m.state FROM graph_assertions a JOIN memory_entries m ON m.id=a.memory_id WHERE a.review_state<>'rejected' AND m.state='active' AND (a.valid_to IS NULL OR a.valid_to>?) LIMIT 1200").all(now());
    const adjacency=new Map(),edgeKey=new Set();
    for(const e of edges){
      edgeKey.add([e.leftId,e.rightId].sort().join(":"));
      for(const [a,b] of [[e.leftId,e.rightId],[e.rightId,e.leftId]]){
        if(!adjacency.has(a))adjacency.set(a,[]);
        adjacency.get(a).push({to:b,memoryId:e.memoryId,confidence:e.confidence});
      }
    }
    const proposals=[],seen=new Set();
    for(const [origin,neighbors] of adjacency){
      for(const direct of neighbors){
        for(const second of adjacency.get(direct.to)||[]){
          if(origin===second.to)continue;
          const [a,b]=[origin,second.to].sort();
          const key=a+":"+b;
          if(edgeKey.has(key)||seen.has(key))continue;
          seen.add(key);
          // A concrete source for the *path*, not an assertion of a direct relationship.
          proposals.push({leftId:a,rightId:b,via:direct.to,
            sourceMemoryId:direct.memoryId,secondaryMemoryId:second.memoryId,
            confidence:Math.min(.49,Math.max(0,direct.confidence*second.confidence*.5)),
            verified:false,kind:"link",note:"Two-hop candidate; source evidence does not prove direct link"});
          if(proposals.length>=150)break;
        }
        if(proposals.length>=150)break;
      }
      if(proposals.length>=150)break;
    }
    const selected=proposals.slice(0,Math.min(80,Math.max(1,limit)));
    if(persist){
      // This requires no nested transaction; all writes are idempotent candidates.
      const insert=db.prepare("INSERT OR IGNORE INTO graph_v10_proposals(id,left_id,right_id,source_memory_id,kind,confidence,created_at) VALUES(?,?,?,?,'link',?,?)");
      for(const p of selected)insert.run(randomUUID(),p.leftId,p.rightId,p.sourceMemoryId,p.confidence,now());
    }
    return {candidates:selected,storedAsCandidates:persist};
  });
}
export function graphAnomalyReview({limit=50,persist=false}={}){
  return withCoreDatabase(db=>{
    const cap=Math.min(100,Math.max(1,limit));
    const self=db.prepare("SELECT a.id,a.subject_id AS nodeId,a.memory_id AS memoryId FROM graph_assertions a JOIN memory_entries m ON m.id=a.memory_id WHERE a.subject_id=a.object_id AND m.state='active' LIMIT ?").all(cap);
    const stale=db.prepare("SELECT a.id,a.memory_id AS memoryId FROM graph_assertions a JOIN memory_entries m ON m.id=a.memory_id WHERE m.state<>'active' AND (a.valid_to IS NULL OR a.valid_to>?) LIMIT ?").all(now(),cap);
    const unused=db.prepare("SELECT n.id,n.label FROM graph_nodes n WHERE NOT EXISTS(SELECT 1 FROM graph_assertions a WHERE a.subject_id=n.id OR a.object_id=n.id) AND NOT EXISTS(SELECT 1 FROM memory_hyperedge_nodes x WHERE x.node_id=n.id) LIMIT ?").all(cap);
    const report={selfRelations:self,staleAssertions:stale,isolatedNodes:unused,
      anomaliesNotAutomaticallyErrors:true,fixApplied:false};
    if(persist){
      db.prepare("INSERT INTO memory_v8_metrics(id,metric_type,payload,created_at) VALUES(?,?,?,?)").run(randomUUID(),"v10-graph-anomaly",JSON.stringify({selfRelations:self.length,staleAssertions:stale.length,isolatedNodes:unused.length}),now());
    }
    return report;
  });
}
export function graphDiscoveryStats(){
  return withCoreDatabase(db=>({
    proposed:db.prepare("SELECT COUNT(*) AS n FROM graph_v10_proposals WHERE state='candidate'").get().n,
    merged:db.prepare("SELECT COUNT(*) AS n FROM graph_v10_identity WHERE state='merged'").get().n,
    split:db.prepare("SELECT COUNT(*) AS n FROM graph_v10_identity WHERE state='split'").get().n,
    causalCandidates:db.prepare("SELECT COUNT(*) AS n FROM graph_v10_causal WHERE state='candidate'").get().n
  }));
}

/** Find structural bridges: nodes connected to several distinct first-neighbor regions.
 * This is degree/neighborhood coverage, not a proof of cross-domain semantic transfer.
 */
export function knowledgeBridges({limit=20}={}){
  return withCoreDatabase(db=>{
    const edges=db.prepare("SELECT a.subject_id AS fromId,a.object_id AS toId,a.memory_id AS memoryId FROM graph_assertions a JOIN memory_entries m ON m.id=a.memory_id WHERE m.state='active' AND a.review_state<>'rejected' AND (a.valid_to IS NULL OR a.valid_to>?) LIMIT 1800").all(now());
    const adj=new Map(),evidence=new Map();
    for(const edge of edges){
      for(const [a,b] of [[edge.fromId,edge.toId],[edge.toId,edge.fromId]]){
        if(!adj.has(a))adj.set(a,new Set());
        adj.get(a).add(b);
        if(!evidence.has(a))evidence.set(a,new Set());
        evidence.get(a).add(edge.memoryId);
      }
    }
    const lookup=db.prepare("SELECT id,label,node_type AS type FROM graph_nodes WHERE id=?");
    const results=[];
    for(const [id,neighbors] of adj){
      if(neighbors.size<2)continue;
      const node=lookup.get(id);
      const types=new Set([...neighbors].map(n=>lookup.get(n)?.type).filter(Boolean));
      if(types.size<2)continue;
      results.push({nodeId:id,label:node.label,neighborCount:neighbors.size,neighborTypes:[...types].sort(),
        sourceMemoryIds:[...evidence.get(id)].slice(0,30),
        verified:false,note:"Structural bridge candidate"});
    }
    return results.sort((a,b)=>b.neighborTypes.length-a.neighborTypes.length||b.neighborCount-a.neighborCount)
      .slice(0,Math.max(1,Math.min(50,limit)));
  });
}
