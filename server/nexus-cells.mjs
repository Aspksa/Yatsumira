/** Persistent honeycomb containers for real, locally stored knowledge. */
import {withCoreDatabase} from "./core-db.mjs";
export const CELL_CAPACITY=32;
function schema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS nexus_cells(
    id INTEGER PRIMARY KEY AUTOINCREMENT,sector INTEGER NOT NULL,group_name TEXT NOT NULL,
    parent_id INTEGER REFERENCES nexus_cells(id) ON DELETE SET NULL,created_at TEXT NOT NULL,
    UNIQUE(sector,group_name,id));
    CREATE TABLE IF NOT EXISTS nexus_cell_items(
    knowledge_id TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
    cell_id INTEGER NOT NULL REFERENCES nexus_cells(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_nexus_cell_items_cell ON nexus_cell_items(cell_id);`);
}
function sync(db){
  schema(db);
  // Remove stale assignments and empty cells after source deletion.
  db.prepare("DELETE FROM nexus_cell_items WHERE knowledge_id NOT IN (SELECT id FROM knowledge)").run();
  const pending=db.prepare(`SELECT k.id,k.sector,k.group_name AS groupName FROM knowledge k
    LEFT JOIN nexus_cell_items i ON i.knowledge_id=k.id
    WHERE i.knowledge_id IS NULL ORDER BY k.created_at,k.id`).all();
  const find=db.prepare(`SELECT c.id,COUNT(i.knowledge_id) AS n FROM nexus_cells c
    LEFT JOIN nexus_cell_items i ON i.cell_id=c.id
    WHERE c.sector=? AND c.group_name=?
    GROUP BY c.id HAVING n<? ORDER BY c.id DESC LIMIT 1`);
  const parent=db.prepare("SELECT id FROM nexus_cells WHERE sector=? AND group_name=? ORDER BY id DESC LIMIT 1");
  const create=db.prepare("INSERT INTO nexus_cells(sector,group_name,parent_id,created_at) VALUES(?,?,?,?)");
  const assign=db.prepare("INSERT INTO nexus_cell_items(knowledge_id,cell_id) VALUES(?,?)");
  for(const row of pending){
    let cell=find.get(row.sector,row.groupName,CELL_CAPACITY);
    if(!cell){
      const ancestor=parent.get(row.sector,row.groupName);
      const result=create.run(row.sector,row.groupName,ancestor?.id??null,new Date().toISOString());
      cell={id:Number(result.lastInsertRowid)};
    }
    assign.run(row.id,cell.id);
  }
  db.prepare("DELETE FROM nexus_cells WHERE id NOT IN (SELECT DISTINCT cell_id FROM nexus_cell_items)").run();
}
export function getNexusCells({limit=5000}={}){
  return withCoreDatabase(db=>{
    db.exec("BEGIN IMMEDIATE");
    try{sync(db);db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
    const rows=db.prepare(`SELECT c.id,c.sector,c.group_name AS groupName,c.parent_id AS parentId,
      c.created_at AS createdAt,COUNT(i.knowledge_id) AS used
      FROM nexus_cells c JOIN nexus_cell_items i ON i.cell_id=c.id
      GROUP BY c.id ORDER BY c.sector,c.group_name,c.id LIMIT ?`).all(Math.max(1,Math.min(5000,Number(limit)||5000)));
    const total=db.prepare("SELECT COUNT(*) AS n FROM nexus_cells").get().n;
    return {capacity:CELL_CAPACITY,total,cells:rows.map(row=>({...row,fill:row.used/CELL_CAPACITY})),
      truncated:total>rows.length};
  });
}
