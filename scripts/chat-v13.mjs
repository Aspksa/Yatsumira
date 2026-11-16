/** Headless CHAT CORE v13 diagnostics: no frontend changes, no Cloud.ru calls. */
import {classifyChatMessage,conversationContext,chatContextWindow,recordChatFeedback,dialogueHealth} from "../server/chat-v13-intelligence.mjs";
import {chooseChatStrategy,researchChatQuestion} from "../server/chat-v13-research.mjs";
import {reflectConversation,backgroundChatReflection,chatBenchmark} from "../server/chat-v13-reflection.mjs";
const [cmd,...args]=process.argv.slice(2);
const required=(i,name)=>{if(!args[i])throw Error("Required: "+name);return args[i];};
let result;
try{
  switch(cmd){
    case "status":result=dialogueHealth();break;
    case "analyze":result=classifyChatMessage(args.join(" "));break;
    case "plan":result=chooseChatStrategy(args.join(" "));break;
    case "session":result=conversationContext(args[0]||"default",{limit:20});break;
    case "context":result=chatContextWindow(args.slice(1).join(" "),{conversationId:required(0,"session id")});break;
    case "research":result=researchChatQuestion(args.join(" "));break;
    case "reflect":result=reflectConversation(args[0]||"default");break;
    case "reflect-recent":result=backgroundChatReflection();break;
    case "feedback":result=recordChatFeedback({conversationId:required(0,"session id"),exchangeId:required(1,"exchange id"),kind:required(2,"incorrect|useful|clarification|correction"),comment:args.slice(3).join(" ")});break;
    default:throw Error("Usage: node scripts/chat-v13.mjs status|analyze|plan|session|context|research|reflect|reflect-recent|feedback");
  }
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error("[YATSUMIRA CHAT v13] "+error.message);process.exitCode=1;}
