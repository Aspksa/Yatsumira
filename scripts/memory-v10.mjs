/** CORE v10 local graph operations; no web UI or external services. */
import {proposeGraphType,reviewGraphType,proposeIdentity,mergeIdentity,splitIdentity,resolveIdentity,identityCandidates} from "../server/memory-v10-identity.mjs";
import {graphProvenance,inspectGraphRules,linkEventNode,eventHistory,proposeEventCause,inspectEventCauses,connectTaskEvent,experienceGraph} from "../server/memory-v10-events.mjs";
import {discoverGraphLinks,graphAnomalyReview,graphDiscoveryStats,knowledgeBridges} from "../server/memory-v10-discovery.mjs";
const [command,...args]=process.argv.slice(2);
const requireArg=(i,label)=>{if(!args[i])throw Error("Required: "+label);return args[i];};
async function main(){
  let result;
  switch(command){
    case "types-propose":result=proposeGraphType({name:requireArg(0,"type"),memoryId:requireArg(1,"memory id")});break;
    case "types-review":result=reviewGraphType(requireArg(0,"proposal id"),{approved:requireArg(1,"approve|reject")==="approve",evidence:requireArg(2,"evidence")});break;
    case "identity-candidates":result={candidates:identityCandidates()};break;
    case "identity-propose":result=proposeIdentity({canonicalId:requireArg(0,"canonical node"),aliasId:requireArg(1,"alias node"),memoryId:requireArg(2,"memory id"),evidence:requireArg(3,"evidence")});break;
    case "identity-merge":result=mergeIdentity(requireArg(0,"mapping id"),{evidence:requireArg(1,"review evidence")});break;
    case "identity-split":result=splitIdentity(requireArg(0,"mapping id"),{evidence:requireArg(1,"split reason")});break;
    case "identity-resolve":result=resolveIdentity(requireArg(0,"node id"));break;
    case "provenance":result=graphProvenance(requireArg(0,"assertion id"));break;
    case "rules":result=inspectGraphRules();break;
    case "events":result={events:eventHistory({from:args[0],to:args[1]})};break;
    case "event-link":result=linkEventNode({eventId:requireArg(0,"event id"),nodeId:requireArg(1,"node id"),role:requireArg(2,"role")});break;
    case "cause-propose":result=proposeEventCause({causeEventId:requireArg(0,"cause event"),effectEventId:requireArg(1,"effect event"),memoryId:requireArg(2,"memory id")});break;
    case "causes":result={causes:inspectEventCauses()};break;
    case "task-event":result=connectTaskEvent({taskId:requireArg(0,"task id"),eventId:requireArg(1,"event id")});break;
    case "experience":result={events:experienceGraph()};break;
    case "discover":result=discoverGraphLinks({persist:false});break;
    case "discover-save":result=discoverGraphLinks({persist:true});break;
    case "anomalies":result=graphAnomalyReview({persist:false});break;
    case "bridges":result={candidates:knowledgeBridges()};break;
    case "stats":result=graphDiscoveryStats();break;
    default:throw Error("Usage: node scripts/memory-v10.mjs types-propose|types-review|identity-candidates|identity-propose|identity-merge|identity-split|identity-resolve|provenance|rules|events|event-link|cause-propose|causes|task-event|experience|discover|discover-save|anomalies|bridges|stats");
  }
  console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error("[YATSUMIRA CORE v10] "+(error?.message||String(error)));process.exitCode=1;});
