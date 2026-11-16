/** Persistent, local, source-addressable document fragments. */
import {createHash} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {chunkDocument} from "./brain-quality.mjs";
const hash=s=>createHash("sha256").update(s).digest("hex");
function schema(db){
  db.exec("CREATE TABLE IF NOT EXISTS brain_documents(source_id TEXT PRIMARY KEY,digest TEXT NOT NULL,updated_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS brain_chunks(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES brain_documents(source_id) ON DELETE CASCADE,chunk_index INTEGER NOT NULL,start_offset INTEGER NOT NULL,end_offset INTEGER NOT NULL,content TEXT NOT NULL,UNIQUE(source_id,chunk_index))");
  db.exec("CREATE INDEX IF NOT EXISTS idx_brain_chunks_source ON brain_chunks(source_id,chunk_index)");
}
export function indexDocumentText(sourceId,text){
  const id=String(sourceId??"").trim(),value=String(text??"");
  if(!id||id.length>500||!value.trim()||value.length>2*1024*1024)throw Error("Invalid document source or text");
  const digest=hash(value),chunks=chunkDocument(value,{sourceId:id});
  return withCoreDatabase(db=>{
    schema(db);
    const previous=db.prepare("SELECT digest FROM brain_documents WHERE source_id=?").get(id);
    if(previous?.digest===digest)return {sourceId:id,indexed:false,unchanged:true,chunks:db.prepare("SELECT COUNT(*) AS n FROM brain_chunks WHERE source_id=?").get(id).n};
    db.exec("BEGIN IMMEDIATE");
    try{
      db.prepare("DELETE FROM brain_chunks WHERE source_id=?").run(id);
      db.prepare("INSERT INTO brain_documents(source_id,digest,updated_at) VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET digest=excluded.digest,updated_at=excluded.updated_at").run(id,digest,new Date().toISOString());
      const insert=db.prepare("INSERT INTO brain_chunks(id,source_id,chunk_index,start_offset,end_offset,content) VALUES(?,?,?,?,?,?)");
      for(const chunk of chunks)insert.run(chunk.id,id,chunk.index,chunk.start,chunk.end,chunk.content);
      db.exec("COMMIT");
      return {sourceId:id,indexed:true,unchanged:false,chunks:chunks.length};
    }catch(error){db.exec("ROLLBACK");throw error;}
  });
}
export function searchDocumentChunks(query,{limit=8}={}){
  const terms=String(query??"").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.slice(0,8)||[];
  if(!terms.length)return [];
  return withCoreDatabase(db=>{
    schema(db);
    const where=terms.map(()=>"LOWER(content) LIKE ?").join(" OR ");
    return db.prepare("SELECT id,source_id AS sourceId,chunk_index AS chunkIndex,start_offset AS start,end_offset AS end,content FROM brain_chunks WHERE "+where+" ORDER BY source_id,chunk_index LIMIT ?")
      .all(...terms.map(t=>"%"+t+"%"),Math.max(1,Math.min(50,limit)));
  });
}
