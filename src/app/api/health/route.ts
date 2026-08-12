import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

// A probe that answers from cache is worthless, and the database driver is Node-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MigrationRow = {
  migration_name: string;
  finished_at: unknown;
  rolled_back_at: unknown;
};

/** Public endpoint: the reason is a fixed code, never a message from the driver. */
function fail(reason: string) {
  return NextResponse.json({ status: "error", reason }, { status: 503 });
}

/**
 * Liveness for the reverse proxy, the container healthcheck and the uptime monitor.
 *
 * Answering 200 because the process is up would hide the two failures that actually
 * happen on this stack: the volume with the SQLite file is not mounted, and the image
 * ships migrations the running database has never applied.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return fail("database_unreachable");
  }

  let rows: MigrationRow[];
  try {
    rows = await prisma.$queryRaw<MigrationRow[]>`
      SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
    `;
  } catch {
    return fail("migration_journal_missing");
  }

  // Prisma's own reading of the journal: a row that started and never finished is the
  // P3009 failure, while a rolled-back row is resolved history — `migrate resolve` left
  // one behind on this very database and the schema is fine.
  if (rows.some((r) => r.finished_at == null && r.rolled_back_at == null)) {
    return fail("migration_failed");
  }

  const applied = new Set(
    rows.filter((r) => r.finished_at != null && r.rolled_back_at == null).map((r) => r.migration_name),
  );

  let shipped: string[];
  try {
    const dir = path.join(process.cwd(), "prisma", "migrations");
    const entries = await readdir(dir, { withFileTypes: true });
    shipped = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return fail("migration_folder_unreadable");
  }

  if (shipped.some((name) => !applied.has(name))) {
    return fail("migration_pending");
  }

  return NextResponse.json({ status: "ok", migrations: applied.size });
}
