/**
 * Windows-friendly backend-only maintenance CLI.
 * Run: node scripts/core-maintenance.mjs status|check|backup|list
 */
import { coreStatus } from "../server/core-db.mjs";
import { inspectCoreIntegrity, createCoreBackup, listCoreBackups } from "../server/core-maintenance.mjs";

const command = process.argv[2] || "status";
try {
  let result;
  switch (command) {
    case "status": result = coreStatus(); break;
    case "check":
      result = inspectCoreIntegrity();
      if (!result.ok) process.exitCode = 2;
      break;
    case "backup": result = createCoreBackup(); break;
    case "list": result = { backups: listCoreBackups() }; break;
    default:
      console.error("Использование: node scripts/core-maintenance.mjs status|check|backup|list");
      process.exitCode = 64;
      break;
  }
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("[YATSUMIRA CORE] " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
