/** CORE v8 backend-only commands. No UI additions or automatic cloud calls. */
import {fusionPreview,storeFusion,fusionSources,sourceInterference,experiencePatterns,memoryGaps,memoryPriority,decisionOutcome,decisionHistory} from "../server/memory-v8-learning.mjs";
import {graphMotifs,hypergraphPatterns,timeGraphEvolution,proposedGraphLinks,graphEmbeddingCandidates,graphConflictsAndImpact,evidenceGraphPath,recordGraphSnapshot} from "../server/memory-v8-graph.mjs";
import {scheduleMemoryJob,recoverInterruptedJobs,runMemoryJob,memoryJobStatus,memoryQualityWatch,compareMemoryAlgorithms,offlineMemoryStatus} from "../server/memory-v8-operations.mjs";
import {agenticMemorySearch,debateEvidence} from "../server/memory-v8-retrieval.mjs";
import {recallMemory} from "../server/long-memory.mjs";
const [command,...args]=process.argv.slice(2);
const required=(i,label)=>{if(!args[i])throw Error("Required: "+label);return args[i];};
async function main(){
  let result;
  switch(command){
    case "fusion-preview":result={candidates:fusionPreview(args.join(" "))};break;
    case "fuse":result=storeFusion(args,{kind:"fusion"});break;
    case "fusion-sources":result={sources:fusionSources(required(0,"fusion id"))};break;
    case "interference":result={candidates:sourceInterference(args.join(" "))};break;
    case "patterns":result={patterns:experiencePatterns()};break;
    case "gaps":result=memoryGaps(args.join(" "));break;
    case "priority":result=memoryPriority(required(0,"memory id"));break;
    case "outcome":result=decisionOutcome({decisionId:required(0,"decision id"),memoryId:required(1,"memory id"),outcome:args.slice(2).join(" ")});break;
    case "decision-history":result={history:decisionHistory(required(0,"decision id"))};break;
    case "motifs":result={motifs:graphMotifs()};break;
    case "hypergraph":result=hypergraphPatterns();break;
    case "evolution":result=timeGraphEvolution(required(0,"start date"),required(1,"end date"));break;
    case "proposed-links":result={candidates:proposedGraphLinks()};break;
    case "structural-vectors":result={nodes:graphEmbeddingCandidates({limit:40})};break;
    case "conflict-impact":result=graphConflictsAndImpact();break;
    case "paths":result={paths:evidenceGraphPath(required(0,"from"),required(1,"to"))};break;
    case "graph-snapshot":result=recordGraphSnapshot({asOf:args[0]});break;
    case "research":result=await agenticMemorySearch(args.join(" "));break;
    case "debate":result=debateEvidence(args.join(" "));break;
    case "jobs":result={jobs:memoryJobStatus()};break;
    case "schedule":result=scheduleMemoryJob(required(0,"job kind"),args[1]?{query:args.slice(1).join(" ")}:{});break;
    case "run-job":result=runMemoryJob();break;
    case "recover-jobs":result=recoverInterruptedJobs();break;
    case "quality":result=memoryQualityWatch({persist:true});break;
    case "offline":result=offlineMemoryStatus();break;
    default:throw Error("Usage: node scripts/memory-v8.mjs fusion-preview|fuse|fusion-sources|interference|patterns|gaps|priority|outcome|decision-history|motifs|hypergraph|evolution|proposed-links|structural-vectors|conflict-impact|paths|graph-snapshot|research|debate|jobs|schedule|run-job|recover-jobs|quality|offline");
  }
  console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error("[YATSUMIRA CORE v8] "+(error?.message||String(error)));process.exitCode=1;});
