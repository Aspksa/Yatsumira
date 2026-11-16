/** CHAT CORE v13: deterministic dialogue analysis, not a mind-reader.
 * Inputs are not instructions to the server; all suggested facts remain candidates.
 */
import {createHash,randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {detectIntent,detectReferences} from "./memory-v5-records.mjs";
import {memoryTokens,normalizeMemory,confidential} from "./memory-store.mjs";
import {recentMessages} from "./core-db.mjs";
const now=()=>new Date().toISOString(),hash=s=>createHash("sha256").update(s).digest("hex");
const safe=(s,n=2000)=>{const t=String(s??"").trim();if(!t||t.length>n||confidential.test(t))throw Error("Invalid or secret-containing chat text");return t;};
const keywords={
  search:/(?:^|\s)(?:найди|поищи|покажи|отыщи|где|search)(?:\s|$)/u,
  build:/(?:^|\s)(?:создай|сделай|разработай|построй|напиши|build|create)(?:\s|$)/u,
  fix:/(?:^|\s)(?:исправь|почини|устрани|fix)(?:\s|$)/u,
  analyze:/(?:^|\s)(?:проверь|проанализируй|сравни|изучи|оцени|analyze)(?:\s|$)/u,
  remember:/(?:^|\s)(?:запомни|зафиксируй|сохрани|remember)(?:\s|$)/u,
  summarize:/(?:^|\s)(?:резюмируй|суммируй|кратко|подведи итоги)(?:\s|$)/u
};
const ambiguity=/(?:^|\s)(?:это|тот|ту|его|её|они|она|он|там|тот же|сделай так)(?:\s|$)/u;
export function classifyChatMessage(content,{recent=[]}={}){
  const query=safe(content,4000),normalized=normalizeMemory(query),primary=detectIntent(query);
  const intents=[...new Set([primary.intent,...Object.entries(keywords).filter(([,re])=>re.test(normalized)).map(([name])=>name)])];
  const refs=detectReferences(query);
  const followup=refs.length>0||query.length<55&&/^(?:дальше|продолжай|ещё|это|тот|так же|сделай)/iu.test(query);
  const previous=recent.filter(x=>x.role==="user").slice(-4);
  const subjects=previous.map(x=>x.content).flatMap(memoryTokens);
  const topics=memoryTokens(query).filter(x=>x.length>=4).slice(0,12);
  const common=topics.filter(t=>subjects.some(w=>w===t)).length;
  const unclear=refs.length>0&&!previous.length||(!topics.length&&followup);
  const uncertainty=/(возможно|может быть|предполож|наверное|не уверен)/u.test(normalized);
  const depth=2+(query.length>220?1:0)+(intents.length>2?1:0)+(common>0?1:0);
  return {intents,topics,primaryIntent:primary.intent,references:refs,followup,
    ambiguity:{detected:unclear||refs.length>0,requiresClarification:unclear},
    implicitIntent:followup?"continuation-candidate":null,
    uncertainty,depth:Math.min(5,Math.max(1,depth)),priorUserMessages:previous.length,
    contextTerms:topics.filter(t=>subjects.includes(t)),heuristic:true};
}
export function conversationContext(conversationId="default",{limit=20}={}){
  const messages=recentMessages(conversationId,Math.min(60,Math.max(1,limit)));
  return {conversationId,messages,topics:[...new Set(messages.filter(x=>x.role==="user").flatMap(x=>memoryTokens(x.content)).slice(-100))].slice(-30),
    continuity:messages.length>0,source:"SQLite chat history"};
}
export function chatContextWindow(query,{conversationId="default",maxChars=1400,limit=12}={}){
  const previous=conversationContext(conversationId,{limit}).messages;
  const terms=new Set(memoryTokens(query));
  const scored=previous.map((m,i)=>({m,score:memoryTokens(m.content).filter(x=>terms.has(x)).length,age:i}))
    .filter(x=>x.m.role==="user"||x.score>0)
    .sort((a,b)=>b.score-a.score||b.age-a.age);
  const taken=[];let size=0;
  for(const x of scored){
    const value=x.m.role+": "+x.m.content.slice(0,650);
    if(size+value.length>Math.min(2500,Math.max(100,maxChars)))continue;
    taken.push(x);size+=value.length;
    if(taken.length>=8)break;
  }
  taken.sort((a,b)=>a.age-b.age);
  return {text:taken.map(x=>x.m.role+": "+x.m.content.slice(0,650)).join("\n"),
    messages:taken.length,untrustedHistory:true};
}
export function routeChatTools(analysis,{documentsAvailable=false}={}){
  const choices=[];
  if(analysis.intents.includes("search")||analysis.intents.includes("analyze"))choices.push({tool:"memory-search",allowed:true,reason:"retrieval request"});
  if(analysis.references.length||analysis.followup)choices.push({tool:"conversation-history",allowed:true,reason:"contextual follow-up"});
  if(documentsAvailable&&analysis.intents.some(i=>["search","analyze","summarize"].includes(i)))
    choices.push({tool:"document-rag",allowed:true,reason:"document index required"});
  return {choices,executed:false,requiresExplicitApprovalForWrites:true};
}
export function persistDialogueAnalysis({conversationId="default",exchangeId,query,analysis}){
  const cid=safe(conversationId,100),eid=safe(exchangeId,100),q=safe(query,4000);
  return withCoreDatabase(db=>{
    const existing=db.prepare("SELECT id FROM chat_v13_dialogue_analysis WHERE conversation_id=? AND exchange_id=?").get(cid,eid);
    if(existing)return {id:existing.id,stored:false};
    const id=randomUUID();
    db.prepare("INSERT INTO chat_v13_dialogue_analysis(id,conversation_id,exchange_id,query_digest,intents_json,topics_json,uncertainty,depth,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(id,cid,eid,hash(q),JSON.stringify(analysis.intents),JSON.stringify(analysis.topics),analysis.uncertainty?1:0,analysis.depth,now());
    return {id,stored:true};
  });
}
export function auditToolResult({conversationId,exchangeId,tool,parameters={},success,summary}){
  const permitted=["memory-search","conversation-history","document-rag","graph-recall","fts-search"];
  if(!permitted.includes(tool)||typeof success!=="boolean")throw Error("Tool audit does not authorize execution");
  const data=JSON.stringify(parameters);
  if(data.length>600||confidential.test(data))throw Error("Unsafe parameters");
  return withCoreDatabase(db=>{
    const id=randomUUID();db.prepare("INSERT INTO chat_v13_tools(id,conversation_id,exchange_id,tool_name,parameters_json,success,summary,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(id,safe(conversationId,100),safe(exchangeId,100),tool,data,success?1:0,safe(summary,400),now());
    return {id,logged:true};
  });
}
export function recordChatFeedback({conversationId="default",exchangeId,kind,comment}){
  if(!["incorrect","useful","clarification","correction"].includes(kind))throw Error("Invalid chat feedback kind");
  return withCoreDatabase(db=>{
    const exchange=db.prepare("SELECT 1 AS valid FROM messages WHERE conversation_id=? AND exchange_id=? LIMIT 1").get(conversationId,exchangeId);
    if(!exchange)throw Error("Exchange not found");
    const id=randomUUID();
    db.prepare("INSERT INTO chat_v13_feedback(id,conversation_id,exchange_id,kind,comment,created_at) VALUES(?,?,?,?,?,?)")
      .run(id,conversationId,exchangeId,kind,safe(comment,700),now());
    return {id,recorded:true,noAutomaticFactRewrite:true};
  });
}
export function dialogueHealth(){
  return withCoreDatabase(db=>({
    analyzed:db.prepare("SELECT COUNT(*) AS n FROM chat_v13_dialogue_analysis").get().n,
    errors:db.prepare("SELECT COUNT(*) AS n FROM chat_v13_feedback WHERE kind IN ('incorrect','correction')").get().n,
    toolAudits:db.prepare("SELECT COUNT(*) AS n FROM chat_v13_tools").get().n,
    reflections:db.prepare("SELECT COUNT(*) AS n FROM chat_v13_reflections").get().n
  }));
}
