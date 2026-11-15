/** Universal CORE v4 diagnostics and commands. No visual interface changes. */
import {
  indexUniversalGraph,graphOverview,graphPath,graphCommunities,graphRecall,graphClaims,
  memoryTimeline,recordMemoryEvent,recordMemoryFeedback,assertGraphRelation
} from "../server/universal-memory-graph.mjs";
import {workingMemoryCandidates} from "../server/long-memory.mjs";
import {hybridRecall} from "../server/memory-provider.mjs";
const [cmd,...args]=process.argv.slice(2);
const required=(index,label)=>{
  const value=args[index];
  if(!value)throw Error("Required: "+label);
  return value;
};
async function main(){
  let result;
  switch(cmd){
    case "status": result={graph:graphOverview(),workingMemory:workingMemoryCandidates({limit:8}).length};break;
    case "index":result=indexUniversalGraph({batch:Number(args[0])||40});break;
    case "path":result=graphPath(required(0,"from label"),required(1,"to label"));break;
    case "communities":result={communities:graphCommunities().slice(0,30)};break;
    case "recall":result=await hybridRecall(args.join(" "),{limit:10});break;
    case "claims":result={claims:graphClaims({limit:100})};break;
    case "timeline":result={events:memoryTimeline({limit:Number(args[0])||50})};break;
    case "neighbors":result={matches:graphRecall(args.join(" "),{hops:3,limit:15})};break;
    case "feedback":result=recordMemoryFeedback(required(0,"memory id"),required(1,"useful|irrelevant|incorrect"));break;
    case "event":
      result=recordMemoryEvent({memoryId:required(0,"memory id"),occurredAt:required(1,"date"),
        eventType:required(2,"event type"),title:args.slice(3).join(" ")});
      break;
    case "relation":
      result=assertGraphRelation({memoryId:required(0,"memory id"),subject:required(1,"subject"),
        predicate:required(2,"predicate"),object:required(3,"object"),exclusive:args[4]==="exclusive"});
      break;
    default:throw Error("Usage: node scripts/memory-v4.mjs status|index|path|communities|recall|claims|timeline|neighbors|feedback|event|relation");
  }
  console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error("[YATSUMIRA CORE v4] "+(error?.message||String(error)));process.exitCode=1;});
