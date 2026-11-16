import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {startCoreMaintenance} from "../server/memory-maintenance.mjs";

test("local contract reports are created on server startup and on subsequent ticks",()=>{
  const cwd=process.cwd(),dir=mkdtempSync(join(tmpdir(),"yatsumira-auto-start-"));
  const originalSetInterval=globalThis.setInterval;
  const originalClearInterval=globalThis.clearInterval;
  const timers=[];
  try{
    process.chdir(dir);
    const folder=join(dir,"Aspksa","Документы","Договоры");
    mkdirSync(folder,{recursive:true});
    writeFileSync(join(folder,"Поставка.old.txt"),"Договор № D-123: срок оплаты составляет 30 рабочих дней.");
    writeFileSync(join(folder,"Поставка.new.txt"),"Договор № D-123: срок оплаты составляет 45 рабочих дней.");
    globalThis.setInterval=fn=>{timers.push(fn);return {unref(){}};};
    globalThis.clearInterval=()=>{};
    const errors=[];
    const stop=startCoreMaintenance({onError:e=>errors.push(e)});
    assert.equal(errors.length,0);
    assert.ok(existsSync(join(folder,"reports","Поставка.comparison.json")));
    writeFileSync(join(folder,"Аренда.old.txt"),"Договор № A-123: срок оплаты составляет 10 дней.");
    writeFileSync(join(folder,"Аренда.new.txt"),"Договор № A-123: срок оплаты составляет 20 дней.");
    assert.equal(timers.length,3);
    timers[0]();
    assert.ok(existsSync(join(folder,"reports","Аренда.comparison.json")));
    stop();
  }finally{
    globalThis.setInterval=originalSetInterval;
    globalThis.clearInterval=originalClearInterval;
    process.chdir(cwd);
    rmSync(dir,{recursive:true,force:true});
  }
});
