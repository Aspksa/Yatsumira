import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {addKnowledge} from "../server/core-db.mjs";
import {getNexusCells,CELL_CAPACITY} from "../server/nexus-cells.mjs";
test("NEXUS cells fill, bud next to parent and survive database reopen",()=>{
 const old=process.cwd(),dir=mkdtempSync(join(tmpdir(),"yatsumira-nexus-"));
 try{
  process.chdir(dir);
  assert.equal(getNexusCells().total,0);
  for(let i=0;i<CELL_CAPACITY+1;i++)addKnowledge({content:"Уникальная заметка о договоре номер "+i+" и сроках",sector:1,source:"note"});
  const result=getNexusCells();
  assert.equal(result.total,2);
  assert.deepEqual(result.cells.map(c=>c.used),[CELL_CAPACITY,1]);
  assert.equal(result.cells[1].parentId,result.cells[0].id);
  assert.equal(getNexusCells().total,2);
 }finally{process.chdir(old);rmSync(dir,{recursive:true,force:true});}
});
