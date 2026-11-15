/** CORE v12 graph learning proposals; never rewires reviewed assertions.
 * Causality, analogy and missing relations are unverified hypotheses.
 */
import {withCoreDatabase} from "./core-db.mjs";
import {memoryTokens} from "./memory-store.mjs";
import {discoverGraphLinks,graphAnomalyReview,knowledgeBridges} from "./memory-v10-discovery.mjs";
import {hierarchicalClusters,temporalContradictions} from "./memory-v7-graph.mjs";
import {graphMotifs,timeGraphEvolution,graphConflictsAndImpact} from "./memory-v8-graph.mjs";
import {identityCandidates} from "./memory-v10-identity.mjs";
export function graphLearningOverview({limit=12}={}){
  return {
    linkCandidates:discoverGraphLinks({limit,persist:false}).candidates,
    bridges:knowledgeBridges({limit}),
    identityCandidates:identityCandidates({limit}),
    motifs:graphMotifs({limit}),
    anomalies:graphAnomalyReview({limit,persist:false}),
    conflictImpact:graphConflictsAndImpact({limit}),
    communities:hierarchicalClusters().communities.slice(0,limit),
    state:"review-only",autoMerged:false
  };
}
export function relationConfidence(memoryId){
  return withCoreDatabase(db=>{
    const supports=db.prepare("SELECT a.id,a.predicate,a.subject_id AS subjectId,a.object_id AS objectId,a.confidence,a.review_state AS reviewState FROM graph_assertions a JOIN memory_entries m ON m.id=a.memory_id WHERE a.memory_id=? AND m.state='active'").all(memoryId);
    const votes=db.prepare("SELECT kind,COUNT(*) AS n FROM memory_feedback WHERE memory_id=? GROUP BY kind").all(memoryId);
    const feedback=Object.fromEntries(votes.map(v=>[v.kind,v.n]));
    return supports.map(x=>({...x,retrievalWeight:Number(Math.max(0,Math.min(1,
      x.confidence+(x.reviewState==="reviewed"?.1:0)+.025*Math.min(4,feedback.useful||0)-.1*Math.min(4,feedback.incorrect||0)
    )).toFixed(4)),verificationUnchanged:true}));
  });
}
export function graphChangeDiagnostics({before,after}){
  const evolution=timeGraphEvolution(before,after);
  return {...evolution,numberOfNewCandidates:discoverGraphLinks({limit:12}).candidates.length,
    note:"Temporal changes do not establish causal relationships"};
}
export function analogyCandidates({limit=15}={}){
  const bridges=knowledgeBridges({limit});
  return bridges.map(x=>({
    nodeId:x.nodeId,label:x.label,domains:x.neighborTypes,sourceMemoryIds:x.sourceMemoryIds,
    hypothesis:"Potential transferable structural pattern",verified:false,requiresIndependentReview:true
  }));
}
export function ontologyCandidates({limit=20}={}){
  return withCoreDatabase(db=>{
    const records=db.prepare("SELECT n.node_type AS type,COUNT(*) AS n FROM graph_nodes n GROUP BY node_type ORDER BY n DESC LIMIT ?").all(Math.min(100,Math.max(1,limit)));
    return {types:records,candidates:records.filter(x=>x.type==="unknown"||x.n===1),
      disclaimer:"Frequency is not a validated ontology"};
  });
}
export function traceGraphAnomalies({limit=25}={}){
  const report=graphAnomalyReview({limit,persist:false});
  const ambiguous=temporalContradictions({limit});
  return {...report,possiblePropertyAmbiguity:ambiguous,
    noDestructiveRepair:true,unverifiedCandidates:true};
}
