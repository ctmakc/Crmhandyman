# HandymanPro production runbook

This file describes the minimum production operating contract for the standalone Handyman CRM.

## 1. Required configuration

Never use development defaults for production secrets.

```dotenv
DATABASE_URL=file:/app/data/crm.db
NEXTAUTH_URL=https://crm.example.com
NEXTAUTH_SECRET=<long random secret>
RATE_LIMIT_PEPPER=<separate long random pepper>
APP_VERSION=<git sha or release>
LEAD_INTAKE_SIGNING_SECRET=<separate long random secret>
PAYMENT_LINK_SIGNING_SECRET=<separate long random secret>
STRIPE_SECRET_KEY=<Stripe secret key>
STRIPE_WEBHOOK_SECRET=<Stripe endpoint signing secret>
BACKUP_DIR=/app/data/backups
BACKUP_RETENTION_DAYS=14
EVIDENCE_DIR=/app/data/evidence
EVIDENCE_MAX_BYTES=10485760
META_APP_SECRET=<Meta app secret>
META_WEBHOOK_VERIFY_TOKEN=<Meta verify token>
MAILGUN_WEBHOOK_SIGNING_KEY=<Mailgun signing key>
```

Keep `RATE_LIMIT_PEPPER`, `NEXTAUTH_SECRET`, `LEAD_INTAKE_SIGNING_SECRET` and `PAYMENT_LINK_SIGNING_SECRET` separate so they can be rotated independently. Rotating `PAYMENT_LINK_SIGNING_SECRET` intentionally invalidates every previously issued public invoice payment link.

## 2. Database migrations

Before starting a new application image:

```bash
npx prisma migrate deploy
```

Do not replace this with `prisma db push` in production. CI applies the complete migration chain to an empty SQLite database before testing the application.

## 3. Health

`GET /api/health` is public and contains no tenant/customer data. HTTP 200 means the process can query its configured database; database failure returns 503. Docker Compose checks the endpoint every 30 seconds and external monitoring should do the same.

## 4. SQLite backups

Create a transactionally consistent backup with:

```bash
npm run backup
```

Backups are written to `BACKUP_DIR` and pruned after `BACKUP_RETENTION_DAYS`. A backup in the same Docker volume is not disaster recovery: replicate the newest database backup and `EVIDENCE_DIR` off-host. Run a restore drill before launch and periodically thereafter.

## 5. Job evidence

Before/after photos are private customer/operational evidence.

- metadata is tenant/project scoped in `WorkEvidence`;
- files live under `EVIDENCE_DIR`, never Next.js `/public`;
- reads/deletes pass through authenticated tenant-scoped API routes;
- stored files are mode `0600`, directories `0700` where supported;
- JPEG, PNG, WebP, HEIC and HEIF are accepted;
- default maximum is 10 MiB;
- SHA-256 is retained for integrity/audit use.

## 6. Public ingress controls

All public lead-ingress paths fail closed when their verification dependency is unavailable. Rate-limit identifiers are SHA-256 hashed before persistence in `RateLimitBucket`.

Current limits:

- public tenant registration: 5/hour/IP;
- signed owned-site intake: 60/minute per tenant+IP;
- Facebook webhook: 300/minute/IP;
- Instagram webhook: 300/minute/IP;
- Mailgun webhook: 120/minute/IP.

If the durable rate-limit store fails, public mutation endpoints return 503 rather than accepting uncontrolled writes.

### Facebook / Instagram

Both Meta POST webhooks require a valid `X-Hub-Signature-256` HMAC. Missing `META_APP_SECRET` returns 503. Facebook events route only through the active integration whose configured `pageId` matches the event `page_id`. Instagram events route only through the configured account matching `entry.id`. There is no fallback to an arbitrary tenant.

### Mailgun

Mailgun requests require a valid, fresh signing tuple. Missing `MAILGUN_WEBHOOK_SIGNING_KEY` returns 503. The inbound recipient must match exactly one active EMAIL integration configuration; zero or ambiguous matches are not ingested.

### Exactly-once lead ingestion

