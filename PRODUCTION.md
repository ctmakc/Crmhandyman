# HandymanPro production runbook

This file describes the minimum production operating contract for the standalone Handyman CRM.

## 1. Required configuration

Never use the defaults from `docker-compose.yml` for real production secrets.

```dotenv
DATABASE_URL=file:/app/data/crm.db
NEXTAUTH_URL=https://crm.example.com
NEXTAUTH_SECRET=<long random secret>
APP_VERSION=<git sha or release>
LEAD_INTAKE_SIGNING_SECRET=<separate long random secret>
BACKUP_DIR=/app/data/backups
BACKUP_RETENTION_DAYS=14
EVIDENCE_DIR=/app/data/evidence
EVIDENCE_MAX_BYTES=10485760
```

SMTP, Meta, Google and Mailgun credentials remain integration-specific and are documented in `.env.example`.

## 2. Database migrations

Before starting a new application image:

```bash
npx prisma migrate deploy
```

Do not replace this with `prisma db push` in production. The migration chain is exercised from an empty SQLite database in CI.

## 3. Health

`GET /api/health` is deliberately public and contains no tenant/customer data. A healthy response means the application can execute a query against its configured database.

Expected status:

```json
{
  "status": "ok",
  "database": "ok"
}
```

Docker Compose checks this endpoint every 30 seconds. External monitoring should check it as well.

## 4. SQLite backups

Create a transactionally consistent backup with SQLite's backup API:

```bash
npm run backup
```

The command writes timestamped copies into `BACKUP_DIR` and prunes files older than `BACKUP_RETENTION_DAYS`.

A local backup in the same Docker volume protects against application/database mistakes but does **not** protect against host or volume loss. Production must replicate the newest backup off-host (object storage, another server, or another backup system).

Recommended schedule: at least daily; hourly for an actively used operation desk.

A restore drill should be performed before launch and periodically thereafter:

1. stop writes;
2. copy the selected backup to a separate test location;
3. start the application against the restored copy;
4. verify clients, jobs, invoices, payments and evidence metadata;
5. verify the corresponding evidence directory is present from the same backup generation.

## 5. Job evidence

Before/after photos are private operational/customer evidence.

- Metadata is tenant- and project-scoped in `WorkEvidence`.
- Files live under `EVIDENCE_DIR`, never under Next.js `/public`.
- Reads and deletes pass through authenticated API routes.
- Stored files are mode `0600`; directories are mode `0700` where supported.
- Supported upload types: JPEG, PNG, WebP, HEIC and HEIF.
- Default maximum file size: 10 MiB.
- SHA-256 is stored with each record for integrity/audit use.

The default Docker deployment places evidence under `/app/data/evidence`, the same persistent volume as SQLite. Off-host backups must therefore include both the SQLite backup and evidence files.

## 6. Signed lead intake

Owned landing pages should create leads through:

```text
POST /api/intake/<tenant-slug>/lead
```

Required headers:

```text
Content-Type: application/json
x-handyman-timestamp: <Unix time in milliseconds>
x-handyman-signature: sha256=<hex hmac>
```

Signature input is exactly:

```text
<timestamp>.<raw request body>
```

HMAC algorithm: SHA-256 using `LEAD_INTAKE_SIGNING_SECRET`.

Example Node signer:

```js
import crypto from "node:crypto";

const body = JSON.stringify({
  externalId: "dream-hvac-form-123456",
  name: "Jamie Example",
  phone: "+16135550123",
  source: "OTHER",
  jobType: "Furnace repair"
});
const timestamp = String(Date.now());
const signature = crypto
  .createHmac("sha256", process.env.LEAD_INTAKE_SIGNING_SECRET)
  .update(`${timestamp}.${body}`)
  .digest("hex");
```

The server rejects signatures outside a five-minute clock window. Each landing submission must send a stable `externalId`; retry the same request with the same `externalId` rather than inventing a new ID.

Do not put `LEAD_INTAKE_SIGNING_SECRET` in browser JavaScript. The landing backend/serverless function signs the request server-side.

## 7. Audit journal

Core operational changes now emit `AuditEvent` records. Admins can query `/api/audit`.

The first production wave journals:

- lead create/update/delete;
- payment create/delete;
- expense create/delete;
- job status and crew changes;
- before/after evidence add/delete;
- externally ingested leads.

Audit coverage should continue to estimates, invoices, tasks, service contracts and settings before those areas are treated as fully forensically auditable.

## 8. Release gate

A release candidate must pass:

```bash
npm run verify
```

CI additionally applies the full migration chain to a clean database before running verification.

Do not merge a production-hardening PR while the final head is red.
