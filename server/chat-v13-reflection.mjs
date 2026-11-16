/** CHAT v13 local-only reflection over durable conversations.
 * Deterministic observations only; never auto-promote dialog text into facts.
 */
import {randomUUID,createHash} from "node:crypto";
import {withCoreDatabase,recentMessages} from "./core-db.mjs";
import {classifyChatMessage} from "./chat-v13-intelligence.mjs";
import {memoryTokens,confidential} from "./memory-store.mjs";
const hash=x=>createHash("sha256").update(x).digest("hex"),now=()=>new Date().toISOString();
export function reflectConversation(conversationId="default",{limit=24,persist=true}={}){
  const messages=recentMessages(conversationId,Math.min(60,Math.max(2,limit)));
  const pairs=messages.filter(x=>x.role==="user");
  if(pairs.length<2)return {stored:false,observations:[],reason:"too-few-user-messages"};
  const key=hash(conversationId+"|"+messages.map(x=>x.exchangeId+":"+x.role).join("|"));
  const counts=new Map(),intentCounts=new Map();
  for(const row of pairs){
    if(confidential.test(row.content))continue;
    for(const term of memoryTokens(row.content).slice(0,16))counts.set(term,(counts.get(term)||0)+1);
    const analysis=classifyChatMessage(row.content,{recent:[]});
    for(const intent of analysis.intents)intentCounts.set(intent,(intentCounts.get(intent)||0)+1);
  }
  const topics=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([term,occurrences])=>({term,occurrences}));
  const observations={userMessages:pairs.length,topics,intents:Object.fromEntries(intentCounts),
    proofStatus:"descriptive-heuristics-only",provenance:messages.map(x=>x.exchangeId).filter(Boolean).slice(-30)};
  if(!persist)return {stored:false,observations};
  return withCoreDatabase(db=>{
    const existing=db.prepare("SELECT id FROM chat_v13_reflections WHERE window_digest=?").get(key);
    if(existing)return {id:existing.id,stored:false,observations};
    const id=randomUUID(),topic=topics[0]?.term||"диалог";
    db.prepare("INSERT INTO chat_v13_reflections(id,conversation_id,window_digest,topic,observations_json,created_at) VALUES(?,?,?,?,?,?)")
      .run(id,conversationId,key,topic,JSON.stringify(observations),now());
    return {id,stored:true,observations};
  });
}
export function backgroundChatReflection({limit=4}={}){
  const active=withCoreDatabase(db=>db.prepare("SELECT id FROM conversations ORDER BY updated_at DESC LIMIT ?").all(Math.max(1,Math.min(10,limit))));
  const results=active.map(x=>reflectConversation(x.id,{limit:24,persist:true}));
  return {checked:active.length,stored:results.filter(x=>x.stored).length,
    candidateOnly:true,sideEffects:"descriptive-audit-only"};
}
export function chatBenchmark(cases,{persist=false}={}){
  if(!Array.isArray(cases)||cases.length<2||cases.length>50)throw Error("Need 2-50 labeled dialogue cases");
  const samples=cases.map(item=>{
    if(typeof item.query!=="string"||!Array.isArray(item.expectedIntents))throw Error("Invalid labeled case");
    const analysis=classifyChatMessage(item.query,{recent:item.recent||[]});
    return {expected:item.expectedIntents,actual:analysis.intents,
      precision:item.expectedIntents.length?
        item.expectedIntents.filter(x=>analysis.intents.includes(x)).length/item.expectedIntents.length:1};
  });
  const result={cases:samples.length,intentRecall:samples.reduce((n,x)=>n+x.precision,0)/samples.length,
    note:"Heuristic intent test only; not a measure of factual correctness"};
  if(persist)withCoreDatabase(db=>db.prepare("INSERT INTO chat_v13_benchmarks(id,kind,metrics_json,created_at) VALUES(?,?,?,?)")
    .run(randomUUID(),"intent",JSON.stringify(result),now()));
  return result;
}
