/**
 * CORE v3 analytical memory. Conservative deterministic extraction:
 * all claims are candidates until externally verified by the user.
 * Never interpret text commands as executable instructions.
 */
import {randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {memoryTokens,normalizeMemory} from "./memory-store.mjs";
const now=()=>new Date().toISOString();
const clean=x=>normalizeMemory(x).slice(0,120);
export function extractCandidates(text){
  const input=String(text||"").slice(0,4000);
  const results=[];
  const templates=[
    {predicate:"payment_days",re:/(?:срок\s+оплаты|оплата\s+через)\s*(?:составляет\s*)?(\d{1,4})\s*(?:календарных\s+|рабочих\s+)?дн(?:ей|я|ь)/giu},
    {predicate:"payment_days",re:/срок\s+оплаты\s*(?:составляет\s*)?(тридцать|сорок\s+пять|шестьдесят)\s+дн(?:ей|я|ь)/giu},
    {predicate:"contract_amount",re:/(?:стоимость|сумма)\s+(?:договора|контракта)\s*(?:составляет\s*)?([\d\s]{2,20})\s*(?:руб|₽)/giu},
    {predicate:"deadline",re:/(?:срок\s+исполнения|срок\s+поставки)\s*(?:до|:)?\s*(\d{2}\.\d{2}\.\d{4})/giu}
  ];
  const wordNumber={"тридцать":"30","сорок пять":"45","шестьдесят":"60"};
  for(const template of templates){
    for(const match of input.matchAll(template.re)){
      const raw=match[1]?.trim();
      if(!raw)continue;
      const object=wordNumber[clean(raw)]||raw.replace(/\s+/g,"");
      const before=input.slice(Math.max(0,match.index-170),match.index);
      const title=before.match(/(?:договор(?:а|у|ом)?|контракт(?:а|у|ом)?)\s+(?:№\s*)?([\wА-Яа-я-]{2,40})/iu);
      // No guessed contract identity: unscoped claims are kept separate by source.
      const subject=title?"contract:"+clean(title[1]):"source";
      results.push({subject,predicate:template.predicate,object,excerpt:match[0].slice(0,250),confidence:subject==="source"?.42:.65});
    }
  }
  return results.slice(0,12);
}
export function inspectSourceFacts(db,memoryId){
  const memory=db.prepare("SELECT id,content,state,valid_from FROM memory_entries WHERE id=?").get(memoryId);
  if(!memory||memory.state!=="active")return {created:0,conflicts:0};
  const candidates=extractCandidates(memory.content),stamp=now();
  const add=db.prepare("INSERT OR IGNORE INTO memory_facts(id,memory_id,subject,predicate,object,valid_from,confidence,review_state,created_at) VALUES(?,?,?,?,?,?,?,'candidate',?)");
  const records=db.prepare("SELECT id,object,valid_to FROM memory_facts WHERE subject=? AND predicate=? AND memory_id<>? AND review_state<>'rejected'");
  const conflict=db.prepare("INSERT OR IGNORE INTO memory_conflicts(id,left_fact,right_fact,reason,created_at) VALUES(?,?,?,?,?)");
  let created=0,conflicts=0;
  for(const item of candidates){
    // Prevent incorrect conflict creation across unrelated unidentified contracts.
    const subject=item.subject==="source"?"source:"+memoryId:item.subject;
    const id=randomUUID();
    const res=add.run(id,memoryId,subject,item.predicate,item.object,memory.valid_from,item.confidence,stamp);
    if(!res.changes)continue;
    created++;
    if(item.subject==="source")continue;
    for(const previous of records.all(subject,item.predicate,memoryId)){
      if(previous.object===item.object||previous.valid_to)continue;
      const pair=[previous.id,id].sort();
      conflict.run(randomUUID(),pair[0],pair[1],"Different values for same identified contract field; requires review",stamp);
      conflicts++;
    }
  }
  return {created,conflicts};
}
export function inspectPendingFacts({limit=50}={}){
  return withCoreDatabase(db=>db.prepare("SELECT f.id,f.subject,f.predicate,f.object,f.confidence,m.source_kind AS sourceKind,m.source_id AS sourceId FROM memory_facts f JOIN memory_entries m ON m.id=f.memory_id WHERE f.review_state='candidate' AND m.state='active' ORDER BY f.created_at LIMIT ?").all(Math.min(200,Math.max(1,Number(limit)||50))));
}
export function pendingConflicts({limit=50}={}){
  return withCoreDatabase(db=>db.prepare("SELECT c.id,c.reason,c.review_state,l.subject,l.predicate,l.object AS priorValue,r.object AS otherValue FROM memory_conflicts c JOIN memory_facts l ON l.id=c.left_fact JOIN memory_facts r ON r.id=c.right_fact WHERE c.review_state='pending' LIMIT ?").all(Math.min(200,Math.max(1,Number(limit)||50))));
}
export function memoryNeighbors(id,{limit=12}={}){
  return withCoreDatabase(db=>db.prepare("SELECT e.id,e.content,e.source_kind AS sourceKind,l.relation,l.score FROM memory_links l JOIN memory_entries e ON e.id=CASE WHEN l.from_id=? THEN l.to_id ELSE l.from_id END WHERE (l.from_id=? OR l.to_id=?) AND e.state='active' ORDER BY l.score DESC LIMIT ?").all(id,id,id,Math.min(100,Math.max(1,limit))));
}
export function researchEntities(text){
  const input=String(text||"").slice(0,4000),found=[];
  const patterns=[
    ["contract",/(?:договор|контракт)\s*(?:№\s*)?([A-Za-zА-Яа-я0-9/-]{3,35})/giu],
    ["organization",/(?:ООО|АО|ПАО)\s*[«"]([^»"]{3,100})[»"]/giu],
    ["person",/(?:сотрудник|директор|руководитель)\s+([А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ][а-яё]{2,})/gu]
  ];
  for(const [kind,re] of patterns)for(const match of input.matchAll(re)){
    found.push({kind,value:match[1],normalized:clean(match[1]),offset:match.index,verified:false});
  }
  return found.slice(0,20);
}

/** Logical multi-tier memory view without copying sensitive content across tables. */
export function memoryLayers(){
  return withCoreDatabase(db=>{
    const rows=db.prepare("SELECT source_kind,importance,state,content FROM memory_entries").all();
    const counts={working:0,episodic:0,semantic:0,procedural:0,archive:0};
    for(const row of rows){
      if(row.state!=="active"){counts.archive++;continue;}
      if(row.source_kind==="dialogue"){counts.episodic++;continue;}
      if(/(?:^|[^\p{L}])(?:порядок|процедур|инструкц|алгоритм|регламент|правило|шаг)[\p{L}]*/iu.test(row.content)){
        counts.procedural++;continue;
      }
      if(row.importance>=2){counts.semantic++;continue;}
      counts.working++;
    }
    const summaries=db.prepare("SELECT COUNT(*) AS n FROM memory_summaries").get().n;
    return {counts,conversationSummaries:summaries,policy:"classifications are heuristic, not verified facts"};
  });
}
