/**
 * YATSUMIRA CORE v1 — portable SQLite storage (Node 22+, no external DB).
 * Keeps the original knowledge.json file untouched after one-time import.
 */
import {DatabaseSync} from "node:sqlite";
import {mkdirSync,readFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {indexMemory,importLegacyMemory,eligibleEpisode} from "./memory-store.mjs";

const SCHEMA=2;
const ROOT=()=>resolve(process.cwd(),".yatsumira");
export const coreDatabasePath=()=>join(ROOT(),"yatsumira.sqlite");
const wordsIgnored=new Set(["это","для","как","при","что","или","уже","все","если","будет","когда","они","меня","тебя","только","надо","теперь","также","есть","можно","нужно","чтобы","тебе","пока","после","the","and","with","from","this"]);
const sql=[
"CREATE TABLE IF NOT EXISTS core_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
"CREATE TABLE IF NOT EXISTS knowledge(id TEXT PRIMARY KEY,title TEXT NOT NULL,content TEXT NOT NULL,sector INTEGER NOT NULL CHECK(sector BETWEEN 0 AND 7),kind TEXT NOT NULL CHECK(kind IN ('fact','document','agent')),importance INTEGER NOT NULL CHECK(importance BETWEEN 1 AND 3),source TEXT NOT NULL,verified INTEGER NOT NULL CHECK(verified IN (0,1)),digest TEXT NOT NULL UNIQUE,group_name TEXT NOT NULL,created_at TEXT NOT NULL)",
"CREATE INDEX IF NOT EXISTS idx_knowledge_group ON knowledge(sector,group_name)",
"CREATE TABLE IF NOT EXISTS knowledge_links(source_id TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,target_id TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,kind TEXT NOT NULL,strength INTEGER NOT NULL,PRIMARY KEY(source_id,target_id,kind))",
"CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
"CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,exchange_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,model TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(conversation_id,exchange_id,role))",
"CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id,created_at)",
"CREATE TABLE IF NOT EXISTS core_events(id TEXT PRIMARY KEY,event_type TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL)",
"CREATE TABLE IF NOT EXISTS memory_entries(id TEXT PRIMARY KEY,source_kind TEXT NOT NULL CHECK(source_kind IN ('knowledge','dialogue','manual')),source_id TEXT NOT NULL,conversation_id TEXT NOT NULL DEFAULT '',content TEXT NOT NULL,normalized TEXT NOT NULL,content_hash TEXT NOT NULL,importance INTEGER NOT NULL CHECK(importance BETWEEN 1 AND 5),confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),verified INTEGER NOT NULL CHECK(verified IN (0,1)),state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','superseded','retracted')),valid_from TEXT NOT NULL,valid_to TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(source_kind,source_id))",
"CREATE INDEX IF NOT EXISTS idx_memory_source ON memory_entries(source_kind,source_id)",
"CREATE INDEX IF NOT EXISTS idx_memory_active ON memory_entries(state,importance,created_at)",
"CREATE INDEX IF NOT EXISTS idx_memory_hash ON memory_entries(content_hash)",
"CREATE TABLE IF NOT EXISTS memory_links(id TEXT PRIMARY KEY,from_id TEXT NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,to_id TEXT NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,relation TEXT NOT NULL CHECK(relation IN ('related','supersedes','contradicts')),score REAL NOT NULL CHECK(score BETWEEN 0 AND 1),created_at TEXT NOT NULL,UNIQUE(from_id,to_id,relation))",
"CREATE INDEX IF NOT EXISTS idx_memory_links_reverse ON memory_links(to_id)",
"CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(content,content='memory_entries',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2')",
"CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory_entries BEGIN INSERT INTO memory_fts(rowid,content) VALUES(new.rowid,new.content); END",
"CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory_entries BEGIN INSERT INTO memory_fts(memory_fts,rowid,content) VALUES('delete',old.rowid,old.content); END",
"CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE OF content ON memory_entries BEGIN INSERT INTO memory_fts(memory_fts,rowid,content) VALUES('delete',old.rowid,old.content); INSERT INTO memory_fts(rowid,content) VALUES(new.rowid,new.content); END"
];
export const tokenize=text=>[...new Set((String(text).toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[]).filter(w=>!wordsIgnored.has(w)).slice(0,120))];
const digest=text=>createHash("sha256").update(text).digest("hex");
const category=text=>tokenize(text).slice(0,2).join(" · ").slice(0,60)||"Без темы";
const now=()=>new Date().toISOString();
const meta=(db,key)=>db.prepare("SELECT value FROM core_meta WHERE key=?").get(key)?.value;
const setMeta=(db,key,value)=>db.prepare("INSERT INTO core_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key,String(value));
const revision=db=>Number(meta(db,"knowledge_revision")||0);
function event(db,type,data){
  db.prepare("INSERT INTO core_events(id,event_type,payload,created_at) VALUES(?,?,?,?)").run(randomUUID(),type,JSON.stringify(data),now());
}
function transact(db,fn) {
  db.exec("BEGIN IMMEDIATE");
  try {const result=fn();db.exec("COMMIT");return result;}
  catch(error){db.exec("ROLLBACK");throw error;}
}
const insertKnowledge=db=>db.prepare("INSERT OR IGNORE INTO knowledge(id,title,content,sector,kind,importance,source,verified,digest,group_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
function migrateLegacy(db){
  if(meta(db,"legacy_migrated")==="yes")return;
  let legacy;
  try{
    legacy=JSON.parse(readFileSync(join(ROOT(),"knowledge.json"),"utf8"));
    if(legacy.version!==1||!Array.isArray(legacy.records)||!Array.isArray(legacy.links))
      throw new Error("Unknown legacy format");
  }catch(error){
    if(error?.code!=="ENOENT")throw Object.assign(new Error("Cannot migrate knowledge.json: "+error.message),{status:500});
  }
  if(legacy){
    const insert=insertKnowledge(db);
    for(const row of legacy.records){
      if(typeof row.id!=="string"||typeof row.content!=="string"||
         !Number.isInteger(row.sector)||row.sector<0||row.sector>7)throw new Error("Malformed legacy record");
      const source=typeof row.source==="string"?row.source:"note";
      insert.run(row.id,String(row.title||row.content.slice(0,75)),row.content,row.sector,
        ["fact","document","agent"].includes(row.kind)?row.kind:"fact",
        Math.max(1,Math.min(3,Number(row.importance)||1)),source,row.verified?1:0,
        typeof row.digest==="string"&&row.digest.length===64?row.digest:digest(source+"\0"+row.content),
        String(row.group||category(row.content)),String(row.createdAt||now()));
    }
    const edge=db.prepare("INSERT OR IGNORE INTO knowledge_links(source_id,target_id,kind,strength) VALUES(?,?,?,?)");
    const present=db.prepare("SELECT id FROM knowledge WHERE id=?");
    for(const link of legacy.links){
      if(present.get(link.source)&&present.get(link.target))
        edge.run(link.source,link.target,String(link.kind||"shared-terms"),Math.max(1,Number(link.strength)||1));
    }
    setMeta(db,"knowledge_revision",Number.isInteger(legacy.revision)?legacy.revision:legacy.records.length);
    event(db,"knowledge.migrated",{records:legacy.records.length,links:legacy.links.length});
  }
  setMeta(db,"legacy_migrated","yes");
}
export function withCoreDatabase(fn){
  if(Number(process.versions.node.split(".")[0])<22)
    throw Object.assign(new Error("YATSUMIRA CORE requires Node.js 22+"),{status:503});
  mkdirSync(ROOT(),{recursive:true});
  const db=new DatabaseSync(coreDatabasePath());
  try{
    db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
    transact(db,()=>{
      for(const statement of sql)db.exec(statement);
      const version=Number(meta(db,"schema_version")||0);
      if(version>SCHEMA)throw new Error("Database schema newer than this build");
      if(version<SCHEMA){
        if(version>0)db.exec("INSERT INTO memory_fts(memory_fts) VALUES('rebuild')");
        setMeta(db,"schema_version",SCHEMA);
      }
      migrateLegacy(db);
      importLegacyMemory(db,250);
    });
    return fn(db);
  }finally{db.close();}
}
const graph=db=>({
  revision:revision(db),
  records:db.prepare("SELECT * FROM knowledge ORDER BY created_at,id").all().map(row=>({
    id:row.id,title:row.title,content:row.content,sector:row.sector,kind:row.kind,
    importance:row.importance,source:row.source,verified:Boolean(row.verified),
    digest:row.digest,group:row.group_name,createdAt:row.created_at
  })),
  links:db.prepare("SELECT source_id AS source,target_id AS target,kind,strength FROM knowledge_links ORDER BY source_id,target_id").all()
});
export function getKnowledgeGraph(){return withCoreDatabase(graph);}
export function addKnowledge(input){
  const content=typeof input?.content==="string"?input.content.trim():"";
  if(!content||content.length>4000)
    throw Object.assign(new Error("Текст должен содержать от 1 до 4000 символов"),{status:400});
  const sector=Number.isInteger(input.sector)&&input.sector>=0&&input.sector<8?input.sector:0;
  const source=input.source==="chat"?"chat":"note";
  const hash=digest(source+"\0"+content);
  return withCoreDatabase(db=>transact(db,()=>{
    const old=db.prepare("SELECT id FROM knowledge WHERE digest=?").get(hash);
    if(old)return {...graph(db),added:false,id:old.id};
    if(db.prepare("SELECT COUNT(*) AS n FROM knowledge").get().n>=2500)
      throw Object.assign(new Error("Лимит записей достигнут. Требуется архивирование."),{status:409});
    const id=randomUUID(),title=typeof input.title==="string"&&input.title.trim()?input.title.trim().slice(0,100):content.slice(0,75);
    const newWords=tokenize(content);
    const related=db.prepare("SELECT id,content FROM knowledge").all().map(row=>({
      id:row.id,overlap:newWords.filter(w=>tokenize(row.content).includes(w)).length
    })).filter(row=>row.overlap>=2).sort((a,b)=>b.overlap-a.overlap).slice(0,4);
    insertKnowledge(db).run(id,title,content,sector,"fact",source==="note"?2:1,source,0,hash,category(content),now());
    indexMemory(db,{sourceKind:"knowledge",sourceId:id,content,importance:source==="note"?3:2,confidence:.65,verified:false});
    const edge=db.prepare("INSERT INTO knowledge_links(source_id,target_id,kind,strength) VALUES(?,?,?,?)");
    for(const item of related)edge.run(id,item.id,"shared-terms",item.overlap);
    setMeta(db,"knowledge_revision",revision(db)+1);
    event(db,"knowledge.added",{id,source,sector});
    return {...graph(db),added:true,id};
  }));
}
export function saveExchange({conversationId="default",exchangeId=randomUUID(),user,assistant,model}){
  if(![conversationId,exchangeId,model].every(x=>typeof x==="string"&&x.length>0&&x.length<=200)||
     ![user,assistant].every(x=>typeof x==="string"&&x.trim()&&x.length<=20000))
    throw Object.assign(new Error("Invalid conversation payload"),{status:400});
  return withCoreDatabase(db=>transact(db,()=>{
    const date=now();
    db.prepare("INSERT OR IGNORE INTO conversations(id,created_at,updated_at) VALUES(?,?,?)").run(conversationId,date,date);
    const rows=db.prepare("SELECT role,content FROM messages WHERE conversation_id=? AND exchange_id=?").all(conversationId,exchangeId);
    if(rows.length){
      if(rows.length!==2||!rows.some(r=>r.role==="user"&&r.content===user)||
         !rows.some(r=>r.role==="assistant"&&r.content===assistant))
        throw Object.assign(new Error("Conflicting exchange ID"),{status:409});
      return {conversationId,exchangeId,stored:false};
    }
    const insert=db.prepare("INSERT INTO messages(id,conversation_id,exchange_id,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)");
    const userId=randomUUID();
    insert.run(userId,conversationId,exchangeId,"user",user,model,date);
    insert.run(randomUUID(),conversationId,exchangeId,"assistant",assistant,model,date);
    if(eligibleEpisode(user)){
      indexMemory(db,{sourceKind:"dialogue",sourceId:userId,conversationId,content:user,
        importance:2,confidence:.45,verified:false,validFrom:date});
    }else{
      db.prepare("INSERT OR IGNORE INTO core_meta(key,value) VALUES(?,?)").run("memory_skip_"+userId,"1");
    }
    db.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(date,conversationId);
    event(db,"conversation.exchange",{conversationId,exchangeId,model});
    return {conversationId,exchangeId,stored:true};
  }));
}
export function recentMessages(conversationId="default",limit=50){
  return withCoreDatabase(db=>db.prepare(
    "SELECT role,content,model,exchange_id AS exchangeId,created_at AS createdAt FROM messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT ?"
  ).all(conversationId,Math.max(1,Math.min(200,Number(limit)||50))).reverse());
}
export function searchCore(query,limit=20){
  const words=tokenize(query).slice(0,5);
  if(!words.length)return [];
  return withCoreDatabase(db=>{
    // Parameterized lexical search, not vector semantic similarity.
    const clause=words.map(()=>"LOWER(content) LIKE ?").join(" OR ");
    const values=words.map(w=>"%"+w+"%");
    return db.prepare("SELECT id,title,content,sector,source,verified,group_name AS 'group',created_at AS createdAt FROM knowledge WHERE "+clause+" ORDER BY created_at DESC LIMIT ?")
      .all(...values,Math.max(1,Math.min(100,Number(limit)||20)))
      .map(row=>({...row,verified:Boolean(row.verified)}));
  });
}
export function coreStatus(){
  return withCoreDatabase(db=>({
    version:SCHEMA,storage:"sqlite",
    knowledge:db.prepare("SELECT COUNT(*) AS n FROM knowledge").get().n,
    links:db.prepare("SELECT COUNT(*) AS n FROM knowledge_links").get().n,
    conversations:db.prepare("SELECT COUNT(*) AS n FROM conversations").get().n,
    messages:db.prepare("SELECT COUNT(*) AS n FROM messages").get().n,
    revision:revision(db),
    memory:db.prepare("SELECT COUNT(*) AS n FROM memory_entries WHERE state='active'").get().n,
    memoryLinks:db.prepare("SELECT COUNT(*) AS n FROM memory_links").get().n
  }));
}
