/** Conservative source-evidence audit. Lexical overlap is not factual entailment. */
import {memoryTokens} from "./memory-store.mjs";
export function auditContractAnswer(answer,fragments,{maxClaims=12}={}){
 const sources=(Array.isArray(fragments)?fragments:[]).filter(x=>typeof x?.excerpt==="string");
 const claims=String(answer||"").split(/(?<=[.!?])\s+|[;\n]+/u).map(x=>x.trim()).filter(x=>x.length>15).slice(0,maxClaims);
 const rows=claims.map(claim=>{
   const words=new Set(memoryTokens(claim));
   const matches=sources.map(source=>{
     const evidence=new Set(memoryTokens(source.excerpt));
     const overlap=words.size?[...words].filter(w=>evidence.has(w)).length/words.size:0;
     return {sourceId:source.sourceId,chunkIndex:source.chunkIndex,overlap};
   }).sort((a,b)=>b.overlap-a.overlap).slice(0,2);
   return {claim,possibleSources:matches.filter(x=>x.overlap>=.25),
     requiresReview:true};
 });
 return {claims:rows,sourceCount:sources.length,unsupportedClaimCount:rows.filter(x=>!x.possibleSources.length).length,
   verified:false,interpretation:"Lexical evidence pointers only; not a legal or factual verification"};
}
