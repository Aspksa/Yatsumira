/**
 * YATSUMIRA CORE v1 — maintenance for the portable local SQLite database.
 * Operations are explicit and backend-only; never alter the web interface.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, statSync, readFileSync, renameSync, unlinkSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { coreDatabasePath, withCoreDatabase } from "./core-db.mjs";

const quoteSql = value => "'" + String(value).replaceAll("'", "''") + "'";
function makeError(message, status = 500) {
  return Object.assign(new Error(message), { status });
}
export function inspectCoreIntegrity() {
  return withCoreDatabase(db => {
    const integrity = db.prepare("PRAGMA integrity_check").all().map(row => Object.values(row)[0]);
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
    const dbFile = coreDatabasePath();
    const counts = {
      knowledge: db.prepare("SELECT COUNT(*) AS n FROM knowledge").get().n,
      links: db.prepare("SELECT COUNT(*) AS n FROM knowledge_links").get().n,
      messages: db.prepare("SELECT COUNT(*) AS n FROM messages").get().n,
      events: db.prepare("SELECT COUNT(*) AS n FROM core_events").get().n
    };
    const unpaired = db.prepare(
      "SELECT conversation_id,exchange_id,COUNT(*) AS n FROM messages GROUP BY conversation_id,exchange_id HAVING n<>2"
    ).all();
    const ok = integrity.length === 1 && integrity[0] === "ok" &&
      foreignKeys.length === 0 && unpaired.length === 0;
    return {
      ok, integrity, foreignKeyViolations: foreignKeys.length,
      incompleteExchanges: unpaired.length, counts,
      databaseBytes: statSync(dbFile).size,
      // Never expose user data, private keys, full paths, or conversation messages.
      schemaVersion: Number(db.prepare("SELECT value FROM core_meta WHERE key='schema_version'").get()?.value || 0)
    };
  });
}

export function createCoreBackup({ directory } = {}) {
  // SQLite VACUUM INTO produces a consistent, independent database snapshot,
  // even when a normal process has its main database open.
  const dbPath = coreDatabasePath();
  const base = directory ?? join(dirname(dbPath), "backups");
  mkdirSync(base, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const id = randomUUID().slice(0, 8);
  const filename = "yatsumira-" + stamp + "-" + id + ".sqlite";
  const temp = join(base, filename + ".partial");
  const final = join(base, filename);
  let snapshotCreated = false;
  try {
    withCoreDatabase(db => {
      const check = db.prepare("PRAGMA quick_check").all();
      if (check.length !== 1 || Object.values(check[0])[0] !== "ok")
        throw makeError("SQLite quick_check failed; backup aborted");
      db.exec("VACUUM INTO " + quoteSql(temp));
      snapshotCreated = true;
    });
    // Verify that the backup itself opens and passes both corruption and FK checks.
    const snapshot = new DatabaseSync(temp, { readOnly: true });
    try {
      snapshot.exec("PRAGMA foreign_keys=ON");
      const check = snapshot.prepare("PRAGMA integrity_check").all();
      const violations = snapshot.prepare("PRAGMA foreign_key_check").all();
      if (check.length !== 1 || Object.values(check[0])[0] !== "ok" || violations.length)
        throw makeError("Backup verification failed");
    } finally { snapshot.close(); }
    renameSync(temp, final);
    const bytes = readFileSync(final);
    return {
      filename,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      verified: true
    };
  } catch (error) {
    if (snapshotCreated) {
      try { unlinkSync(temp); } catch {}
    }
    throw error;
  }
}
export function listCoreBackups({ directory } = {}) {
  const base = directory ?? join(dirname(coreDatabasePath()), "backups");
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^yatsumira-[\w-]+\.sqlite$/.test(entry.name))
      .map(entry => entry.name).sort().reverse();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
