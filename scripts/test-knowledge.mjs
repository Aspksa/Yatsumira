import assert from "node:assert/strict";
import { createServer } from "vite";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root=resolve(import.meta.dirname,"..");
const original=process.cwd();
const dir=mkdtempSync(join(tmpdir(),"yatsumira-knowledge-"));
process.chdir(dir);
let server;
try{
  server=await createServer({configFile:join(root,"vite.config.mjs"),root,
    server:{host:"127.0.0.1",port:0,open:false}});
  await server.listen();
  const url=server.resolvedUrls?.local?.[0];
  assert.ok(url);
  async function api(path,init={}){
    const response=await fetch(new URL("/api/knowledge/"+path,url),{
      ...init,headers:{"Content-Type":"application/json"},cache:"no-store"});
    return {status:response.status,data:await response.json()};
  }
  const first=await api("graph");
  assert.deepEqual(first.data.records,[]);
  assert.deepEqual(first.data.links,[]);
  const a=await api("ingest",{method:"POST",body:JSON.stringify({
    content:"Договор поставки товаров для московского склада. Срок оплаты тридцать дней.",
    sector:1,source:"note"})});
  assert.equal(a.status,201);
  assert.equal(a.data.records.length,1);
  assert.equal(a.data.records[0].verified,false);
  const duplicate=await api("ingest",{method:"POST",body:JSON.stringify({
    content:"Договор поставки товаров для московского склада. Срок оплаты тридцать дней.",
    sector:1,source:"note"})});
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.data.added,false);
  const b=await api("ingest",{method:"POST",body:JSON.stringify({
    content:"Договор поставки товаров для склада. Изменён срок оплаты по договору поставки.",
    sector:1,source:"chat"})});
  assert.equal(b.status,201);
  assert.equal(b.data.records.length,2);
  assert.ok(b.data.links.length>=1);
  assert.equal(b.data.links[0].kind,"shared-terms");
  const invalid=await api("ingest",{method:"POST",body:JSON.stringify({content:"",sector:1})});
  assert.equal(invalid.status,400);
  const reload=await api("graph");
  assert.equal(reload.data.records.length,2);
  assert.equal(reload.data.revision,2);
  assert.ok(existsSync(join(dir,".yatsumira","knowledge.json")));
  const disk=JSON.parse(readFileSync(join(dir,".yatsumira","knowledge.json"),"utf8"));
  assert.equal(disk.records.length,2);
  console.log("[YATSUMIRA] Knowledge persistence, dedup, links, validation: OK");
}finally{
  if(server)await server.close();
  process.chdir(original);
  rmSync(dir,{recursive:true,force:true});
}
