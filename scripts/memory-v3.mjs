/** CLI-only CORE v3 management. All commands run locally; no website changes. */
import {consolidateStep,summarizeConversation,memoryMaintenanceStatus,recordRetrievalEvaluation} from "../server/memory-maintenance.mjs";
import {inspectPendingFacts,pendingConflicts,memoryNeighbors} from "../server/memory-intelligence.mjs";
import {vectorOverview} from "../server/memory-vectors.mjs";
import {embeddingConfigured,indexMissingEmbeddings,hybridRecall} from "../server/memory-provider.mjs";
import {recallMemory,memoryOverview} from "../server/long-memory.mjs";
const [command,...args]=process.argv.slice(2);
(async()=>{
  let data;
  switch(command){
    case "status":data={memory:memoryOverview(),maintenance:memoryMaintenanceStatus(),vectors:vectorOverview(),embeddingConfigured:embeddingConfigured()};break;
    case "consolidate":data=consolidateStep({batch:Number(args[0])||40});break;
    case "facts":data={candidates:inspectPendingFacts({limit:50})};break;
    case "conflicts":data={conflicts:pendingConflicts({limit:50})};break;
    case "neighbors":data={neighbors:memoryNeighbors(args[0]||"")};break;
    case "summary":data=summarizeConversation({conversationId:args[0]||"default"});break;
    case "embed":
      if(!embeddingConfigured())throw Error("Configure YATSUMIRA_MEMORY_EMBED_URL, YATSUMIRA_MEMORY_EMBED_KEY, YATSUMIRA_MEMORY_EMBED_MODEL");
      data=await indexMissingEmbeddings({batch:Number(args[0])||12});break;
    case "recall":data=await hybridRecall(args.join(" "),{limit:10});break;
    case "evaluate":{
      const expected=args[0],query=args.slice(1).join(" ");
      if(!expected||!query)throw Error("Provide expected memory ID and query");
      data=recordRetrievalEvaluation([{expectedId:expected,query}],q=>recallMemory(q,{limit:20}));break;
    }
    default:throw Error("Usage: node scripts/memory-v3.mjs status|consolidate|facts|conflicts|neighbors|summary|embed|recall|evaluate");
  }
  console.log(JSON.stringify(data,null,2));
})().catch(error=>{console.error("[YATSUMIRA CORE v3] "+(error?.message||String(error)));process.exitCode=1;});
