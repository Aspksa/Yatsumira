/** CORE v7 headless memory tools; no UI additions. */
import {reasoningStep,reasoningLink,reasoningTrace,alignmentCandidates,proposeAlignment,reviewAlignment,procedureFromTask,consolidateSources,reinforceLink,experienceTimeline,consolidateCompletedTasks} from "../server/memory-v7-experience.mjs";
import {temporalGraph,hierarchicalClusters,temporalContradictions,rankGraphPaths,graphRepairPlan} from "../server/memory-v7-graph.mjs";
const [command,...args]=process.argv.slice(2);
const need=(i,label)=>{if(!args[i])throw Error("Required: "+label);return args[i];};
async function run(){
  let result;
  switch(command){
    case "clusters":result=hierarchicalClusters();break;
    case "temporal":result=temporalGraph({asOf:args[0]});break;
    case "contradictions":result={candidates:temporalContradictions()};break;
    case "paths":result={paths:rankGraphPaths(need(0,"start"),need(1,"destination"))};break;
    case "repair-check":result=graphRepairPlan();break;
    case "alignment-candidates":result={candidates:alignmentCandidates()};break;
    case "alignment-propose":result=proposeAlignment({leftId:need(0,"node A"),rightId:need(1,"node B"),memoryId:need(2,"source memory")});break;
    case "alignment-review":{const decision=need(1,"approved|rejected");if(!["approved","rejected"].includes(decision))throw Error("Invalid review decision");result=reviewAlignment(need(0,"alignment id"),{approved:decision==="approved",evidence:args.slice(2).join(" ")});break;}
    case "reasoning":result=reasoningTrace(need(0,"session id"));break;
    case "reasoning-add":result=reasoningStep({sessionId:need(0,"session"),stepKey:need(1,"step key"),kind:need(2,"kind"),content:args.slice(3).join(" ")});break;
    case "reasoning-link":result=reasoningLink(need(0,"from"),need(1,"to"),args[2]||"derived_from");break;
    case "experience":result={timeline:experienceTimeline()};break;
    case "procedures":result=consolidateCompletedTasks({limit:Number(args[0])||20});break;
    case "procedure":result=procedureFromTask(need(0,"completed task id"));break;
    case "compress":result=consolidateSources(args,{kind:"compressed"});break;
    case "reinforce":result=reinforceLink(need(0,"link id"),{memoryId:need(1,"evidence memory id"),decision:args[2]||"strengthen"});break;
    default:throw Error("Usage: node scripts/memory-v7.mjs clusters|temporal|contradictions|paths|repair-check|alignment-candidates|alignment-propose|alignment-review|reasoning|reasoning-add|reasoning-link|experience|procedures|procedure|compress|reinforce");
  }
  console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error("[YATSUMIRA CORE v7] "+(error?.message||String(error)));process.exitCode=1;});