Provider and owned-site retries are claimed through `InboundReceipt` with a database unique key `(tenantId, channel, externalId)`. The claim and Lead insert happen in one transaction. Concurrent duplicate deliveries resolve to the single committed Lead instead of creating duplicates.

## 7. Signed owned-site intake

Owned landing backends create leads through:

```text
POST /api/intake/<tenant-slug>/lead
```

Required headers:

```text
Content-Type: application/json
x-handyman-timestamp: <Unix time in milliseconds>
x-handyman-signature: sha256=<hex hmac>
```

The signature is HMAC-SHA256 over `<timestamp>.<raw request body>` using `LEAD_INTAKE_SIGNING_SECRET`. Requests outside a five-minute clock window are rejected. Every source submission must send a stable `externalId`; retries must reuse it. Never expose the signing secret in browser JavaScript.

## 8. Registration and billing state

Public signup always creates a seven-day `DEMO` tenant. A caller cannot self-select `PAID` in JSON. Paid activation belongs only to a verified billing/admin path. Reserved infrastructure slugs are not assigned to tenants.

## 9. Audit journal

Admins can query `/api/audit`. Audit coverage includes leads, lead conversion, project status/crew changes, estimates, tasks, invoices and invoice payments, expenses/payments, service-contract creation/booking, team administration, integrations, job evidence and tenant registration. Stripe Checkout creation, successful settlement and amount/state mismatches are also journaled. Secrets are never written to audit metadata.

## 10. Invoice/payment invariants

- invoice numbers are allocated from the highest tenant/year sequence and retry unique-key races;
- service-contract auto-invoices use the same allocator;
- manual invoice state can only move `DRAFT → SENT`;
- `PARTIAL`/`PAID` derive from real Payment rows;
- payment insertion and invoice settlement happen in one transaction;
- overpayment, payment on VOID, and voiding PAID invoices are rejected.

### Online card payment

Customer-facing invoice links are HMAC-bound to `(tenantId, invoiceId)` and look like `/pay/<invoice>?token=...`. The token authorizes access only to that invoice payment surface; it is not a user session.

Stripe Checkout is created server-side for the exact current amount owing in CAD. Repeated clicks for the same invoice balance reuse a deterministic Stripe idempotency key. Card details are entered on Stripe Checkout and are not stored by HandymanPro.

Configure the Stripe webhook endpoint:

```text
POST https://<crm-host>/api/webhooks/stripe
```

Subscribe to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
```

The webhook validates Stripe's signature and timestamp, then verifies tenant ID, invoice ID, CAD currency and exact outstanding cents before recording anything. Successful settlement writes a normal `Payment(method=CARD)`, marks the invoice paid and claims the Stripe event in `InboundReceipt` in one database transaction. Duplicate event delivery is therefore exactly-once at the CRM ledger.

If Stripe reports a paid amount that no longer equals the CRM balance (for example, an operator manually recorded payment while an old Checkout Session was still open), HandymanPro does not force the payment into the ledger. It records an audit mismatch for manual reconciliation/refund review instead.

Before enabling live mode, execute at least one Stripe test-mode card payment through the real hosted Checkout page and confirm the webhook turns the corresponding CRM invoice `PAID` exactly once.

## 11. Service visit idempotency

`ServiceVisitReceipt` claims `(tenantId, contractId, cycle)` before materializing a recurring visit. Concurrent `Book all due` requests cannot create the same seasonal visit twice. Auto-invoice recovery reuses the existing visit if a retry occurs after the project was already materialized.

## 12. Release gate

CI performs:

1. `npm ci`;
2. a production-dependency critical-advisory gate;
3. Prisma client generation;
4. the complete migration chain on clean SQLite;
5. database regression (`npm run test:db`) covering ingress idempotency, rate limits, lead-to-cash, tenant isolation, service-visit uniqueness, concurrent invoice numbering and exactly-once Stripe settlement;
6. core regression covering signature/tamper cases, TypeScript typecheck and production Next.js build (`npm run verify`).

Do not merge a production-hardening PR while its final head is red.
