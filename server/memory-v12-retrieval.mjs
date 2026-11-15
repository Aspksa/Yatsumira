/** CORE v12 retrieval experiments and adaptive read-only planning.
 * Approved profiles require labeled regression tests and explicit approval.
 */
import {withCoreDatabase} from "./core-db.mjs";
import {randomUUID} from "node:crypto";
import {memoryTokens,confidential} from "./memory-store.mjs";
import {recallMemory} from "./long-memory.mjs";
import {graphRecall} from "./universal-memory-graph.mjs";
import {sourceAwareOrder} from "./memory-v8-retrieval.mjs";
import {planMemoryQuery} from "./memory-v6-intelligence.mjs";
import {compareMemoryAlgorithms} from "./memory-v8-operations.mjs";
import {feedbackPriority} from "./memory-v12-learning.mjs";
const now=()=>new Date().toISOString();
const safe=(v,max=500)=>{const s=String(v??"").trim();if(!s||s.length>max||confidential.test(s))throw Error("Invalid query");return s;};
export function retrievalPlan(query,{budget=12}={}){
  const original=planMemoryQuery(safe(query));
  const size=Math.max(3,Math.min(30,Math.trunc(budget)||12));
  return {...original,limits:{results:size,hops:original.graph?3:1,maxQueries:original.depth>1?3:1},
    style:original.graph?"hybrid-graph":"lexical-first",costGuard:true};
}
export function adaptiveRecall(query,{limit=8}={}){
  const plan=retrievalPlan(query,{budget:Math.min(30,limit*2)});
  const lexical=recallMemory(query,{limit:plan.limits.results});
  const graph=plan.graph?graphRecall(query,{limit:plan.limits.results,hops:plan.limits.hops}):[];
  const map=new Map();
  for(const [list,bonus] of [[lexical,1],[graph,.75]]){
    for(let i=0;i<list.length;i++){
      const item=list[i];if(!item.id||typeof item.content!=="string"||confidential.test(item.content))continue;
      const prior=map.get(item.id)||{...item,retrievalScore:0};
      prior.retrievalScore+=bonus/(20+i);
      map.set(item.id,prior);
    }
  }
  const results=sourceAwareOrder(query,[...map.values()],{limit:Math.min(30,Math.max(limit*3,12))}).map(x=>({...x,
    searchScore:Number((x.rankScore+x.retrievalScore+feedbackPriority(x.id).boost).toFixed(4)),
    requiresSourceValidation:true})).sort((a,b)=>b.searchScore-a.searchScore||a.id.localeCompare(b.id))
    .slice(0,Math.max(1,Math.min(30,limit)));
  return {plan,results,mode:graph.length?"fts-graph-fusion":"fts-local",noModelRequired:true};
}
export function retrievalProfileProposal({name,weights}){
  const key=safe(name,90),params=weights||{};
  const keys=["lexical","graph","source"];
  if(Object.keys(params).some(x=>!keys.includes(x))||keys.some(k=>!Number.isFinite(params[k])||params[k]<0||params[k]>1))throw Error("Invalid profile");
  const sum=keys.reduce((a,k)=>a+params[k],0);
  if(Math.abs(sum-1)>.001)throw Error("Weights must sum to 1");
  return withCoreDatabase(db=>{
    const existing=db.prepare("SELECT name,state FROM memory_v12_search_profiles WHERE name=?").get(key);
    if(existing)return {name:key,stored:false,state:existing.state};
    db.prepare("INSERT INTO memory_v12_search_profiles(name,params_json,created_at) VALUES(?,?,?)").run(key,JSON.stringify(params),now());
    return {name:key,stored:true,state:"candidate"};
  });
}
export function profileExperiment(cases,{candidate,baseline}={}){
  if(!Array.isArray(cases)||cases.length<2||cases.length>50)throw Error("Require 2–50 labeled cases");
  if(typeof candidate!=="function"||typeof baseline!=="function")throw Error("Retrieval functions required");
  return compareMemoryAlgorithms(cases,baseline,candidate,{name:"v12-retrieval-experiment",persist:true});
}
export function approveRetrievalProfile(name,{evaluation,evidence}={}){
  const key=safe(name,90);
  if(!evaluation?.accepted||evaluation.baseline?.cases<2)throw Error("Passing labeled experiment required");
  safe(evidence,500);
  return withCoreDatabase(db=>{
    const p=db.prepare("SELECT state FROM memory_v12_search_profiles WHERE name=?").get(key);
    if(!p||p.state!=="candidate")throw Error("Pending profile required");
    db.prepare("UPDATE memory_v12_search_profiles SET state='approved' WHERE name=?").run(key);
    db.prepare("INSERT INTO core_events(id,event_type,payload,created_at) VALUES(?,?,?,?)").run(randomUUID(),
      "v12.retrieval_profile_approval",JSON.stringify({name:key,evidence,baseline:evaluation.baseline,candidate:evaluation.candidate}),now());
    return {name:key,state:"approved",automaticallyApplied:false};
  });
}
export function recallQuality(query,records){
  const terms=new Set(memoryTokens(query));
  const list=(Array.isArray(records)?records:[]).filter(x=>typeof x?.content==="string");
  const covered=new Set(list.flatMap(x=>memoryTokens(x.content)));
  const missing=[...terms].filter(term=>![...covered].some(x=>x.startsWith(term.slice(0,5))||term.startsWith(x.slice(0,5))));
  return {count:list.length,missingTerms:missing,coverage:terms.size?(terms.size-missing.length)/terms.size:0,
    status:"lexical-coverage-only-not-entailment"};
}
