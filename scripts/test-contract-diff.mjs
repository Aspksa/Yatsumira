import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {compareFiles} from "./compare-contracts.mjs";

test("offline contract diff reads UTF-8 Cyrillic text and detects changed terms",()=>{
  const dir=mkdtempSync(join(tmpdir(),"yatsumira-contract-"));
  try{
    const old=join(dir,"Старый договор.txt"),next=join(dir,"Новый договор.md");
    writeFileSync(old,"Договор № D-123: срок оплаты составляет 30 рабочих дней.");
    writeFileSync(next,"Договор № D-123: срок оплаты составляет 45 рабочих дней.");
    const result=compareFiles(old,next);
    assert.ok(result.changes.some(x=>x.predicate==="payment_working_days"&&x.before.includes("30")&&x.after.includes("45")));
    assert.ok(result.changes.every(x=>x.requiresReview));
    assert.throws(()=>compareFiles(old,join(dir,"contract.pdf")),/Only .txt and .md/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
