/** CORE v12 local tools; no web interface and no autonomous model-weight updates. */
import {proposeLesson,reviewLesson,lessons,learnFromOutcomes,feedbackMemory,feedbackPriority,researchGaps,learningReport} from "../server/memory-v12-learning.mjs";
import {graphLearningOverview,relationConfidence,graphChangeDiagnostics,analogyCandidates,ontologyCandidates,traceGraphAnomalies} from "../server/memory-v12-graph-learning.mjs";
import {retrievalPlan,adaptiveRecall,retrievalProfileProposal,recallQuality} from "../server/memory-v12-retrieval.mjs";
import {scheduleMemoryJob,runMemoryJob,memoryJobStatus} from "../server/memory-v8-operations.mjs";
const [cmd,...args]=process.argv.slice(2);
const need=(i,description)=>{if(!args[i])throw Error("Required "+description);return args[i];};
function main(){
  let output;
  switch(cmd){
    case "status":output={learning:learningReport(),jobs:memoryJobStatus()};break;
    case "lessons":output={lessons:lessons({reviewedOnly:false})};break;
    case "lesson-propose":output=proposeLesson({kind:need(0,"kind"),description:need(1,"description"),memoryIds:args.slice(2)});break;
    case "lesson-review":{const action=need(1,"approve|reject");if(!["approve","reject"].includes(action))throw Error("Invalid review");output=reviewLesson(need(0,"lesson ID"),{approved:action==="approve",evidence:args.slice(2).join(" ")});break;}
    case "learn":output=learnFromOutcomes({limit:5});break;
    case "feedback":output=feedbackMemory({memoryId:need(0,"memory ID"),kind:need(1,"kind"),query:need(2,"query"),evidence:args.slice(3).join(" ")});break;
    case "priority":output=feedbackPriority(need(0,"memory ID"));break;
    case "gaps":output=researchGaps({query:args.join(" ")});break;
    case "graph":output=graphLearningOverview({limit:10});break;
    case "analogies":output={candidates:analogyCandidates({limit:10})};break;
    case "ontology":output=ontologyCandidates();break;
    case "anomalies":output=traceGraphAnomalies();break;
    case "graph-change":output=graphChangeDiagnostics({before:need(0,"before date"),after:need(1,"after date")});break;
    case "graph-score":output={connections:relationConfidence(need(0,"memory ID"))};break;
    case "plan":output=retrievalPlan(args.join(" "));break;
    case "recall":output=adaptiveRecall(args.join(" "));break;
    case "schedule":output=scheduleMemoryJob(need(0,"job type"),{day:new Date().toISOString().slice(0,10)});break;
    case "work":output=runMemoryJob();break;
    default:throw Error("Usage: node scripts/memory-v12.mjs status|lessons|lesson-propose|lesson-review|learn|feedback|priority|gaps|graph|analogies|ontology|anomalies|graph-change|graph-score|plan|recall|schedule|work");
  }
  console.log(JSON.stringify(output,null,2));
}
try{main();}catch(error){console.error("[CORE v12] "+error.message);process.exitCode=1;}
