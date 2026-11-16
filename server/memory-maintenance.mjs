/**
 * CORE v3 bounded, resumable background maintenance.
 * Local jobs never change verified facts. Optional configured embeddings use
 * a separate bounded background timer. USB-safe SQLite transactions.
 */
import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {join} from "node:path";
import {compareDirectory} from "../scripts/auto-compare-contracts.mjs";
import {withCoreDatabase} from "./core-db.mjs";
import {embeddingConfigured,indexMissingEmbeddings} from "./memory-provider.mjs";
import {inspectSourceFacts,researchEntities} from "./memory-intelligence.mjs";
import {normalizeMemory} from "./memory-store.mjs";
import {indexUniversalGraph} from "./universal-memory-graph.mjs";
import {maybeRecordMemoryHealth} from "./memory-v5-health.mjs";
import {consolidateCompletedTasks} from "./memory-v7-experience.mjs";
import {consolidateExperienceV11} from "./memory-v11-learning.mjs";
import {scheduleMemoryJob,runMemoryJob,recoverInterruptedJobs} from "./memory-v8-operations.mjs";

const stamp=()=>new Date().toISOString();
function loadJob(db,name){
  const state=db.prepare("SELECT cursor FROM memory_jobs WHERE name=?").get(name);
  return Number(state?.cursor||0);
}
function checkpoint(db,name,cursor,result){
  db.prepare("INSERT INTO memory_jobs(name,cursor,last_run,last_result,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET cursor=excluded.cursor,last_run=excluded.last_run,last_result=excluded.last_result,updated_at=excluded.updated_at")
    .run(name,String(cursor),stamp(),JSON.stringify(result),stamp());
}
export function consolidateStep({batch=40}={}){
  const size=Math.min(100,Math.max(1,Number(batch)||40));
  return withCoreDatabase(db=>{
    db.exec("BEGIN IMMEDIATE");
    try{
      const cursor=loadJob(db,"facts-and-entities");
      let rows=db.prepare("SELECT rowid AS position,id,content FROM memory_entries WHERE rowid>? ORDER BY rowid LIMIT ?").all(cursor,size);
      let wrapped=false;
      if(!rows.length && cursor>0){
        rows=db.prepare("SELECT rowid AS position,id,content FROM memory_entries ORDER BY rowid LIMIT ?").all(size);
        wrapped=true;
      }
      const insert=db.prepare("INSERT OR IGNORE INTO memory_entities(id,memory_id,entity_type,display_name,normalized_name,offset,verified) VALUES(?,?,?,?,?,?,0)");
      let facts=0,conflicts=0,entities=0;
      for(const row of rows){
        const extracted=inspectSourceFacts(db,row.id);
        facts+=extracted.created;conflicts+=extracted.conflicts;
        for(const entity of researchEntities(row.content)){
          const value=insert.run(randomUUID(),row.id,entity.kind,entity.value,entity.normalized,entity.offset);
          entities+=value.changes;
        }
      }
      const next=rows.at(-1)?.position??(wrapped?0:cursor);
      const result={processed:rows.length,facts,conflicts,entities,wrapped};
      checkpoint(db,"facts-and-entities",next,result);
      db.exec("COMMIT");
      return result;
    }catch(error){db.exec("ROLLBACK");throw error;}
  });
}
export function summarizeConversation({conversationId="default",maxMessages=100}={}){
  const limit=Math.min(200,Math.max(4,Number(maxMessages)||100));
  return withCoreDatabase(db=>{
    db.exec("BEGIN IMMEDIATE");
    try{
      const messages=db.prepare("SELECT id,role,content,created_at FROM messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT ?").all(conversationId,limit).reverse();
      const users=messages.filter(m=>m.role==="user");
      if(users.length<4){db.exec("COMMIT");return {created:false,reason:"insufficient history"};}
      const first=messages[0].id,last=messages.at(-1).id;
      const exists=db.prepare("SELECT id FROM memory_summaries WHERE conversation_id=? AND source_from=? AND source_to=?").get(conversationId,first,last);
      if(exists){db.exec("COMMIT");return {created:false,id:exists.id,reason:"already summarized"};}
      // Deterministic extractive summary: only original user turns, never invented facts.
      const excerpts=users.slice(-25).map(row=>({messageId:row.id,quote:row.content.slice(0,230)}));
      const data=JSON.stringify({kind:"source-preserving-excerpts",conversationId,excerpts});
      const id=randomUUID();
      db.prepare("INSERT INTO memory_summaries(id,conversation_id,source_from,source_to,summary,source_count,created_at) VALUES(?,?,?,?,?,?,?)")
        .run(id,conversationId,first,last,data,users.length,stamp());
      checkpoint(db,"summary:"+conversationId,last,{summarized:users.length});
      db.exec("COMMIT");
      return {created:true,id,sourceCount:users.length};
    }catch(error){db.exec("ROLLBACK");throw error;}
  });
}
export function memoryMaintenanceStatus(){
  return withCoreDatabase(db=>({
    jobs:db.prepare("SELECT name,cursor,last_run AS lastRun,last_result AS lastResult FROM memory_jobs ORDER BY name").all(),
    pendingFacts:db.prepare("SELECT COUNT(*) AS n FROM memory_facts WHERE review_state='candidate'").get().n,
    pendingConflicts:db.prepare("SELECT COUNT(*) AS n FROM memory_conflicts WHERE review_state='pending'").get().n,
    entities:db.prepare("SELECT COUNT(*) AS n FROM memory_entities").get().n,
    summaries:db.prepare("SELECT COUNT(*) AS n FROM memory_summaries").get().n
  }));
}
/** Diagnostics only; "quality" refers to search retrieval, not factual truth. */
export function evaluateRetrieval(cases,retrieve){
  if(!Array.isArray(cases)||typeof retrieve!=="function")throw Error("Invalid evaluation arguments");
  const samples=cases.slice(0,50);
  const records=samples.map(test=>{
    if(typeof test.query!=="string"||typeof test.expectedId!=="string")throw Error("Invalid evaluation case");
    const found=retrieve(test.query).slice(0,20);
    const at=found.findIndex(x=>x.id===test.expectedId);
    return {query:test.query,expectedId:test.expectedId,rank:at<0?null:at+1,found:at>=0};
  });
  const hits=records.filter(x=>x.found).length;
  const mrr=records.reduce((sum,x)=>sum+(x.rank?1/x.rank:0),0)/Math.max(1,records.length);
  return {cases:records.length,recallAt20:records.length?hits/records.length:0,mrr:Number(mrr.toFixed(4)),records};
}
export function recordRetrievalEvaluation(cases,retrieve){
  const report=evaluateRetrieval(cases,retrieve);
  withCoreDatabase(db=>{
    db.exec("BEGIN IMMEDIATE");
    try{
      const insert=db.prepare("INSERT INTO memory_evaluations(id,query,expected_id,rank,found,created_at) VALUES(?,?,?,?,?,?)");
      for(const row of report.records)insert.run(randomUUID(),row.query,row.expectedId,row.rank,row.found?1:0,stamp());
      checkpoint(db,"quality-eval",String(Date.now()),{recallAt20:report.recallAt20,mrr:report.mrr});
      db.exec("COMMIT");
    }catch(error){db.exec("ROLLBACK");throw error;}
  });
  return report;
}
export function startCoreMaintenance({intervalMs=600000,onError=()=>{}}={}){
  let semanticRunning=false;
  let stopped=false;
  // The embedding provider is opt-in. Never block the synchronous SQLite jobs
  // or launch overlapping HTTP batches when a provider is slow.
  const reportError=error=>{try{onError(error);}catch{/* Error reporting must not crash maintenance. */}};
  const semanticTick=async()=>{
    if(stopped||semanticRunning)return;
    semanticRunning=true;
    try{
      // Configuration validation may throw synchronously (e.g. malformed URL).
      // Keep it inside the guarded async job to prevent unhandled rejections.
      if(!embeddingConfigured())return;
      await indexMissingEmbeddings({batch:4});
    }catch(error){reportError(error);}
    finally{semanticRunning=false;}
  };
  // Local contract comparison is automatic while the Yatsumira server runs.
  // Missing USB folders are normal; never create a folder just to scan it.
  const contractDirectory=join(process.cwd(),"Aspksa","Документы","Договоры");
  const contractTick=()=>{
    if(stopped||!existsSync(contractDirectory))return;
    try{
      const result=compareDirectory(contractDirectory);
      if(result.failed)reportError(new Error("Contract comparison failed for "+result.failed+" pair(s)"));
    }catch(error){reportError(error);}
  };
  contractTick();
  const contractTimer=setInterval(contractTick,Math.max(60000,intervalMs));
  contractTimer.unref?.();
  // Recover checkpointed jobs once when the local server starts; no network calls.
  try{recoverInterruptedJobs();}catch(error){reportError(error);}
  const job=()=>{try{
    consolidateStep({batch:35});
    indexUniversalGraph({batch:35});
    summarizeConversation({conversationId:"default",maxMessages:80});
    consolidateCompletedTasks({limit:10});
    consolidateExperienceV11({limit:5});
    maybeRecordMemoryHealth();
    const day=new Date().toISOString().slice(0,10);
    scheduleMemoryJob("graph-audit",{day});
    scheduleMemoryJob("experience-patterns",{day});
    scheduleMemoryJob("v10-link-discovery",{day});
    scheduleMemoryJob("v10-anomaly-review",{day});
    scheduleMemoryJob("v12-experience",{day});
    scheduleMemoryJob("v12-graph-research",{day});
    scheduleMemoryJob("v12-learning-report",{day});
    scheduleMemoryJob("v13-dialogue-reflection",{day});
    runMemoryJob();
  }catch(error){reportError(error);}};
  const timer=setInterval(job,Math.max(60000,intervalMs));
  timer.unref?.();
  // A separate, bounded cadence prevents provider latency from stalling chat.
  const semanticTimer=setInterval(()=>{void semanticTick();},Math.max(60000,intervalMs));
  semanticTimer.unref?.();
  return ()=>{stopped=true;clearInterval(timer);clearInterval(semanticTimer);clearInterval(contractTimer);};
}
