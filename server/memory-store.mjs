/**
 * Versioned long-term memory records. This module intentionally does not open
 * SQLite itself: callers include indexing in their own transaction.
 */
import { randomUUID, createHash } from "node:crypto";

export function normalizeMemory(text) {
  return String(text ?? "").normalize("NFKC").toLowerCase().replace(/ё/g,"е")
    .replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();
}
export function memoryTokens(text) {
  return [...new Set(normalizeMemory(text).split(" ").filter(w => w.length >= 3).slice(0,200))];
}
export function memoryHash(text) {
  return createHash("sha256").update(normalizeMemory(text)).digest("hex");
}
const confidential=/\b(?:sk-[\w-]{12,}|Bearer\s+[\w.-]{12,}|(?:api[_ -]?key|парол[ьяе]|токен|секрет)[\s:=]{1,12}\S{8,})/iu;
export function eligibleEpisode(text) {
  const value=String(text ?? "").trim();
  return value.length >= 12 && value.length <= 4000 && !confidential.test(value);
}
function date() { return new Date().toISOString(); }
export function indexMemory(db, input) {
  const content=String(input.content??"").trim();
  if(!content||content.length>4000) return null;
  const sourceKind=input.sourceKind;
  if(!["knowledge","dialogue","manual"].includes(sourceKind)) throw Error("Invalid memory source");
  const sourceId=String(input.sourceId??"");
  if(!sourceId||sourceId.length>200)throw Error("Invalid source id");
  const existing=db.prepare("SELECT id FROM memory_entries WHERE source_kind=? AND source_id=?").get(sourceKind,sourceId);
  if(existing)return {id:existing.id,stored:false};
  const id=randomUUID(),timestamp=date();
  const importance=Math.max(1,Math.min(5,Math.trunc(Number(input.importance)||2)));
  const confidence=Math.min(1,Math.max(0,Number(input.confidence) || 0));
  const verified=input.verified?1:0;
  db.prepare("INSERT INTO memory_entries(id,source_kind,source_id,conversation_id,content,normalized,content_hash,importance,confidence,verified,state,valid_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'active',?,?,?)")
    .run(id,sourceKind,sourceId,String(input.conversationId||"").slice(0,200),content,
      normalizeMemory(content),memoryHash(content),importance,confidence,verified,
      String(input.validFrom||timestamp),timestamp,timestamp);
  // Similarity edges are *associations*, never assertions that two statements agree.
  const tokens=memoryTokens(content);
  if(tokens.length>=2) {
    const candidates=db.prepare("SELECT id,normalized FROM memory_entries WHERE id<>? AND state='active' ORDER BY rowid DESC LIMIT 200").all(id);
    const own=new Set(tokens);
    const pairs=candidates.map(row=>{
      const other=new Set(memoryTokens(row.normalized));
      const overlap=[...own].filter(w=>other.has(w)).length;
      return {id:row.id,score:overlap/Math.max(1,Math.sqrt(own.size*other.size)),overlap};
    }).filter(x=>x.overlap>=2&&x.score>=.18).sort((a,b)=>b.score-a.score).slice(0,5);
    const add=db.prepare("INSERT OR IGNORE INTO memory_links(id,from_id,to_id,relation,score,created_at) VALUES(?,?,?,'related',?,?)");
    for(const item of pairs)add.run(randomUUID(),id,item.id,Math.min(1,item.score),timestamp);
  }
  return {id,stored:true};
}
export function importLegacyMemory(db,batch=500) {
  let done=0;
  const knowledge=db.prepare("SELECT id,content,importance,verified,created_at FROM knowledge WHERE NOT EXISTS(SELECT 1 FROM memory_entries m WHERE m.source_kind='knowledge' AND m.source_id=knowledge.id) ORDER BY rowid LIMIT ?").all(batch);
  for(const row of knowledge){
    indexMemory(db,{sourceKind:"knowledge",sourceId:row.id,content:row.content,
      importance:row.importance,verified:!!row.verified,confidence:row.verified?.98:.65,validFrom:row.created_at});
    done++;
  }
  if(done>=batch)return done;
  const messages=db.prepare("SELECT id,conversation_id,content,created_at FROM messages WHERE role='user' AND NOT EXISTS(SELECT 1 FROM memory_entries m WHERE m.source_kind='dialogue' AND m.source_id=messages.id) AND NOT EXISTS(SELECT 1 FROM core_meta c WHERE c.key='memory_skip_'||messages.id) ORDER BY rowid LIMIT ?").all(batch-done);
  // Short and sensitive messages are not indexed; mark them as examined to avoid
  // re-reading forever, without duplicating their contents in memory.
  const skipped=db.prepare("INSERT OR IGNORE INTO core_meta(key,value) VALUES(?,?)");
  for(const row of messages){
    if(eligibleEpisode(row.content)){
      indexMemory(db,{sourceKind:"dialogue",sourceId:row.id,conversationId:row.conversation_id,
        content:row.content,importance:2,verified:false,confidence:.45,validFrom:row.created_at});
      done++;
    }else{
      skipped.run("memory_skip_"+row.id,"1");
    }
  }
  return done;
}
