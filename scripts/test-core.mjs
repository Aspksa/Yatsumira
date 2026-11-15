import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  coreDatabasePath,getKnowledgeGraph,addKnowledge,saveExchange,
  recentMessages,searchCore,coreStatus,withCoreDatabase
} from "../server/core-db.mjs";
import {validateChatMessages,commitAssistantExchange} from "../server/core-engine.mjs";

const prior=process.cwd();
const root=mkdtempSync(join(tmpdir(),"yatsumira-core-test-"));
try {
  process.chdir(root);
  const dir=join(root,".yatsumira");
  mkdirSync(dir);
  const old={
    version:1,revision:14,
    records:[
      {id:"old-1",title:"Старый договор",content:"Договор поставки срок оплаты",sector:1,kind:"fact",importance:2,source:"note",verified:false,createdAt:"2026-11-01T00:00:00.000Z"},
      {id:"old-2",title:"Поставка",content:"Договор поставки условия оплаты",sector:1,kind:"fact",importance:1,source:"chat",verified:false,createdAt:"2026-11-02T00:00:00.000Z"}
    ],
    links:[{source:"old-2",target:"old-1",kind:"shared-terms",strength:3}]
  };
  const legacyText=JSON.stringify(old,null,2);
  writeFileSync(join(dir,"knowledge.json"),legacyText,"utf8");
  const migrated=getKnowledgeGraph();
  assert.equal(migrated.revision,14);
  assert.equal(migrated.records.length,2);
  assert.equal(migrated.links.length,1);
  assert.equal(migrated.records[0].id,"old-1");
  assert.equal(readFileSync(join(dir,"knowledge.json"),"utf8"),legacyText,"Legacy backup must be untouched");
  assert.ok(existsSync(coreDatabasePath()));
  assert.equal(getKnowledgeGraph().records.length,2,"Restart does not duplicate imported records");

  const added=addKnowledge({content:"Договор поставки на склад с оплатой через 14 дней",sector:1,source:"note"});
  assert.equal(added.added,true);
  assert.equal(added.records.length,3);
  assert.ok(added.links.length>=2);
  const again=addKnowledge({content:"Договор поставки на склад с оплатой через 14 дней",sector:1,source:"note"});
  assert.equal(again.added,false);
  assert.equal(again.records.length,3);
  assert.equal(again.revision,15);
  assert.throws(()=>addKnowledge({content:""}),/Текст/);
  assert.equal(getKnowledgeGraph().records.length,3);

  assert.ok(validateChatMessages([{role:"user",content:"Привет"}]));
  assert.equal(validateChatMessages([{role:"assistant",content:"Привет"}]),false);
  const payload={messages:[{role:"user",content:"Привет"}],answer:"Здравствуйте",model:"test/model",sessionId:"default",requestId:"req-one"};
  assert.equal(commitAssistantExchange(payload).stored,true);
  assert.equal(commitAssistantExchange(payload).stored,false,"Retry must be idempotent");
  assert.throws(()=>saveExchange({user:"Привет",assistant:"Другой ответ",model:"test/model",exchangeId:"req-one"}),/Conflicting/);
  assert.equal(recentMessages().length,2,"Atomic write always saves user and assistant together");
  assert.deepEqual(recentMessages().map(m=>m.role),["user","assistant"]);
  assert.throws(()=>saveExchange({user:"",assistant:"ответ",model:"x"}),/Invalid/);
  assert.equal(recentMessages().length,2,"Failed validation does not mutate dialogue");

  assert.ok(searchCore("поставки").length>=2);
  assert.deepEqual(searchCore(""),[]);
  const status=coreStatus();
  assert.deepEqual({version:status.version,storage:status.storage,knowledge:status.knowledge,
    conversations:status.conversations,messages:status.messages},
    {version:12,storage:"sqlite",knowledge:3,conversations:1,messages:2});
  const foreignKey=withCoreDatabase(db=>db.prepare("PRAGMA foreign_keys").get().foreign_keys);
  assert.equal(foreignKey,1);

  // A bad legacy backup must block import rather than silently replace old knowledge.
  const broken=mkdtempSync(join(tmpdir(),"yatsumira-core-bad-"));
  try {
    process.chdir(broken);mkdirSync(join(broken,".yatsumira"));
    writeFileSync(join(broken,".yatsumira","knowledge.json"),"{damaged","utf8");
    assert.throws(()=>getKnowledgeGraph(),/Cannot migrate/);
    assert.equal(readFileSync(join(broken,".yatsumira","knowledge.json"),"utf8"),"{damaged");
  }finally {process.chdir(root);rmSync(broken,{recursive:true,force:true});}
  console.log("[YATSUMIRA] CORE SQLite schema, legacy import, transactions, dedup, search, persistence: OK");
} finally {
  process.chdir(prior);
  rmSync(root,{recursive:true,force:true});
}
