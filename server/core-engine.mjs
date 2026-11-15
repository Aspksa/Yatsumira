/** YATSUMIRA CORE v1 server-side orchestration. No GUI additions. */
import {randomUUID} from "node:crypto";
import {saveExchange,coreStatus,recentMessages,searchCore} from "./core-db.mjs";

export function validateChatMessages(messages){
  return Array.isArray(messages)&&messages.length>0&&messages.length<=30 &&
    messages.every(m=>["user","assistant"].includes(m?.role)&&typeof m.content==="string"&&
      m.content.trim()&&m.content.length<=4000)&&messages.at(-1).role==="user";
}
export function commitAssistantExchange({messages,answer,model,sessionId,requestId}){
  if(!validateChatMessages(messages)||typeof answer!=="string"||!answer.trim())
    throw Object.assign(new Error("Invalid completed chat exchange"),{status:400});
  const safe=id=>typeof id==="string"&&id.length>0&&id.length<=100&&/^[\w-]+$/.test(id);
  return saveExchange({
    conversationId:safe(sessionId)?sessionId:"default",
    exchangeId:safe(requestId)?requestId:randomUUID(),
    user:messages.at(-1).content,assistant:answer,model
  });
}
export const coreOverview=()=>coreStatus();
export const conversationHistory=limit=>recentMessages("default",limit);
export const lookupKnowledge=(query,limit)=>searchCore(query,limit);
