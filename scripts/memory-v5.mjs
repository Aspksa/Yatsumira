/**
 * CORE v5 local-only operations. No web UI is added.
 * Commands write to SQLite only when explicitly requested.
 */
import {inspectMemoryV5} from "../server/memory-v5-health.mjs";
import {personalizedGraphRank,recallWithStrategy,topicCommunities,graphQuality,
  checkRetrievalCompleteness,auditAnswerEvidence} from "../server/memory-v5-reasoning.mjs";
import {extractInterpretation} from "../server/memory-v5-extraction.mjs";
import {extractionConfigured,extractMemoryUsingProvider} from "../server/memory-v5-provider.mjs";
import {createMemoryTask,updateMemoryTask,openMemoryTasks,decisions,
  recordDecision,needsReindex,markIndexed} from "../server/memory-v5-records.mjs";
import {recallMemory} from "../server/long-memory.mjs";
const [command,...args]=process.argv.slice(2);
const requireArg=(i,desc)=>{if(!args[i])throw Error("Required: "+desc);return args[i];};
async function main(){
  let result;
  switch(command){
    case "health":result=inspectMemoryV5();if(!result.ok)process.exitCode=2;break;
    case "rank":result={memories:personalizedGraphRank(args.join(" "),{limit:15})};break;
    case "recall":result={memories:recallWithStrategy(args.join(" "),{limit:15})};break;
    case "topics":result={groups:topicCommunities({minSize:2}).slice(0,50)};break;
    case "graph-quality":result=graphQuality();break;
    case "interpret":result=extractInterpretation(args.join(" "));break;
    case "tasks":result={tasks:openMemoryTasks()};break;
    case "task-create":result=createMemoryTask({memoryId:requireArg(0,"memory ID"),title:args.slice(1).join(" ")});break;
    case "task-update":result=updateMemoryTask(requireArg(0,"task ID"),{status:requireArg(1,"open|done|cancelled"),checkpoint:args.slice(2).join(" ")});break;
    case "decisions":result={decisions:decisions()};break;
    case "decision-create":result=recordDecision({memoryId:requireArg(0,"memory ID"),subject:requireArg(1,"subject"),choice:args.slice(2).join(" ")});break;
    case "index-check":result=needsReindex(requireArg(0,"source key"),args.slice(1).join(" "));break;
    case "extract":{
      const id=requireArg(0,"memory ID");
      if(!extractionConfigured())throw Error("Explicit YATSUMIRA_MEMORY_EXTRACT_URL/KEY/MODEL required");
      // Requires a separate --commit flag; dry-run is the default.
      result=await extractMemoryUsingProvider(id,{dryRun:!args.includes("--commit")});
      break;
    }
    case "coverage":{
      const query=args.join(" "),matches=recallMemory(query,{limit:12});
      result={quality:checkRetrievalCompleteness(query,matches),evidence:auditAnswerEvidence(query,matches)};
      break;
    }
    default:throw Error("Usage: node scripts/memory-v5.mjs health|rank|recall|topics|graph-quality|interpret|tasks|task-create|task-update|decisions|decision-create|index-check|extract|coverage");
  }
  if(result)console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error("[YATSUMIRA CORE v5] "+(error?.message||String(error)));process.exitCode=1;});
