import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { addKnowledge, saveExchange, coreDatabasePath } from "../server/core-db.mjs";
import { inspectCoreIntegrity, createCoreBackup, listCoreBackups } from "../server/core-maintenance.mjs";

const old = process.cwd();
const root = mkdtempSync(join(tmpdir(), "yatsumira-core-maintenance-"));
try {
  process.chdir(root);
  const local = join(root, ".yatsumira");
  mkdirSync(local);
  const record = addKnowledge({ content: "Договор поставки для предприятия, согласование поставки с отделом", sector:1, source:"note" });
  assert.equal(record.added,true);
  const conversation = saveExchange({ conversationId:"default",exchangeId:"first",user:"Привет",assistant:"Здравствуйте",model:"test" });
  assert.equal(conversation.stored,true);
  const checked = inspectCoreIntegrity();
  assert.equal(checked.ok,true);
  assert.equal(checked.counts.knowledge,1);
  assert.equal(checked.counts.messages,2);
  assert.equal(checked.incompleteExchanges,0);
  assert.equal(checked.foreignKeyViolations,0);
  assert.ok(checked.databaseBytes>0);

  const backup = createCoreBackup();
  assert.equal(backup.verified,true);
  assert.ok(backup.sizeBytes>4096);
  assert.match(backup.sha256,/^[0-9a-f]{64}$/);
  assert.ok(listCoreBackups().includes(backup.filename));
  const backupPath = join(local,"backups",backup.filename);
  assert.ok(existsSync(backupPath));
  const b = new DatabaseSync(backupPath,{readOnly:true});
  try {
    assert.equal(b.prepare("SELECT COUNT(*) AS n FROM knowledge").get().n,1);
    assert.equal(b.prepare("SELECT COUNT(*) AS n FROM messages").get().n,2);
    assert.equal(b.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
  } finally { b.close(); }

  // Snapshot immutability: later writes must not change existing backups.
  addKnowledge({ content:"Новая запись после резервного копирования",sector:0,source:"note" });
  const b2 = new DatabaseSync(backupPath,{readOnly:true});
  try { assert.equal(b2.prepare("SELECT COUNT(*) AS n FROM knowledge").get().n,1); }
  finally { b2.close(); }
  assert.equal(inspectCoreIntegrity().counts.knowledge,2);

  // Corrupt logical pairing in a valid database to check audit detection.
  const db = new DatabaseSync(coreDatabasePath());
  try { db.prepare("DELETE FROM messages WHERE role='assistant'").run(); }
  finally { db.close(); }
  const invalid = inspectCoreIntegrity();
  assert.equal(invalid.ok,false);
  assert.equal(invalid.incompleteExchanges,1);
  console.log("[YATSUMIRA CORE] SQLite integrity audit, consistent backup, verification and repair diagnostics: OK");
} finally {
  process.chdir(old);
  rmSync(root,{recursive:true,force:true});
}
