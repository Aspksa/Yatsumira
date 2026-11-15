/** CORE v11 headless commands. Never edits the UI and never calls cloud providers. */
import {
  storeMemoryContext,memoryRecord,memoryRevision,memoryHierarchy,memoryFamily,
  associateMemories,relatedMemories,goalMemory,goalProgress,goals,
  preferenceMemory,reviewPreference,preferences,memoryAcrossSources
} from "../server/memory-v11-longterm.mjs";
import {
  taskExperience,summarizeExperience,recordExperiencePattern,verifyExperiencePattern,
  experiencePatternsV11,consolidateDialoguesAcrossSources,semanticMemoryConsolidation,
  verifyUnderstanding,memoryLearningStatus,consolidateExperienceV11
} from "../server/memory-v11-learning.mjs";
const [command,...args]=process.argv.slice(2);
const req=(i,label)=>{if(!args[i])throw Error("Required: "+label);return args[i];};
async function main(){
  let result;
  switch(command){
    case "status":result=memoryLearningStatus();break;
    case "memory":result=memoryRecord(req(0,"memory ID"));break;
    case "context":result=storeMemoryContext(req(0,"memory ID"),{topic:req(1,"topic"),why:args.slice(2).join(" ")});break;
    case "revision":result=memoryRevision(req(0,"memory ID"),{sourceMemoryId:req(1,"source memory ID"),reason:req(2,"reason"),content:args.slice(3).join(" ")});break;
    case "hierarchy":result=memoryHierarchy({childId:req(0,"child ID"),parentId:req(1,"parent ID"),relation:args[2]||"part_of"});break;
    case "family":result=memoryFamily(req(0,"memory ID"));break;
    case "associate":result=associateMemories({fromId:req(0,"memory A"),toId:req(1,"memory B"),relation:args[2]||"related"});break;
    case "related":result={links:relatedMemories(req(0,"memory ID"))};break;
    case "goals":result={goals:goals()};break;
    case "goal-add":result=goalMemory({memoryId:req(0,"source memory"),title:req(1,"goal title"),description:args.slice(2).join(" ")});break;
    case "goal-update":result=goalProgress(req(0,"goal ID"),{status:req(1,"active|achieved|cancelled"),memoryId:args[2]});break;
    case "preferences":result={preferences:preferences({reviewedOnly:false})};break;
    case "preference-add":result=preferenceMemory({memoryId:req(0,"source memory"),key:req(1,"key"),value:req(2,"value"),context:args.slice(3).join(" ")});break;
    case "preference-review":{const choice=req(1,"approve|reject");if(!["approve","reject"].includes(choice))throw Error("Invalid review decision");result=reviewPreference(req(0,"preference ID"),{approved:choice==="approve",evidence:req(2,"review evidence")});break;}
    case "cross-source":result=memoryAcrossSources(args.join(" "));break;
    case "task-experience":result={tasks:taskExperience()};break;
    case "experience-preview":result={candidates:summarizeExperience({kind:args[0]||"success"})};break;
    case "experience-consolidate":result=consolidateExperienceV11();break;
    case "experience-record":result=recordExperiencePattern({kind:req(0,"success|failure|generalization|reflection"),memoryIds:args.slice(2),description:args[1]});break;
    case "experience-patterns":result={patterns:experiencePatternsV11({reviewedOnly:false})};break;
    case "verify-understanding":result=verifyUnderstanding(args.join(" "));break;
    case "episode":result=consolidateDialoguesAcrossSources(args);break;
    case "semantic":result=semanticMemoryConsolidation(args);break;
    default:throw Error("Usage: node scripts/memory-v11.mjs status|memory|context|revision|hierarchy|family|associate|related|goals|goal-add|goal-update|preferences|preference-add|preference-review|cross-source|task-experience|experience-preview|experience-consolidate|experience-patterns|verify-understanding|episode|semantic");
  }
  console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error("[YATSUMIRA CORE v11] "+(error?.message||String(error)));process.exitCode=1;});
