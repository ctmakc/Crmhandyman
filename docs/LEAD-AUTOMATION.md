# Lead automation — Beaver first-client setup

This layer runs on top of the existing Lead + Task + AuditLog + SMS primitives. It does not introduce another customer-message ledger.

## What it does

When a non-manual lead with a phone number lands from Facebook, landing intake, email/marketplace intake or another inbound channel, the SMS channel may independently enable three behaviours:

1. **Instant acknowledgement** — sends the `ACKNOWLEDGEMENT` moving template. The lead remains `NEW`; an automatic receipt is not counted as a human response.
2. **5-minute human SLA** — creates a normal lead callback task due five minutes after lead creation. It appears in the Leads callback inbox.
3. **No-reply nurture** — creates two hidden durable automation tasks, due after 2 hours and 24 hours. The first asks for move details; the second is the final check-in.

All automation switches default OFF, including for workspaces that already had SMS configured before this feature.

## Stop conditions

Remaining generic nurture is cancelled when:

- a user records any sales/call outcome;
- a user successfully sends an SMS from the lead desk;
- the customer sends a normal inbound SMS reply;
- the customer sends STOP / another supported opt-out command;
- the lead is no longer `NEW` when a due automation step is processed.

A START reply restores SMS consent but does not resurrect an old nurture sequence.

## Delivery semantics

Instant acknowledgement is deliberately **at-most-once**. The CRM writes an append-only `lead.automation.ack_claimed` record before calling Twilio. If the process dies in the tiny window after that reservation, the acknowledgement may be lost, but a retry cannot double-text the customer.

Delayed steps are durable `Task` rows. The scheduler atomically claims `TODO -> IN_PROGRESS` before contacting Twilio. Uncertain provider/network failures are completed rather than retried automatically; the 5-minute human callback remains the operational backstop.

## Scheduler configuration

The public scheduler route is:

```text
POST /api/webhooks/lead-automation?limit=50
Authorization: Bearer <AUTOMATION_CRON_SECRET>
```

The route fails closed when `AUTOMATION_CRON_SECRET` is empty.

Set the application environment variable:

```text
AUTOMATION_CRON_SECRET=<fresh random secret>
```

Then add these GitHub repository secrets:

```text
AUTOMATION_PROCESSOR_URL=https://crm.itopsi.com
AUTOMATION_CRON_SECRET=<same secret as the app>
```

`.github/workflows/lead-automation.yml` calls the processor every five minutes. With either GitHub secret absent, the workflow exits successfully without calling anything.

## Beaver acceptance

Before enabling automation for Beaver Movers:

1. Finish `docs/SMS-SETUP.md` and verify a real two-way Twilio conversation.
2. Open Settings -> SMS and enable **Instant acknowledgement**, **5-minute human SLA**, then **No-reply nurture**.
3. Submit one real Beaver test lead from the intended landing/Meta source.
4. Confirm the lead remains `NEW` after the automatic acknowledgement.
5. Confirm the acknowledgement is present in the lead audit history with `lead.automation.ack_sent`.
6. Leave the test untouched and confirm it appears in the callback inbox after five minutes.
7. For a shortened non-production timing test, unit/e2e fixtures may override config values; production UI intentionally keeps 5m / 2h / 24h fixed for the first client.
8. Reply from the customer's phone and confirm remaining `[[AUTOMATION:*]]` tasks close while a due-now `Reply — <lead>` callback appears.
9. Send STOP and verify the lead desk refuses outbound SMS until START is received.
10. Confirm the scheduler endpoint returns 401 with no/wrong secret and 200 with the configured secret.

Do not enable automatic nurture on a new tenant until the sending number, business identity and STOP handling have all been tested end-to-end.
