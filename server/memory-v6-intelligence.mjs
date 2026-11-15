/**
 * CORE v6: bounded and evidence-grounded analysis, hypotheses, ontologies,
 * reflections, source-preserving representations and retrieval planning.
 * All generative-looking outcomes are explicit candidates, never verified facts.
 */
import {randomUUID,createHash} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {memoryTokens,normalizeMemory,confidential} from "./memory-store.mjs";
import {recallMemory} from "./long-memory.mjs";
import {graphRecall,graphPath,graphClaims} from "./universal-memory-graph.mjs";
import {personalizedGraphRank,auditAnswerEvidence,checkRetrievalCompleteness,topicCommunities} from "./memory-v5-reasoning.mjs";
import {hypotheticalCausalLinks} from "./memory-v5-reasoning.mjs";
const now=()=>new Date().toISOString();
const bounded=(v,max=600)=>String(v??"").trim().slice(0,max);
const ensure=(v,max=600)=>{
  const value=bounded(v,max);
  if(!value||confidential.test(value))throw Object.assign(new Error("Empty or sensitive input"),{status:400});
  return value;
};
const transaction=fn=>withCoreDatabase(db=>{
  db.exec("BEGIN IMMEDIATE");
  try{const result=fn(db);db.exec("COMMIT");return result;}
  catch(error){db.exec("ROLLBACK");throw error;}
});
export function planMemoryQuery(query,{effort="auto"}={}){
  const text=ensure(query,500);
  const tokens=memoryTokens(text);
  const compound=/(?:^|[^\p{L}])(?:и|или|а также|and|or|compare|сравни|между|почему|причин)/iu.test(text);
  const temporal=/(?:^|[^\p{L}])(?:когда|раньше|теперь|изменил|истори|date|before|after|202\d)/iu.test(text);
  const graph=/(?:^|[^\p{L}])(?:связан|зависит|отношен|через|влияет|graph|relationship)/iu.test(text);
  const depth=effort==="deep"||effort==="auto"&&(compound||tokens.length>12)?3:1;
  const strategies=["fts5","subword",...(graph?["graph","pagerank"]:[]),...(temporal?["temporal"]:[])];
  return {query:text,depth,strategies,compound,temporal,graph,
    requiresExternalModel:false,costBudget:{maxQueries:Math.min(6,depth*2),maxSources:25}};
}
export function expandMemoryQueries(query,{limit=5}={}){
  const base=ensure(query,500),parts=base.split(/\s+(?:и|а также|and|или|or)\s+|[,;]+/iu)
    .map(x=>x.trim()).filter(x=>x.length>=3);
  const normalized=normalizeMemory(base);
  const aliases={"ии":"ai","ai":"ии","автомобиль":"car","car":"автомобиль","проект":"project","project":"проект","память":"memory","memory":"память","граф":"graph","graph":"граф"};
  const expansions=[base,...parts];
  for(const word of memoryTokens(normalized)){
    if(aliases[word])expansions.push(normalized.replace(new RegExp("(^| )"+word+"(?= |$)","u"),"$1"+aliases[word]));
  }
  return [...new Set(expansions)].slice(0,Math.max(1,Math.min(8,limit)));
}
export function analyzeMemoryQuestion(query,{limit=8}={}){
  const plan=planMemoryQuery(query);
  const variants=expandMemoryQueries(query,{limit:plan.costBudget.maxQueries});
  const ids=new Map(),paths=[];
  for(const q of variants){
    const lexical=recallMemory(q,{limit:20});
    const graph=graphRecall(q,{limit:10,hops:3});
    const ranked=plan.graph?personalizedGraphRank(q,{limit:10}):[];
    for(const [items,weight,method] of [[lexical,1,"lexical"],[graph,.85,"graph"],[ranked,.8,"pagerank"]]){
      items.forEach((item,i)=>{
        const current=ids.get(item.id)||{...item,rankScore:0,methods:new Set(),supportingQueries:new Set()};
        current.rankScore+=weight/(60+i+1);
        current.methods.add(method);current.supportingQueries.add(q);
        ids.set(item.id,current);
      });
    }
  }
  const results=[...ids.values()].sort((a,b)=>b.rankScore-a.rankScore).slice(0,Math.min(25,Math.max(1,limit)))
    .map(x=>({...x,rankScore:Number(x.rankScore.toFixed(6)),methods:[...x.methods],supportingQueries:[...x.supportingQueries]}));
  const coverage=checkRetrievalCompleteness(query,results,{minResults:2});
  return {plan,variants,results,coverage,
    nextStep:coverage.shouldRetry?"Need more source evidence or a revised search":"Review source citations before concluding",
    confidenceClass:results.length===0?"unknown":coverage.shouldRetry?"partial":"retrieval-only"};
}
export function proposeHypothesis({claim,kind="hypothesis",memoryIds=[],opposingIds=[]}={}){
  if(!["hypothesis","analogy","counterfactual","question","causal"].includes(kind))throw Object.assign(new Error("Unknown hypothesis type"),{status:400});
  const sentence=ensure(claim,800),supports=[...new Set(memoryIds)],opposes=[...new Set(opposingIds)];
  if(supports.some(id=>opposes.includes(id)))throw Object.assign(new Error("Evidence cannot have both stances"),{status:400});
  return transaction(db=>{
    const existing=db.prepare("SELECT id FROM memory_entries WHERE id=? AND state='active'");
    for(const id of [...supports,...opposes])if(!existing.get(id))throw Object.assign(new Error("Evidence memory not found"),{status:404});
    const id=randomUUID();
    const confidence=Math.min(.7,Math.max(.05,.2+.1*supports.length-.12*opposes.length));
    db.prepare("INSERT INTO memory_hypotheses(id,claim,kind,confidence,created_at) VALUES(?,?,?,?,?)").run(id,sentence,kind,confidence,now());
    const add=db.prepare("INSERT INTO memory_hypothesis_evidence(hypothesis_id,memory_id,stance) VALUES(?,?,?)");
    for(const memoryId of supports)add.run(id,memoryId,"supports");
    for(const memoryId of opposes)add.run(id,memoryId,"opposes");
    return {id,kind,confidence,verified:false,supportCount:supports.length,oppositionCount:opposes.length};
  });
}
export function examineHypothesis(id){
  return withCoreDatabase(db=>{
    const hypothesis=db.prepare("SELECT * FROM memory_hypotheses WHERE id=?").get(id);
    if(!hypothesis)throw Object.assign(new Error("Hypothesis not found"),{status:404});
    const evidence=db.prepare("SELECT e.stance,m.id AS memoryId,m.source_kind AS sourceKind,m.source_id AS sourceId,m.verified,m.state FROM memory_hypothesis_evidence e JOIN memory_entries m ON m.id=e.memory_id WHERE e.hypothesis_id=? ORDER BY e.stance,m.id").all(id);
    const supports=evidence.filter(x=>x.stance==="supports"&&x.state==="active").length;
    const opposes=evidence.filter(x=>x.stance==="opposes"&&x.state==="active").length;
    return {id,claim:hypothesis.claim,kind:hypothesis.kind,status:hypothesis.status,
      supportCount:supports,oppositionCount:opposes,evidence,
      verdict:supports===0?"no-evidence":opposes>0?"contested":"unverified",
      verified:false};
  });
}
export function openKnowledgeQuestions(query){
  const report=analyzeMemoryQuestion(query,{limit:12});
  const missing=report.coverage.uncoveredTerms;
  const questions=missing.length?missing.slice(0,4).map(x=>"Какой проверяемый источник описывает «"+x+"»?"):
    report.results.length<2?["Какие независимые источники подтверждают эту информацию?"]:
    ["Есть ли более свежие сведения, меняющие вывод?"];
  return {questions,sourceCount:report.results.length,mayNeedFurtherEvidence:true};
}
export function detectGraphAnomalies({limit=50}={}){
  return withCoreDatabase(db=>{
    const dangling=db.prepare("SELECT n.id,n.label FROM graph_nodes n WHERE NOT EXISTS(SELECT 1 FROM graph_assertions a WHERE a.subject_id=n.id OR a.object_id=n.id) AND NOT EXISTS(SELECT 1 FROM memory_hyperedge_nodes h WHERE h.node_id=n.id) LIMIT ?").all(Math.min(100,limit));
    const loops=db.prepare("SELECT id,memory_id AS memoryId FROM graph_assertions WHERE subject_id=object_id LIMIT ?").all(Math.min(100,limit));
    const duplicateTypes=db.prepare("SELECT normalized_label,COUNT(DISTINCT node_type) AS types FROM graph_nodes GROUP BY normalized_label HAVING types>1 LIMIT ?").all(Math.min(100,limit));
    return {isolatedNodes:dangling,selfLoops:loops,ambiguousNodeTypes:duplicateTypes,
      status:"diagnostics-not-proof-of-error"};
  });
}
export function proposeOntologyType(type,{parentType=null}={}){
  const value=ensure(type,50).toLowerCase().replace(/\s+/g,"_");
  if(!/^[\p{L}\p{N}_-]+$/u.test(value))throw Object.assign(new Error("Invalid ontology type"),{status:400});
  return transaction(db=>{
    if(parentType&&!db.prepare("SELECT type_name FROM memory_ontology_types WHERE type_name=?").get(parentType))
      throw Object.assign(new Error("Parent type missing"),{status:404});
    const r=db.prepare("INSERT OR IGNORE INTO memory_ontology_types(type_name,parent_type,state,created_at) VALUES(?,?,'candidate',?)").run(value,parentType,now());
    return {type:value,stored:!!r.changes,reviewed:false};
  });
}
export function memoryReflection(memoryId,{mode="reflection"}={}){
  if(!["reflection","summary","distillation"].includes(mode))throw Object.assign(new Error("Invalid representation"),{status:400});
  return transaction(db=>{
    const record=db.prepare("SELECT content,source_kind,state,verified FROM memory_entries WHERE id=?").get(memoryId);
    if(!record||record.state!=="active")throw Object.assign(new Error("Memory not found"),{status:404});
    if(confidential.test(record.content))throw Object.assign(new Error("Sensitive memory refused"),{status:400});
    const text=record.content.trim();
    const segments=text.split(/(?<=[.!?])\s+/u).filter(Boolean);
    const extracts=segments.slice(0,mode==="distillation"?2:5).map(s=>s.slice(0,220));
    const safe=JSON.stringify({kind:mode,extractive:true,sourceId:memoryId,
      excerpts:extracts,sourceKind:record.source_kind,verification:"original-only"});
    db.prepare("INSERT INTO memory_representations(memory_id,representation_kind,content,verified,created_at) VALUES(?,?,?,0,?) ON CONFLICT(memory_id,representation_kind) DO UPDATE SET content=excluded.content,verified=0,created_at=excluded.created_at").run(memoryId,mode,safe,now());
    return {memoryId,mode,sourceCount:1,verified:false,extractive:true};
  });
}
export function retrievalTrustScore(records){
  return (Array.isArray(records)?records:[]).map(row=>{
    const confidence=Math.max(0,Math.min(1,Number(row.confidence)||0));
    const score=.15+.35*confidence+(row.verified?.35:0);
    return {...row,trustScore:Number(Math.min(.85,score).toFixed(3)),
      trustStatus:row.verified?"source-marked-verified":"unverified",
      note:"Heuristic trust priority, never proof of truth"};
  });
}
export function ageAwarePriority(record,{asOf=Date.now(),halfLifeDays=365}={}){
  const created=Date.parse(record?.createdAt||record?.created_at||"");
  const days=Number.isFinite(created)?Math.max(0,(asOf-created)/86400000):0;
  return Math.exp(-Math.LN2*days/Math.max(1,halfLifeDays));
}
export function recordMemorySnapshot(label="manual"){
  return transaction(db=>{
    const memories=db.prepare("SELECT id,content_hash,state FROM memory_entries ORDER BY id").all();
    const assertions=db.prepare("SELECT id,review_state FROM graph_assertions ORDER BY id").all();
    const checksum=createHash("sha256").update(JSON.stringify({memories,assertions})).digest("hex");
    const id=randomUUID();
    db.prepare("INSERT INTO memory_snapshots(id,revision_label,knowledge_count,assertion_count,checksum,created_at) VALUES(?,?,?,?,?,?)")
      .run(id,ensure(label,80),memories.length,assertions.length,checksum,now());
    return {id,memories:memories.length,assertions:assertions.length,checksum,
      note:"Logical manifest only; create a separate verified SQLite backup for physical restore"};
  });
}
