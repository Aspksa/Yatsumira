/**
 * Local-only CORE v6 diagnostics. No web UI or external model calls.
 * Source-backed proposals never mutate verified facts.
 */
import {
  planMemoryQuery,expandMemoryQueries,analyzeMemoryQuestion,openKnowledgeQuestions,
  detectGraphAnomalies,proposeHypothesis,examineHypothesis,
  proposeOntologyType,memoryReflection,recordMemorySnapshot
} from "../server/memory-v6-intelligence.mjs";
import {structuralGraphFeatures,suggestMissingGraphLinks,graphOfCommunities,causalGraph} from "../server/memory-v6-graph-features.mjs";
import {evaluateAnswerContext,contraryEvidenceCandidates} from "../server/memory-v6-evidence.mjs";
import {recallMemory} from "../server/long-memory.mjs";
const [command,...args]=process.argv.slice(2);
const required=(index,label)=>{if(!args[index])throw Error("Required: "+label);return args[index];};
async function main(){
  let result;
  switch(command){
    case "plan":result=planMemoryQuery(args.join(" "));break;
    case "multiquery":result={variants:expandMemoryQueries(args.join(" "))};break;
    case "research":result=analyzeMemoryQuestion(args.join(" "));break;
    case "questions":result=openKnowledgeQuestions(args.join(" "));break;
    case "anomalies":result=detectGraphAnomalies();break;
    case "structural":result={features:structuralGraphFeatures({rounds:2}).slice(0,100)};break;
    case "possible-links":result={proposals:suggestMissingGraphLinks({limit:30})};break;
    case "communities":result=graphOfCommunities();break;
    case "causality":result={claims:causalGraph({reviewedOnly:true})};break;
    case "opposing":result={conflicts:contraryEvidenceCandidates(args.join(" "))};break;
    case "evidence":{
      const query=required(0,"query");
      const answer=args.slice(1).join(" ");
      result=evaluateAnswerContext(query,answer,recallMemory(query,{limit:12}));
      break;
    }
    case "hypothesis":result=proposeHypothesis({claim:args.join(" "),kind:"hypothesis"});break;
    case "inspect-hypothesis":result=examineHypothesis(required(0,"hypothesis id"));break;
    case "ontology":result=proposeOntologyType(required(0,"type"),{parentType:args[1]||null});break;
    case "reflect":result=memoryReflection(required(0,"memory id"),{mode:args[1]||"reflection"});break;
    case "snapshot":result=recordMemorySnapshot(args.join(" ")||"manual");break;
    default:throw Error("Usage: node scripts/memory-v6.mjs plan|multiquery|research|questions|anomalies|structural|possible-links|communities|causality|opposing|evidence|hypothesis|inspect-hypothesis|ontology|reflect|snapshot");
  }
  console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error("[YATSUMIRA CORE v6] "+(error?.message||String(error)));process.exitCode=1;});
