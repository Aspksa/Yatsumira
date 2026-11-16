/**
 * CORE v6 evidence search: traces and candidate disagreement rather than
 * unearned "hallucination detection" promises.
 */
import {withCoreDatabase} from "./core-db.mjs";
import {memoryTokens,confidential} from "./memory-store.mjs";
import {recallMemory} from "./long-memory.mjs";
import {checkRetrievalCompleteness,auditAnswerEvidence} from "./memory-v5-reasoning.mjs";
const intersections=(a,b)=>{
  const aa=new Set(memoryTokens(a)),bb=new Set(memoryTokens(b));
  return aa.size?[...aa].filter(x=>bb.has(x)).length/aa.size:0;
};
export function contraryEvidenceCandidates(query,{limit=12}={}){
  const memories=recallMemory(query,{limit:30});
  return withCoreDatabase(db=>{
    const ids=new Set(memories.map(x=>x.id));
    const unresolved=db.prepare("SELECT f1.memory_id AS leftId,f2.memory_id AS rightId,f1.subject,f1.predicate,f1.object AS leftValue,f2.object AS rightValue FROM memory_conflicts c JOIN memory_facts f1 ON f1.id=c.left_fact JOIN memory_facts f2 ON f2.id=c.right_fact WHERE c.review_state='pending'").all();
    const graph=db.prepare("SELECT a.memory_id AS leftId,b.memory_id AS rightId,s.label AS subject,a.predicate,oa.label AS leftValue,ob.label AS rightValue FROM graph_conflicts c JOIN graph_assertions a ON a.id=c.left_assertion JOIN graph_assertions b ON b.id=c.right_assertion JOIN graph_nodes s ON s.id=a.subject_id JOIN graph_nodes oa ON oa.id=a.object_id JOIN graph_nodes ob ON ob.id=b.object_id WHERE c.review_state='pending'").all();
    return [...unresolved,...graph].filter(row=>ids.has(row.leftId)||ids.has(row.rightId)||
      intersections(query,row.subject+" "+row.predicate)>.2)
      .slice(0,Math.max(1,Math.min(50,limit))).map(row=>{
        const left=db.prepare("SELECT source_kind AS sourceKind,source_id AS sourceId,content,state FROM memory_entries WHERE id=?").get(row.leftId);
        const right=db.prepare("SELECT source_kind AS sourceKind,source_id AS sourceId,content,state FROM memory_entries WHERE id=?").get(row.rightId);
        const cite=(memory,value)=>memory&&memory.state==="active"&&!confidential.test(memory.content)?{
          sourceKind:memory.sourceKind,sourceId:memory.sourceId,
          excerpt:(()=>{const at=memory.content.toLowerCase().indexOf(String(value).toLowerCase());return memory.content.slice(Math.max(0,at<0?0:at-100),Math.min(memory.content.length,(at<0?0:at)+String(value).length+100));})()
        }:null;
        return {...row,leftSource:cite(left,row.leftValue),rightSource:cite(right,row.rightValue),
          verdict:"unresolved-conflict",confirmed:false,requiresReview:true};
      }).filter(row=>row.leftSource&&row.rightSource);
  });
}
export function traceAnswerClaims(answer,results,{maxClaims=12}={}){
  const clauses=String(answer||"").split(/(?<=[.!?])\s+|[;\n]+/u).map(x=>x.trim()).filter(x=>x.length>8).slice(0,maxClaims);
  const sourceRecords=(Array.isArray(results)?results:[])
    .filter(x=>typeof x?.content==="string"&&!confidential.test(x.content));
  return {claims:clauses.map(claim=>{
    const top=sourceRecords.map(source=>({id:source.id,sourceKind:source.sourceKind,
      sourceId:source.sourceId,overlap:intersections(claim,source.content),verified:!!source.verified}))
      .sort((a,b)=>b.overlap-a.overlap).slice(0,3);
    return {text:claim,sources:top.filter(x=>x.overlap>=.25),
      support:"unverified-lexical-association",requiresValidation:true};
  }),note:"Citations are retrieval pointers, not proof of factual entailment"};
}
export function evaluateAnswerContext(query,answer,results){
  const completeness=checkRetrievalCompleteness(query,results);
  const audit=auditAnswerEvidence(answer,results);
  const traces=traceAnswerClaims(answer,results);
  const negatives=contraryEvidenceCandidates(query);
  return {completeness,audit,traces,negativeCandidates:negatives,
    needMoreEvidence:completeness.shouldRetry||traces.claims.some(x=>!x.sources.length)||negatives.length>0,
    decision:"Never assert a fact solely on the basis of memory retrieval scores"};
}
