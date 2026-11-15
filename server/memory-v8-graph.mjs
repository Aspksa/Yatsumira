/** CORE v8 graph pattern analysis; structural candidates, not automatically true claims. */
import {createHash,randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {temporalGraph,rankGraphPaths,temporalContradictions} from "./memory-v7-graph.mjs";
import {structuralGraphFeatures,suggestMissingGraphLinks} from "./memory-v6-graph-features.mjs";
import {memoryTokens} from "./memory-store.mjs";
const digest=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
function graph(asOf){const g=temporalGraph({asOf,limit:300});return g;}
export function graphMotifs({asOf,limit=30}={}){
  const {nodes,edges}=graph(asOf);
  const adj=new Map(nodes.map(x=>[x.id,new Set()]));
  for(const e of edges){adj.get(e.fromId)?.add(e.toId);adj.get(e.toId)?.add(e.fromId);}
  const motifs=[];
  for(const node of nodes){
    const peers=[...adj.get(node.id)];
    if(peers.length<2)continue;
    let triangles=0;
    for(let i=0;i<peers.length;i++)for(let j=i+1;j<peers.length;j++){
      if(adj.get(peers[i])?.has(peers[j]))triangles++;
    }
    motifs.push({nodeId:node.id,label:node.label,degree:peers.length,triangles,
      wedges:peers.length*(peers.length-1)/2-triangles,
      candidatePattern:true});
  }
  return motifs.sort((a,b)=>b.triangles-a.triangles||b.degree-a.degree).slice(0,Math.min(100,limit));
}
export function hypergraphPatterns({limit=30}={}){
  return withCoreDatabase(db=>{
    const rows=db.prepare("SELECT h.id,h.relation_type AS relation,h.source_memory_id AS memoryId,h.confidence,COUNT(x.node_id) AS participants FROM memory_hyperedges h JOIN memory_hyperedge_nodes x ON x.hyperedge_id=h.id JOIN memory_entries m ON m.id=h.source_memory_id WHERE m.state='active' GROUP BY h.id ORDER BY participants DESC LIMIT ?").all(Math.min(100,limit));
    const totals=new Map();
    for(const row of rows){const k=row.relation;totals.set(k,(totals.get(k)||0)+1);}
    return {hyperedges:rows,relationPatterns:[...totals].map(([relation,count])=>({relation,count})),note:"statistics-not-semantic-inference"};
  });
}
export function timeGraphEvolution(before,after){
  const a=graph(before),b=graph(after);
  const left=new Map(a.edges.map(e=>[e.id,e])),right=new Map(b.edges.map(e=>[e.id,e]));
  return {before:a.asOf,after:b.asOf,added:[...right.values()].filter(x=>!left.has(x.id)),
    expired:[...left.values()].filter(x=>!right.has(x.id)),
    nodeCountBefore:a.nodes.length,nodeCountAfter:b.nodes.length,
    status:"date-bounded-assertion-changes"};
}
export function proposedGraphLinks({limit=20}={}){
  return suggestMissingGraphLinks({limit}).map(x=>({...x,claimStatus:"unverified",requiresReview:true}));
}
export function graphEmbeddingCandidates({limit=80}={}){
  const features=structuralGraphFeatures({rounds:2}).slice(0,Math.max(1,Math.min(120,limit)));
  const similarity=(a,b)=>{
    const dot=a.reduce((v,x,i)=>v+x*b[i],0);
    const n1=Math.hypot(...a),n2=Math.hypot(...b);
    return n1&&n2?dot/(n1*n2):0;
  };
  return features.map(x=>({...x,representation:"structural-not-neural-embedding",
    neighbors:features.filter(y=>y.id!==x.id).map(y=>({nodeId:y.id,label:y.label,score:Number(similarity(x.vector,y.vector).toFixed(4))}))
      .sort((a,b)=>b.score-a.score).slice(0,3)}));
}
export function graphConflictsAndImpact({asOf,limit=30}={}){
  const conflicts=temporalContradictions({asOf,limit});
  const graphNow=graph(asOf),neighbors=new Map(graphNow.nodes.map(n=>[n.id,new Set()]));
  for(const e of graphNow.edges){neighbors.get(e.fromId)?.add(e.toId);neighbors.get(e.toId)?.add(e.fromId);}
  return {candidates:conflicts.map(c=>{
    const subjects=graphNow.nodes.filter(n=>n.label===c.subject);
    const direct=[...new Set(subjects.flatMap(s=>[...(neighbors.get(s.id)||[])]))];
    return {...c,affectedNodeIds:direct.slice(0,30),risk:"candidate-only",verified:false};
  }),note:"Multi-valued properties are not automatically contradictions"};
}
export function evidenceGraphPath(from,to,{asOf,maxHops=4}={}){
  const paths=rankGraphPaths(from,to,{asOf,maxHops,limit:8});
  return paths.map(p=>({...p,scoreType:"path-weight-not-truth",
    sourceMemoryIds:[...new Set(p.steps.map(x=>x.memoryId))]}));
}
export function recordGraphSnapshot({asOf}={}){
  const g=graph(asOf),checksum=digest(g.edges.map(e=>({id:e.id,from:e.fromId,to:e.toId,validFrom:e.validFrom,validTo:e.validTo})).sort((a,b)=>a.id.localeCompare(b.id)));
  return withCoreDatabase(db=>{
    const last=db.prepare("SELECT id,checksum FROM memory_v8_graph_snapshots WHERE checksum=? AND as_of=?").get(checksum,g.asOf);
    if(last)return {id:last.id,stored:false,checksum};
    const id=randomUUID();db.prepare("INSERT INTO memory_v8_graph_snapshots(id,checksum,as_of,nodes,edges,created_at) VALUES(?,?,?,?,?,?)").run(id,checksum,g.asOf,g.nodes.length,g.edges.length,new Date().toISOString());
    return {id,stored:true,checksum,nodes:g.nodes.length,edges:g.edges.length};
  });
}
