/** CHAT v13 bounded research. All retrieved content is untrusted evidence. */
import {adaptiveRecall,retrievalPlan,recallQuality} from "./memory-v12-retrieval.mjs";
import {agenticMemorySearch} from "./memory-v8-retrieval.mjs";
import {graphRecall} from "./universal-memory-graph.mjs";
import {memoryTokens,confidential} from "./memory-store.mjs";
import {classifyChatMessage,routeChatTools} from "./chat-v13-intelligence.mjs";
export function researchChatQuestion(query,{limit=8}={}){
  const plan=retrievalPlan(query,{budget:Math.min(30,limit*2)});
  const recall=adaptiveRecall(query,{limit:Math.min(12,Math.max(1,limit))});
  const quality=recallQuality(query,recall.results);
  const graph=plan.graph?graphRecall(query,{limit:6,hops:2}):[];
  const sources=[...new Map([...recall.results,...graph].filter(r=>r?.id&&typeof r.content==="string"&&!confidential.test(r.content)).map(r=>[r.id,r])).values()];
  return {plan,sources,graphConnections:graph.length,quality,
    insufficient:quality.coverage<.5||sources.length===0,
    verifiedByIndependentSources:false,canConcludeCausality:false,
    nextStep:sources.length?"Use linked citations in response":"State uncertainty and request an indexed source"};
}
export function chooseChatStrategy(query,{recent=[],documentsAvailable=false}={}){
  const analysis=classifyChatMessage(query,{recent});
  return {analysis,tools:routeChatTools(analysis,{documentsAvailable}),
    strategy:analysis.ambiguity.requiresClarification?"clarify":
      analysis.intents.includes("search")||analysis.intents.includes("analyze")?"research":
      analysis.depth>=4?"extended":"standard",
    promptBudgetChars:analysis.depth>=4?2800:1800,autonomousToolWrites:false};
}
export function answerAudit(query,answer,sources=[]){
  const qTokens=new Set(memoryTokens(query)),text=String(answer||"");
  const lines=text.split(/(?<=[.!?])\s+/u).filter(x=>x.length>15).slice(0,18);
  const active=sources.filter(x=>x&&typeof x.content==="string");
  const claims=lines.map(sentence=>{
    const tokens=memoryTokens(sentence).filter(x=>!qTokens.has(x));
    const matches=active.map(source=>({sourceId:source.id,
      overlap:tokens.length?tokens.filter(t=>memoryTokens(source.content).some(w=>w===t)).length/tokens.length:0}))
      .filter(x=>x.overlap>.25).sort((a,b)=>b.overlap-a.overlap);
    return {sentence:sentence.slice(0,400),sourceIds:matches.slice(0,3).map(x=>x.sourceId),
      assessment:matches.length?"lexical-support-only":"no-source-match"};
  });
  return {claims,uncited:claims.filter(c=>c.assessment==="no-source-match").length,
    verified:false,notEntailment:true};
}
