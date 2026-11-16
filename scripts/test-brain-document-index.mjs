import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {indexDocumentText,searchDocumentChunks} from "../server/brain-document-index.mjs";
test("document chunks persist with offsets and refresh when the source changes",()=>{
 const cwd=process.cwd(),dir=mkdtempSync(join(tmpdir(),"yatsumira-brain-"));
 try{
  process.chdir(dir);
  const text=("Поставка оборудования, срок оплаты 30 рабочих дней.\n").repeat(130);
  const first=indexDocumentText("Договор-1",text);
  assert.equal(first.indexed,true);
  assert.ok(first.chunks>1);
  assert.equal(indexDocumentText("Договор-1",text).unchanged,true);
  const found=searchDocumentChunks("оборудования");
  assert.ok(found.length>0);
  assert.equal(found[0].sourceId,"Договор-1");
  assert.equal(found[0].content,text.slice(found[0].start,found[0].end));
  const changed=indexDocumentText("Договор-1","Новый срок оплаты 60 календарных дней.");
  assert.equal(changed.indexed,true);
  assert.equal(searchDocumentChunks("оборудования").length,0);
  assert.equal(searchDocumentChunks("календарных")[0].sourceId,"Договор-1");
  indexDocumentText("Договор-2","Срок оплаты 15 календарных дней. Дополнительные условия.");
  const ranked=searchDocumentChunks("оплаты календарных");
  assert.ok(ranked.length>=2);
  assert.ok(ranked.every(x=>x.score>0));
 }finally{process.chdir(cwd);rmSync(dir,{recursive:true,force:true});}
});
