/** CORE v8: bounded multi-source research, debate and source-aware reranking.
 * Disagreement and word overlap are not equivalent to verified truth.
 */
import {hybridRecall} from "./memory-provider.mjs";
import {memoryTokens,confidential} from "./memory-store.mjs";
import {contraryEvidenceCandidates,traceAnswerClaims} from "./memory-v6-evidence.mjs";
import {planMemoryQuery,expandMemoryQueries} from "./memory-v6-intelligence.mjs";
import {memoryGaps} from "./memory-v8-learning.mjs";
const words=s=>new Set(memoryTokens(s));
const match=(a,b)=>{const x=words(a),y=words(b);return x.size?[...x].filter(t=>y.has(t)).length/x.size:0;};
export function sourceAwareOrder(query,records,{limit=10}={}){
  return (Array.isArray(records)?records:[]).filter(x=>x&&typeof x.content==="string"&&!confidential.test(x.content))
    .map(x=>({...x,rankScore:Number((
      .65*match(query,x.content)+.2*(x.verified?1:0)+.15*Math.max(0,Math.min(1,Number(x.confidence)||0))
    ).toFixed(4)),truthVerified:false}))
    .sort((a,b)=>b.rankScore-a.rankScore).slice(0,Math.max(1,Math.min(30,limit)));
}
export function debateEvidence(query,{limit=10}={}){
  const opposition=contraryEvidenceCandidates(query,{limit});
  return {question:query,conflictingCandidates:opposition,
    viewpoints:[{stance:"support",requirement:"original source citations"},
      {stance:"challenge",requirement:"independent negative or contradictory sources"}],
    verdict:"unresolved-without-independent-review",notAutonomousVerdict:true};
}
export async function agenticMemorySearch(query,{limit=8,maxRounds=2,request}={}){
  const plan=planMemoryQuery(query);
  const terms=expandMemoryQueries(query,{limit:Math.min(4,Math.max(1,maxRounds)*2)});
  const rounds=[],accumulated=new Map();
  for(const term of terms.slice(0,Math.min(4,Math.max(1,maxRounds)))){
    const result=await hybridRecall(term,{limit:Math.min(15,limit*2),...(request?{request}:{})});
    rounds.push({term,mode:result.mode,found:result.results.length});
    for(const row of result.results){if(!accumulated.has(row.id))accumulated.set(row.id,row);}
    if(accumulated.size>=limit && rounds.length>=1)break;
  }
  const ranked=sourceAwareOrder(query,[...accumulated.values()],{limit});
  const covered=words(ranked.map(x=>x.content).join(" "));
  const missing=memoryTokens(query).filter(t=>![...covered].some(w=>w.startsWith(t.slice(0,5))||t.startsWith(w.slice(0,5))));
  return {plan,rounds,results:ranked,missing,
    insufficient:ranked.length===0||missing.length>0,
    evidenceTrace:traceAnswerClaims(query,ranked),
    note:"Retrieval ranking is not independent factual verification"};
}
