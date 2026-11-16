import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {compareDirectory} from "./auto-compare-contracts.mjs";

test("automatic batch comparison creates reports once and preserves existing reviews",()=>{
  const dir=mkdtempSync(join(tmpdir(),"yatsumira-auto-contract-"));
  try{
    writeFileSync(join(dir,"Поставка.old.txt"),"Договор № D-123: срок оплаты составляет 30 рабочих дней.");
    writeFileSync(join(dir,"Поставка.new.txt"),"Договор № D-123: срок оплаты составляет 45 рабочих дней.");
    writeFileSync(join(dir,"Без пары.old.txt"),"Договор № A-12: срок оплаты составляет 10 дней.");
    const first=compareDirectory(dir);
    assert.equal(first.compared,1);
    assert.equal(first.skipped,1);
    const path=join(dir,"reports","Поставка.comparison.json");
    const report=JSON.parse(readFileSync(path,"utf8"));
    assert.ok(report.changes.some(x=>x.predicate==="payment_working_days"&&x.status==="changed"));
    assert.deepEqual(report.sourceFiles,{previous:"Поставка.old.txt",next:"Поставка.new.txt"});
    const second=compareDirectory(dir);
    assert.equal(second.compared,0);
    assert.equal(second.skipped,2);
    assert.deepEqual(JSON.parse(readFileSync(path,"utf8")),report);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
