import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { registerWorkspace, type Workspace } from "./client";

/**
 * Boots the whole application once for the e2e project and tears it down after.
 *
 * The database is a throwaway file built by `prisma migrate deploy`, never the working
 * `dev.db`: the suite registers workspaces, moves money and uploads files, and none of
 * that belongs in the data the owner is looking at. Nothing to clean up afterwards
 * either — the temp directory goes, and with it every row this run wrote.
 *
 * Overrides, all optional:
 *   E2E_BASE_URL     — talk to a server that is already up (skips spawn and migration)
 *   E2E_PORT         — port to boot on (default 3023; 3000/3001/3011 are taken here)
 *   E2E_PROJECT_DIR  — run the server out of another copy of the tree, which is what
 *                      keeps a parallel agent's `.next` from being trampled
 */

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(HERE, "../../..");

const PORT = Number(process.env.E2E_PORT || 3023);
const PROJECT_DIR = path.resolve(process.env.E2E_PROJECT_DIR || REPO_ROOT);
const BOOT_TIMEOUT_MS = 180_000;

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
    alpha: Workspace;
    beta: Workspace;
  }
}

function portInUse(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1500);
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess | null, log: () => string) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child?.exitCode != null) {
      throw new Error(`server exited with ${child.exitCode} before answering\n${log()}`);
    }
    try {
      const res = await fetch(new URL("/api/health", baseUrl));
      // 503 means the app is up and the database is not — a real failure, not a wait.
      if (res.status === 200) return;
      const body = await res.text();
      throw new Error(`/api/health answered ${res.status}: ${body}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("/api/health")) throw err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server never became healthy on ${baseUrl}\n${log()}`);
}

export default async function setup(project: TestProject) {
  const external = process.env.E2E_BASE_URL?.trim();
  let child: ChildProcess | null = null;
  let workdir: string | null = null;
  let output = "";
  const log = () => output.slice(-4000);

  const baseUrl = external || `http://localhost:${PORT}`;

  if (!external) {
    if (await portInUse(PORT)) {
      throw new Error(
        `port ${PORT} is already taken — set E2E_PORT to a free one, or E2E_BASE_URL to reuse that server`,
      );
    }

    workdir = mkdtempSync(path.join(tmpdir(), "crm-e2e-"));
    const dbPath = path.join(workdir, "e2e.db");
    const env = {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
      NEXTAUTH_SECRET: "e2e-secret-not-a-real-one",
      NEXTAUTH_URL: baseUrl,
      UPLOADS_DIR: path.join(workdir, "uploads"),
      // Trials must not expire mid-run, and the intake dedup window has to be known.
      TRIAL_DAYS: "7",
      LEAD_DEDUP_DAYS: "30",
      NODE_ENV: "development" as const,
      /**
       * The suite never edits a file while it runs, so hot reload is pure cost — and on
       * a busy machine it is worse than that. `inotify` instances are a per-user kernel
       * quota; with other work already holding them, the watcher fails with EMFILE, reads
       * the failure as "everything changed", and restarts the server in a loop that never
       * answers /api/health. Polling at a lazy interval touches no kernel watches and
       * notices nothing, which is exactly what is wanted here.
       */
      WATCHPACK_POLLING: "60000",
    };

    const prismaCli = path.join(REPO_ROOT, "node_modules", "prisma", "build", "index.js");
    if (!existsSync(prismaCli)) throw new Error(`prisma CLI missing at ${prismaCli} — run npm install`);
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      cwd: REPO_ROOT,
      env,
      stdio: "pipe",
    });

    const nextBin = path.join(PROJECT_DIR, "node_modules", "next", "dist", "bin", "next");
    const server = spawn(process.execPath, [nextBin, "dev", "-p", String(PORT)], {
      cwd: PROJECT_DIR,
      env,
      // Own process group: `next dev` forks a worker, and killing only the parent
      // leaves that worker holding the port for the next run.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (b) => (output += b.toString()));
    server.stderr?.on("data", (b) => (output += b.toString()));
    child = server;
  }

  await waitForHealth(baseUrl, child, log);

  // Two workspaces, opened the way a customer opens one. Both are DEMO trials, so each
  // arrives with sample data and a worker account whose password is shown exactly once.
  const alpha = await registerWorkspace(baseUrl, "Alpha");
  const beta = await registerWorkspace(baseUrl, "Beta");

  project.provide("baseUrl", baseUrl);
  project.provide("alpha", alpha);
  project.provide("beta", beta);

  return async () => {
    if (child?.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
      await new Promise((r) => setTimeout(r, 1500));
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
    if (workdir) rmSync(workdir, { recursive: true, force: true });
  };
}
