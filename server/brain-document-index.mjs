/** Persistent, local, source-addressable document fragments. */
import {createHash} from "node:crypto";
import {basename} from "node:path";
import {withCoreDatabase} from "./core-db.mjs";
import {chunkDocument} from "./brain-quality.mjs";
import {confidential,normalizeMemory,memoryHash} from "./memory-store.mjs";
const hash=s=>createHash("sha256").update(s).digest("hex");
function schema(db){
  db.exec("CREATE TABLE IF NOT EXISTS brain_documents(source_id TEXT PRIMARY KEY,digest TEXT NOT NULL,updated_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS brain_chunks(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES brain_documents(source_id) ON DELETE CASCADE,chunk_index INTEGER NOT NULL,start_offset INTEGER NOT NULL,end_offset INTEGER NOT NULL,content TEXT NOT NULL,UNIQUE(source_id,chunk_index))");
  db.exec("CREATE INDEX IF NOT EXISTS idx_brain_chunks_source ON brain_chunks(source_id,chunk_index)");
}
function projectDocument(db,sourceId,text){
  const nodeId="doc-"+hash(sourceId).slice(0,32);
  const filename=basename(sourceId.replaceAll("\\","/"));
  const title=filename.slice(0,100);
  const content=("Документ: "+filename+"\n"+text).slice(0,4000);
  const digest=hash("document\0"+sourceId);
  const group=filename.replace(/\.(old|new)\.(txt|md)$/iu,"").replace(/\.(txt|md)$/iu,"").slice(0,100)||"Документы";
  const existing=db.prepare("SELECT id,content FROM knowledge WHERE id=?").get(nodeId);
  if(existing){
    if(existing.content===content)return;
    db.prepare("UPDATE knowledge SET title=?,content=?,group_name=? WHERE id=?").run(title,content,group,nodeId);
    // A revised document must not leave an obsolete excerpt in memory retrieval.
    db.prepare("UPDATE memory_entries SET content=?,normalized=?,content_hash=?,updated_at=? WHERE source_kind='knowledge' AND source_id=?")
      .run(content,normalizeMemory(content),memoryHash(content),new Date().toISOString(),nodeId);
  }else{
    if(db.prepare("SELECT COUNT(*) AS n FROM knowledge").get().n>=2500)throw Error("NEXUS knowledge limit reached");
    db.prepare("INSERT INTO knowledge(id,title,content,sector,kind,importance,source,verified,digest,group_name,created_at) VALUES(?,?,?,1,'document',2,'document',0,?,?,?)")
      .run(nodeId,title,content,digest,group,new Date().toISOString());
  }
  db.prepare("INSERT INTO core_meta(key,value) VALUES('knowledge_revision','1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1").run();
}
export function indexDocumentText(sourceId,text){
  const id=String(sourceId??"").trim(),value=String(text??"");
  if(!id||id.length>500||!value.trim()||value.length>2*1024*1024)throw Error("Invalid document source or text");
  const digest=hash(value),chunks=chunkDocument(value,{sourceId:id});
  return withCoreDatabase(db=>{
    schema(db);
    const previous=db.prepare("SELECT digest FROM brain_documents WHERE source_id=?").get(id);
    if(previous?.digest===digest && db.prepare("SELECT id FROM knowledge WHERE id=?").get("doc-"+hash(id).slice(0,32)))
      return {sourceId:id,indexed:false,unchanged:true,chunks:db.prepare("SELECT COUNT(*) AS n FROM brain_chunks WHERE source_id=?").get(id).n};
    db.exec("BEGIN IMMEDIATE");
    try{
      db.prepare("DELETE FROM brain_chunks WHERE source_id=?").run(id);
      db.prepare("INSERT INTO brain_documents(source_id,digest,updated_at) VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET digest=excluded.digest,updated_at=excluded.updated_at").run(id,digest,new Date().toISOString());
      const insert=db.prepare("INSERT INTO brain_chunks(id,source_id,chunk_index,start_offset,end_offset,content) VALUES(?,?,?,?,?,?)");
      for(const chunk of chunks)insert.run(chunk.id,id,chunk.index,chunk.start,chunk.end,chunk.content);
      projectDocument(db,id,value);
      db.exec("COMMIT");
      return {sourceId:id,indexed:true,unchanged:false,chunks:chunks.length};
    }catch(error){db.exec("ROLLBACK");throw error;}
  });
}
export function searchDocumentChunks(query,{limit=8}={}){
  const terms=[...new Set(String(query??"").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])].slice(0,12);
  if(!terms.length)return [];
  return withCoreDatabase(db=>{
    schema(db);
    // Bound the scan and rank matches by query-term coverage rather than file order.
    const where=terms.map(()=>"LOWER(content) LIKE ?").join(" OR ");
    const candidates=db.prepare("SELECT id,source_id AS sourceId,chunk_index AS chunkIndex,start_offset AS start,end_offset AS end,content FROM brain_chunks WHERE "+where+" LIMIT 250")
      .all(...terms.map(t=>"%"+t+"%"));
    return candidates.filter(x=>!confidential.test(x.content)).map(row=>{
      const lower=row.content.toLowerCase();
      const matches=terms.filter(t=>lower.includes(t)).length;
      return {...row,score:matches/terms.length};
    }).sort((a,b)=>b.score-a.score||a.sourceId.localeCompare(b.sourceId)||a.chunkIndex-b.chunkIndex)
      .slice(0,Math.max(1,Math.min(20,Number(limit)||8)));
  });
}
