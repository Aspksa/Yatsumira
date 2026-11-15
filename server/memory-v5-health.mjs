/** Local SQLite memory integrity audit. Read-only metrics and maintenance checks. */
import {withCoreDatabase} from "./core-db.mjs";
const count=(db,sql)=>db.prepare(sql).get().n;
export function inspectMemoryV5(){
  return withCoreDatabase(db=>{
    const integrity=db.prepare("PRAGMA integrity_check").all().map(x=>x.integrity_check);
    const fk=db.prepare("PRAGMA foreign_key_check").all();
    const memory=count(db,"SELECT COUNT(*) AS n FROM memory_entries");
    const indexed=count(db,"SELECT COUNT(*) AS n FROM memory_fts");
    const danglingClaims=count(db,"SELECT COUNT(*) AS n FROM graph_assertions a LEFT JOIN memory_entries m ON a.memory_id=m.id WHERE m.id IS NULL");
    const invalidTasks=count(db,"SELECT COUNT(*) AS n FROM memory_tasks t LEFT JOIN memory_entries m ON t.memory_id=m.id WHERE m.id IS NULL");
    const unsourcedAliases=count(db,"SELECT COUNT(*) AS n FROM memory_aliases a LEFT JOIN memory_entries m ON a.source_memory_id=m.id WHERE m.id IS NULL");
    const offSourceRelations=count(db,"SELECT COUNT(*) AS n FROM graph_assertions a JOIN memory_entries m ON m.id=a.memory_id WHERE m.state<>'active' AND (a.valid_to IS NULL OR a.valid_to>m.valid_to)");
    const jobs=db.prepare("SELECT name,cursor,updated_at AS updatedAt FROM memory_jobs ORDER BY name").all();
    const structures={
      memories:memory,ftsIndexed:indexed,
      graphNodes:count(db,"SELECT COUNT(*) AS n FROM graph_nodes"),
      graphAssertions:count(db,"SELECT COUNT(*) AS n FROM graph_assertions"),
      hyperedges:count(db,"SELECT COUNT(*) AS n FROM memory_hyperedges"),
      tasks:count(db,"SELECT COUNT(*) AS n FROM memory_tasks"),
      decisions:count(db,"SELECT COUNT(*) AS n FROM memory_decisions"),
      aliases:count(db,"SELECT COUNT(*) AS n FROM memory_aliases"),
      sourceIndexes:count(db,"SELECT COUNT(*) AS n FROM memory_document_index")
    };
    const errors=[];
    if(integrity.length!==1||integrity[0]!=="ok")errors.push("sqlite-integrity");
    if(fk.length)errors.push("foreign-keys");
    if(memory!==indexed)errors.push("fts-count");
    if(danglingClaims)errors.push("dangling-graph");
    if(invalidTasks)errors.push("dangling-task");
    if(unsourcedAliases)errors.push("dangling-alias");
    if(offSourceRelations)errors.push("stale-claim-validity");
    return {ok:errors.length===0,errors,integrity,foreignKeyViolations:fk.length,
      structures,staleClaims:offSourceRelations,checkpointJobs:jobs};
  });
}
export function assertMemoryHealthy(){
  const result=inspectMemoryV5();
  if(!result.ok)throw Object.assign(new Error("CORE v5 memory audit failed: "+result.errors.join(", ")),{status:500,report:result});
  return result;
}
