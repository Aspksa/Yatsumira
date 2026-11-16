import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {coreStatus,saveExchange,withCoreDatabase,addKnowledge} from "../server/core-db.mjs";
import {classifyChatMessage,conversationContext,chatContextWindow,routeChatTools,persistDialogueAnalysis,auditToolResult,recordChatFeedback,dialogueHealth} from "../server/chat-v13-intelligence.mjs";
import {chooseChatStrategy,researchChatQuestion,answerAudit} from "../server/chat-v13-research.mjs";
import {reflectConversation,backgroundChatReflection,chatBenchmark} from "../server/chat-v13-reflection.mjs";
const cwd=process.cwd(),dir=mkdtempSync(join(tmpdir(),"yatsumira-chat-v13-"));
try{
  process.chdir(dir);
  assert.equal(coreStatus().version,13);
  const first=classifyChatMessage("Найди документ, проверь ошибки и исправь код",{recent:[]});
  assert.ok(first.intents.includes("search")&&first.intents.includes("analyze")&&first.intents.includes("fix"));
  const ref=classifyChatMessage("А что с ним?",{recent:[]});
  assert.equal(ref.ambiguity.requiresClarification,true);
  assert.equal(classifyChatMessage("Сделай так же",{recent:[{role:"user",content:"Изучи проект Звезда"}]}).followup,true);
  assert.equal(chooseChatStrategy("Найди договор").strategy,"research");
  assert.ok(routeChatTools(first).choices.some(t=>t.tool==="memory-search"));
  const exch1=saveExchange({conversationId:"testing",exchangeId:"req1",user:"Изучи проект Звезда и файл договора",assistant:"Сделано",model:"mock"});
  const exch2=saveExchange({conversationId:"testing",exchangeId:"req2",user:"Проверь предыдущий файл на ошибки",assistant:"Проверено",model:"mock"});
  assert.equal(exch1.stored,true);
  assert.equal(conversationContext("testing").messages.length,4);
  assert.ok(chatContextWindow("Что с этим проектом?",{conversationId:"testing"}).messages>=1);
  const detail=classifyChatMessage("Проверь предыдущий файл на ошибки",{recent:conversationContext("testing").messages});
  assert.equal(persistDialogueAnalysis({conversationId:"testing",exchangeId:"req2",query:"Проверь предыдущий файл на ошибки",analysis:detail}).stored,true);
  assert.equal(persistDialogueAnalysis({conversationId:"testing",exchangeId:"req2",query:"Проверь предыдущий файл на ошибки",analysis:detail}).stored,false);
  assert.equal(auditToolResult({conversationId:"testing",exchangeId:"req2",tool:"memory-search",success:true,summary:"Локальный поиск закончен"}).logged,true);
  assert.equal(recordChatFeedback({conversationId:"testing",exchangeId:"req2",kind:"correction",comment:"Ответ неверно понял файл"}).recorded,true);
  assert.throws(()=>recordChatFeedback({conversationId:"testing",exchangeId:"unknown",kind:"incorrect",comment:"Нет"}),/Exchange/);
  assert.equal(dialogueHealth().errors,1);
  assert.equal(dialogueHealth().analyzed,1);
  const note=addKnowledge({content:"«Проект Звезда» использует локальную SQLite базу.",sector:0,source:"note"});
  const research=researchChatQuestion("Проект Звезда",{limit:5});
  assert.ok(research.sources.length>=1);
  assert.equal(research.verifiedByIndependentSources,false);
  const audit=answerAudit("Как устроена память проекта?","Проект Звезда использует SQLite базу.",research.sources);
  assert.equal(audit.notEntailment,true);
  const reflect=reflectConversation("testing");
  assert.equal(reflect.stored,true);
  assert.equal(reflectConversation("testing").stored,false);
  assert.equal(backgroundChatReflection().stored,0);
  const benchmark=chatBenchmark([
    {query:"Найди файл",expectedIntents:["search"]},
    {query:"Исправь код",expectedIntents:["fix"]}
  ],{persist:true});
  assert.equal(benchmark.cases,2);
  assert.deepEqual(withCoreDatabase(db=>db.prepare("PRAGMA foreign_key_check").all()),[]);
  assert.equal(withCoreDatabase(db=>db.prepare("PRAGMA integrity_check").get().integrity_check),"ok");
  console.log("[YATSUMIRA CHAT v13] contextual analysis, sources, audit, feedback, reflection and regression: OK");
}finally{process.chdir(cwd);rmSync(dir,{recursive:true,force:true});}
