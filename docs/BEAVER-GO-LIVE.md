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
bash deploy/hostd/status.sh
```

The last documented host defaults to `root@66.94.107.112:222`. If production moved:

```bash
HANDYCRM_DEPLOY_BOX=root@<real-ip> \
HANDYCRM_DEPLOY_SSH_PORT=<real-port> \
bash deploy/hostd/status.sh
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

For Meta Lead Ads, the production app must also have `META_APP_SECRET` and
`META_WEBHOOK_VERIFY_TOKEN`. `META_APP_ID` is useful operator metadata but the runtime
webhook does not depend on it.

## Gate 3 — provision Beaver Movers in the production database

The production image intentionally does not contain `ts-node`. During image build the
operator provisioner is compiled to `scripts/provision-tenant.js`. Run that compiled JS
**inside the production app container** so it sees the live
`DATABASE_URL=file:/app/var/crm.db`:

```bash
cd /opt/handyman-crm

docker compose -f deploy/hostd/docker-compose.prod.yml exec crm \
  node scripts/provision-tenant.js \
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

## Gate 4 — Beaver moving rate card

Before anybody creates a customer moving estimate, open Beaver workspace → Settings →
Moving rate card and enter **Beaver's actual sell rates** for:

- 2 movers + 20ft truck / hour;
- 3 movers + 26ft truck / hour;
- 4 movers + 26ft truck / hour;
- stair carry per flight;
- packing materials kit;
- wardrobe box rental;
- piano / safe handling.

Do not copy the generic Ottawa starting values from the source price book and do not invent
rates for launch. Darryl (or another authorized Beaver operator) must supply the commercial
numbers. Crew rates must be greater than zero; an add-on may be zero if Beaver does not
charge it.

Acceptance:

- Settings → Moving rate card shows `LIVE RATES`;
- a moving template/calculator uses Beaver's saved crew/add-on prices;
- a moving estimate cannot be saved while the rate card is absent or invalid;
- changing a moving line quantity is allowed, but server-side save re-prices recognized
  moving rate lines from the tenant card so stale demo prices cannot become an EST document.

## Gate 5 — Twilio

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

## Gate 6 — Beaver website intake

In Beaver workspace → Settings → Landing intake, create a key for the real Beaver lead form
with source `WEBSITE`. Store the generated intake URL only in the website/server
configuration that needs it.

Submit one named test lead from the real form and verify:

- exactly one lead is created;
- response clock starts;
- acknowledgement sends when SMS automation is enabled;
- 5-minute SLA task is created;
- the test appears in Leads, Activity and SMS history;
- the WEBSITE intake key shows a recent `lastUsedAt`.

## Gate 7 — Meta Lead Ads

Configure the real Beaver Facebook Page integration and app secrets. The webhook endpoint is:

```text
https://crm.itopsi.com/api/webhooks/facebook
```

Use Meta's Lead Ads testing tool, then a real form submission. Acceptance is the same as
website intake: one lead, correct tenant, correct source, alert, acknowledgement, callback
queue and no duplicate on webhook retry.

Configure Settings → Meta Ads reporting separately with the ad-account id and an Ads Insights
read token. Run a spend sync for the current month. This reporting connection is not allowed
to block lead intake, but it is the source of campaign/ad-set/ad spend, CPL, cost/job and ROAS.

## Gate 8 — marketplace bridge

Create a Beaver-specific inbound email address and route HomeStars / Google LSA / Bark
notifications through the existing EMAIL integration. Do not share an inbound recipient
with another tenant; `normalizedAddress` is globally exclusive for exactly this reason.

## Gate 9 — final live readiness verdict

After the real website/Meta acceptance lead has run through the live tenant, open:

```text
https://beaver-movers.itopsi.com/settings/go-live
```

or Settings → Go-live readiness.

The screen reads live tenant/server facts; it does not accept manual checkboxes. It verifies:

- workspace is active and identifies the paid/demo plan;
- approved admin/crew access;
- customer-facing business/payment details;
- active WEBSITE intake and its usage evidence;
- Twilio credentials/number;
- lead automation and `AUTOMATION_CRON_SECRET` when delayed steps are enabled;
- a deliverable lead-alert transport and recent delivery evidence;
- Facebook Page Lead Ads routing plus server webhook secrets;
- Meta Ads spend reporting/sync as advisory measurement readiness;
- a non-manual lead from the last seven days;
- SMS evidence tied to that exact latest acceptance lead.

The generic go-live gateboard is cross-vertical and therefore does not currently infer that a
tenant is a mover. For Beaver, Gate 4 above is an additional operator requirement even if the
generic gateboard itself does not list it.

`BLOCKED` means do not turn on paid traffic. `WARN` does not itself block traffic, but every
warning must be understood before launch. Meta Ads spend reporting is intentionally advisory:
missing ROAS must never cause the CRM to reject a customer lead.

## First-day operating view

The dispatcher should be able to live almost entirely on Leads:

- `OVERDUE` callbacks first;
- `TODAY` next;
- use one-tap outcomes after every attempt;
- use the SMS composer for written follow-up;
- convert only genuinely booked work into a Job.

Do not turn on paid traffic until the live Go-live readiness verdict is `READY`, Beaver's
moving rate card is live, and the real website/Meta → CRM → alert → SMS → callback →
booked-job flow has been exercised end to end.
