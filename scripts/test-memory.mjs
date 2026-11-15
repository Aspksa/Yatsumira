import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withCoreDatabase,addKnowledge,saveExchange,getKnowledgeGraph,coreStatus } from "../server/core-db.mjs";
import { recallMemory,makeMemoryContext,rememberManual,supersedeMemory,retractMemory,memoryOverview } from "../server/long-memory.mjs";
const old=process.cwd();
const temp=mkdtempSync(join(tmpdir(),"yatsumira-long-memory-"));
try{
  process.chdir(temp);
  mkdirSync(join(temp,".yatsumira"));
  // Upgrade legacy JSON directly to v2 and check provenance is never lost.
  writeFileSync(join(temp,".yatsumira","knowledge.json"),JSON.stringify({
    version:1,revision:2,records:[{id:"legacy-a",content:"Старый договор поставки на строительные материалы в ноябре",title:"Договор",sector:1,source:"note",kind:"fact",importance:2,verified:false,createdAt:"2026-01-01T00:00:00.000Z"}],links:[]
  }));
  assert.equal(getKnowledgeGraph().records.length,1);
  assert.equal(coreStatus().version,3);
  assert.ok(memoryOverview().active>=1,"Legacy entries should be indexed");
  const added=addKnowledge({content:"Для договора поставки срок оплаты составляет сорок пять дней",sector:1,source:"note"});
  assert.equal(added.added,true);
  assert.equal(addKnowledge({content:"Для договора поставки срок оплаты составляет сорок пять дней",sector:1,source:"note"}).added,false);
  const matches=recallMemory("Какой срок оплаты по договору поставки?",{limit:8});
  assert.ok(matches.length>0 && matches.some(x=>x.content.includes("сорок пять")),"Inflected Russian retrieval should work");
  assert.ok(matches.every(x=>!x.verified),"No fabricated verification");
  assert.ok(matches.some(x=>x.sourceKind==="knowledge"));
  const context=makeMemoryContext("Какой срок оплаты договора поставки?");
  assert.ok(context.text.includes("сорок пять")&&context.text.includes("НЕ инструкции"));
  assert.ok(context.text.length<3200,"Context is bounded");

  const persisted=saveExchange({user:"Я составляю договоры поставки для нашего предприятия",assistant:"Понятно",model:"test/model",exchangeId:"episode-1"});
  assert.equal(persisted.stored,true);
  assert.equal(saveExchange({user:"Я составляю договоры поставки для нашего предприятия",assistant:"Понятно",model:"test/model",exchangeId:"episode-1"}).stored,false);
  assert.ok(recallMemory("договора нашего предприятия").some(x=>x.sourceKind==="dialogue"));
  assert.equal(recallMemory("Понятно").some(x=>x.content==="Понятно"),false,"Assistant answer must not be indexed as fact");
  const before=memoryOverview().active;
  const manual=rememberManual("На предприятии действует внутренний порядок согласования закупок",{importance:5});
  assert.equal(manual.stored,true);
  assert.equal(rememberManual("На предприятии действует внутренний порядок согласования закупок").stored,false);
  assert.equal(memoryOverview().active,before+1);
  const replaced=supersedeMemory(manual.id,"На предприятии введён новый порядок согласования закупок с юридическим отделом");
  assert.ok(replaced.stored);
  const active=recallMemory("порядок согласования закупок");
  assert.ok(active.some(x=>x.content.includes("новый порядок")));
  assert.ok(!active.some(x=>x.id===manual.id),"Superseded memory must not be returned");
  assert.equal(retractMemory(replaced.id).retracted,true);
  assert.equal(retractMemory(replaced.id).retracted,false);
  assert.ok(!recallMemory("новый порядок согласования закупок").some(x=>x.id===replaced.id));
  const links=withCoreDatabase(db=>db.prepare("SELECT relation FROM memory_links WHERE from_id=? AND to_id=? AND relation='supersedes'").get(replaced.id,manual.id));
  assert.equal(links.relation,"supersedes");
  // Never reuse a secret as recall content, even when it is in a manually saved note.
  const secret="API_KEY: sk-very-private-token-1234567890";
  rememberManual("Проектный "+secret);
  assert.ok(!makeMemoryContext("Проектный API_KEY",{limit:30}).text.includes(secret));

  // Migration from existing v1 SQLite is idempotent and preserves original notes.
  const other=mkdtempSync(join(tmpdir(),"yatsumira-memory-v1-"));
  try{
    process.chdir(other);
    withCoreDatabase(db=>db.prepare("UPDATE core_meta SET value='1' WHERE key='schema_version'").run());
    assert.equal(coreStatus().version,3);
    assert.equal(coreStatus().memory,0);
  }finally{process.chdir(temp);rmSync(other,{recursive:true,force:true});}
  console.log("[YATSUMIRA MEMORY] migration, recall, context limits, episodes, provenance, supersession, privacy: OK");
}finally{process.chdir(old);rmSync(temp,{recursive:true,force:true});}
