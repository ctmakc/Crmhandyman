# Beaver Movers — production go-live

This is the operator runbook for the first real HandyCRM tenant. It is intentionally
specific: do not substitute old Beaver contact data or invent a different workspace slug.

## Canonical workspace identity

- Business: `Beaver Movers`
- Slug: `beaver-movers`
- Workspace URL: `https://beaver-movers.itopsi.com`
- Owner/admin: Darryl — `darryl@beavermovers.com`
- Worker: Mike — `mike@beavermovers.com`
- Worker: Nicolas — `nicolas@beavermovers.com`
- Operating assumptions: Canada, `America/Toronto`, English Canada, CAD

The current schema does not persist tenant timezone/locale/currency as separate fields;
the product is already Canadian/CAD-oriented and automation schedules are timestamp-based.
Do not add a launch-week migration only to duplicate those defaults.

## Gate 1 — prove there is a production host

Do not provision against a laptop database and do not assume the historical host is still
production. From the repository root:

```bash
deploy/hostd/status.sh
```

The last documented host defaults to `root@66.94.107.112:222`. If production moved:

```bash
HANDYCRM_DEPLOY_BOX=root@<real-ip> \
HANDYCRM_DEPLOY_SSH_PORT=<real-port> \
deploy/hostd/status.sh
```

Required before continuing:

1. SSH succeeds.
2. `/opt/handyman-crm/deploy/hostd/.env` exists.
3. local `http://127.0.0.1:3080/api/health` returns healthy JSON.
4. `https://crm.itopsi.com/api/health` returns healthy JSON.
5. Cloudflare ingress routes `crm.itopsi.com` and `*.itopsi.com` to `http://crm:3000`.

If local health is green but public health is red, fix DNS/tunnel first. Provisioning a
tenant that nobody can open only creates credentials that have to be handled twice.

## Gate 2 — deploy current main

```bash
git checkout main
git pull --ff-only
deploy/hostd/deploy.sh
```

If the production host differs from the historical default, use the same
`HANDYCRM_DEPLOY_BOX` / `HANDYCRM_DEPLOY_SSH_PORT` overrides as above.

The production `.env` must use:

```dotenv
NEXTAUTH_URL="https://crm.itopsi.com"
CRM_HOME_HOST="crm.itopsi.com"
NEXTAUTH_COOKIE_DOMAIN=".itopsi.com"
NEXT_PUBLIC_AUTH_ORIGIN="https://crm.itopsi.com"
```

For lead automation, also set a random `AUTOMATION_CRON_SECRET` in the app `.env` and the
same value in the GitHub Actions repository secret `AUTOMATION_CRON_SECRET`. Set repository
secret `AUTOMATION_PROCESSOR_URL` to `https://crm.itopsi.com`.

## Gate 3 — provision Beaver Movers in the production database

Run **inside the production app container** so `DATABASE_URL=file:/app/var/crm.db` is the
same database the live application uses:

```bash
cd /opt/handyman-crm

docker compose -f deploy/hostd/docker-compose.prod.yml exec crm \
  npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/provision-tenant.ts \
  --business "Beaver Movers" \
  --slug beaver-movers \
  --owner darryl@beavermovers.com \
  --owner-name "Darryl" \
  --plan paid \
  --worker "Mike <mike@beavermovers.com>" \
  --worker "Nicolas <nicolas@beavermovers.com>" \
  --domain itopsi.com
```

The script is idempotent by slug. It prints generated passwords exactly once. Deliver each
credential privately to its owner; do not paste passwords into GitHub, this document, logs,
or shared chats.

Acceptance:

- plan is `PAID` and status is `ACTIVE`;
- owner is ADMIN;
- Mike and Nicolas are WORKER;
- workspace starts empty;
- login URL printed by the script is `https://beaver-movers.itopsi.com`.

## Gate 4 — Twilio

Open Beaver workspace → Settings → SMS and enter Beaver's actual Twilio Account SID,
write-only Auth Token and Canadian sending number. Then enable, in this order:

1. Instant acknowledgement.
2. 5-minute human SLA callback.
3. 2-hour / 24-hour no-reply nurture.

Twilio incoming-message webhook:

```text
https://crm.itopsi.com/api/webhooks/twilio/sms
```

Acceptance:

- manual SMS sends and appears in conversation history;
- reply appears on the same lead and raises a due-now callback;
- STOP blocks another outbound send;
- START restores consent;
- automatic acknowledgement does not change `NEW` to `CONTACTED`.

## Gate 5 — Beaver website intake

In Beaver workspace → Settings → Lead intake, create a key for the real Beaver lead form,
source `OTHER` or the most accurate existing enum until attribution expansion lands.
Store the generated intake URL only in the website/server configuration that needs it.

Submit one named test lead from the real form and verify:

- exactly one lead is created;
- response clock starts;
- acknowledgement sends when SMS automation is enabled;
- 5-minute SLA task is created;
- the test appears in Leads, Activity and SMS history.

## Gate 6 — Meta Lead Ads

Configure the real Beaver Meta Page integration and app secrets. The webhook endpoint is:

```text
https://crm.itopsi.com/api/webhooks/facebook
```

Use Meta's Lead Ads testing tool, then a real form submission. Acceptance is the same as
website intake: one lead, correct tenant, correct source, alert, acknowledgement, callback
queue and no duplicate on webhook retry.

## Gate 7 — marketplace bridge

Create a Beaver-specific inbound email address and route HomeStars / Google LSA / Bark
notifications through the existing EMAIL integration. Do not share an inbound recipient
with another tenant; `normalizedAddress` is globally exclusive for exactly this reason.

## First-day operating view

The dispatcher should be able to live almost entirely on Leads:

- `OVERDUE` callbacks first;
- `TODAY` next;
- use one-tap outcomes after every attempt;
- use the SMS composer for written follow-up;
- convert only genuinely booked work into a Job.

Do not turn on paid traffic until a real test lead has passed website/Meta → CRM → SMS →
callback → booked-job flow end to end.
