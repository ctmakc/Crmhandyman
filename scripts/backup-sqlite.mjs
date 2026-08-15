import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

function databasePathFromUrl(value) {
  const raw = value || "file:./dev.db";
  if (!raw.startsWith("file:")) throw new Error("backup-sqlite only supports file: SQLite DATABASE_URL values");
  return decodeURIComponent(raw.slice("file:".length));
}

const source = databasePathFromUrl(process.env.DATABASE_URL);
const backupDir = process.env.BACKUP_DIR || path.resolve(path.dirname(source), "backups");
const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 14));
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const destination = path.join(backupDir, `handyman-crm-${stamp}.sqlite`);

await fs.mkdir(backupDir, { recursive: true });
const db = new Database(source);
try {
  await db.backup(destination);
} finally {
  db.close();
}

const cutoff = Date.now() - retentionDays * 86_400_000;
const entries = await fs.readdir(backupDir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.startsWith("handyman-crm-") || !entry.name.endsWith(".sqlite")) continue;
  const candidate = path.join(backupDir, entry.name);
  const stat = await fs.stat(candidate);
  if (stat.mtimeMs < cutoff) await fs.unlink(candidate);
}

console.log(`SQLite backup written: ${destination}`);
