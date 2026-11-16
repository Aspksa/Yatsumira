/** Source-preserving segmentation and labeled retrieval quality checks.
 * Deterministic, local, dependency-free; does not silently assert legal facts.
 */
import {createHash} from "node:crypto";
import {memoryTokens} from "./memory-store.mjs";
export function chunkDocument(text,{maxChars=3000,overlap=250,sourceId="document"}={}){
  const input=String(text??"");
  if(!input.trim())return [];
  if(!Number.isInteger(maxChars)||maxChars<200||maxChars>4000||!Number.isInteger(overlap)||overlap<0||overlap>=maxChars/2)
    throw Error("Invalid chunk size or overlap");
  const chunks=[];
  let start=0;
  while(start<input.length){
    let end=Math.min(input.length,start+maxChars);
    if(end<input.length){
      const candidate=input.lastIndexOf("\n",end);
      if(candidate>start+Math.floor(maxChars*.6))end=candidate+1;
    }
    if(end<=start)end=Math.min(input.length,start+maxChars);
    const content=input.slice(start,end);
    chunks.push({id:createHash("sha256").update(JSON.stringify([sourceId,start,end,content])).digest("hex"),
      sourceId,index:chunks.length,start,end,content,previousIndex:chunks.length?chunks.length-1:null,
      documentHash:createHash("sha256").update(input).digest("hex")});
    if(end===input.length)break;
    start=Math.max(start+1,end-overlap);
  }
  return chunks.map((chunk,i)=>({...chunk,nextIndex:i+1<chunks.length?i+1:null,totalChunks:chunks.length}));
}
export function evaluateLabeledRetrieval(cases,retrieve,{topK=10}={}){
  if(!Array.isArray(cases)||!cases.length||cases.length>100||typeof retrieve!=="function")throw Error("Invalid labeled retrieval evaluation");
  if(!Number.isInteger(topK)||topK<1||topK>50)throw Error("Invalid topK");
  let hits=0,reciprocal=0,precision=0;
  const details=cases.map((item,index)=>{
    if(typeof item?.query!=="string"||!item.query.trim()||!Array.isArray(item.expectedIds)||!item.expectedIds.length)
      throw Error("Case requires query and expectedIds");
    const expected=new Set(item.expectedIds);
    const rows=retrieve(item.query).slice(0,topK);
    const ids=rows.map(x=>x.id);
    const found=ids.filter(id=>expected.has(id));
    const first=ids.findIndex(id=>expected.has(id));
    if(first>=0){hits++;reciprocal+=1/(first+1);}
    precision+=found.length/topK;
    return {index,query:item.query,expectedIds:[...expected],retrievedIds:ids,foundIds:found,firstRank:first<0?null:first+1};
  });
  const n=cases.length;
  return {cases:n,topK,hitRate:hits/n,mrr:reciprocal/n,precisionAtK:precision/n,details,
    interpretation:"Labeled retrieval relevance only; does not measure factual correctness or legal validity"};
}
export function compareRetrievalEvaluations(baseline,candidate,{minimumCases=5}={}){
  if(!baseline||!candidate||baseline.cases!==candidate.cases||baseline.cases<minimumCases||baseline.topK!==candidate.topK)
    return {accepted:false,reason:"insufficient-or-incompatible-labeled-cases"};
  const accepted=candidate.hitRate>=baseline.hitRate&&candidate.mrr>=baseline.mrr&&candidate.precisionAtK>=baseline.precisionAtK;
  return {accepted,reason:accepted?"non-regression-on-labeled-set":"retrieval-regression",
    delta:{hitRate:candidate.hitRate-baseline.hitRate,mrr:candidate.mrr-baseline.mrr,precisionAtK:candidate.precisionAtK-baseline.precisionAtK},
    automaticallyApplied:false};
}
