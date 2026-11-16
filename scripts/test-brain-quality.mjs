import test from "node:test";
import assert from "node:assert/strict";
import {chunkDocument,evaluateLabeledRetrieval,compareRetrievalEvaluations} from "../server/brain-quality.mjs";

test("long Cyrillic document chunks preserve every character, source and ordering",()=>{
  const input=("Раздел 1. Срок оплаты составляет 30 рабочих дней.\n").repeat(220);
  const chunks=chunkDocument(input,{maxChars:500,overlap:50,sourceId:"Договор-12"});
  assert.ok(chunks.length>10);
  assert.equal(chunks[0].start,0);
  assert.equal(chunks.at(-1).end,input.length);
  for(let i=0;i<chunks.length;i++){
    const c=chunks[i];
    assert.equal(c.content,input.slice(c.start,c.end));
    assert.equal(c.index,i);
    assert.equal(c.previousIndex,i?i-1:null);
    assert.equal(c.nextIndex,i+1<chunks.length?i+1:null);
    if(i)assert.ok(c.start<=chunks[i-1].end);
    assert.equal(c.sourceId,"Договор-12");
  }
  assert.equal(chunkDocument(input,{maxChars:500,overlap:50,sourceId:"Договор-12"})[0].id,chunks[0].id);
});
test("labeled retrieval gate rejects a worse ranking and does not apply changes",()=>{
  const cases=Array.from({length:5},(_,i)=>({query:"вопрос "+i,expectedIds:["source-"+i]}));
  const good=evaluateLabeledRetrieval(cases,q=>[{id:"source-"+q.split(" ")[1]}],{topK:2});
  const bad=evaluateLabeledRetrieval(cases,()=>[{id:"unrelated"}],{topK:2});
  assert.equal(good.hitRate,1);
  assert.equal(good.mrr,1);
  assert.equal(compareRetrievalEvaluations(good,bad).accepted,false);
  assert.equal(compareRetrievalEvaluations(bad,good).automaticallyApplied,false);
  assert.throws(()=>chunkDocument("test",{maxChars:100}));
});
