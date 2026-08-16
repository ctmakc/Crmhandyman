# Presentation workspace — a shop to show a prospect

A live, believable HVAC + moving contractor's world you can walk a prospect through on
`<slug>.agintent.com` without apologising for a single screen. Two commands stand it up;
the rest of this doc is the story to tell once it is up.

The data comes from `prisma/present-fill.ts`. It is the presentation cousin of
`prisma/demo-fill.ts`: that one dresses the dev database with sample-grade rows, this one
dresses a **named workspace** to production polish — every job points at a real client, the
iron on the client's card is the iron the job replaces, the accepted estimate is the one the
invoice was cut from, and the money reconciles to the cent through the same `src/lib/money.ts`
helpers the live app prices with.

---

## The one fact that sells itself: the address already exists

A wildcard DNS record (`*.agintent.com`) already points every third-level subdomain at the
app. **A new business gets a working address the moment you pick its slug — nothing to
provision, no DNS to wait on.** `northwind.agintent.com` answers the instant `northwind`
exists as a workspace. `crm.agintent.com` is the front door; every `<slug>.agintent.com` is
that business's own desk. Say this out loud during the demo — it is the part a prospect does
not expect.

---

## Spin one up on prod (about 3 minutes)

Run both from the repository root, so `DATABASE_URL`'s relative path lands on the live
`dev.db` (not `prisma/dev.db` — see `docs/ONBOARDING.md` step 0).

### 1 — Open the workspace

`provision-tenant` opens a workspace and mints the owner's (and any crew's) passwords. It
prints each credential **once**; copy them then.

```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/provision-tenant.ts \
  --business "Northwind Mechanical & Movers" --slug northwind \
  --owner you@youragency.ca --plan paid --domain agintent.com \
  --worker "Sam Carrière <sam@northwind.demo>" \
  --worker "Dylan Roy <dylan@northwind.demo>"
```

A provisioned workspace is `ACTIVE` from birth — you can sign in immediately. (A workspace a
stranger opens through "Continue with Google" starts `PENDING` and waits for
`scripts/approve-tenant.ts`; that is not this path.)

### 2 — Fill it with the presentation world

```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/present-fill.ts --slug northwind
```

The slug is resolved from `--slug`, then `PRESENT_SLUG`, then the dev default `demo`. The
script prints the ledger back — invoice by invoice, paid vs total vs owing — so you **see**
the books balance before the meeting:

```
INV-2026-0100  SENT          $0.00 /     $213.57 →     $213.57 owing   (overdue)
INV-2026-0101  PAID      $5,686.73 /   $5,686.73 →       $0.00 owing   (deposit)
INV-2026-0102  SENT          $0.00 /   $5,686.73 →   $5,686.73 owing   (balance out)
INV-2026-0103  PARTIAL   $4,813.80 /   $9,627.60 →   $4,813.80 owing   (half paid)
INV-2026-0104  PAID      $1,689.35 /   $1,689.35 →       $0.00 owing
INV-2026-0105  PAID        $525.45 /     $525.45 →       $0.00 owing
```

**Idempotent-ish.** The first run stamps the workspace's own journal with a `present.fill`
entry; a second run reads that stamp and refuses, so you cannot accidentally double the
pipeline an hour before the meeting. To re-seed a wiped workspace, set `PRESENT_FORCE=1`.

### Crew sign-in

If the workspace already has its own crew (from `--worker` flags above, or a real team), the
jobs are assigned to them and nothing is minted. If it has none, `present-fill` creates a
two-person shop — **Sam Carrière** (HVAC) and **Dylan Roy** (mover) — who sign in with the
demo password `crew-demo-4821`. That is only for a throwaway demo desk; a real workspace's
passwords always come from `provision-tenant`.

### Tear it down

A demo workspace is just a tenant. Remove it (and its users) with
`scripts/approve-tenant.ts --slug northwind --delete`. A workspace that has done real work is
protected by the FK relations and will refuse — which is the safe outcome.

---

## What's in the box

| Screen | What a prospect sees |
|---|---|
| **Dispatch** | This week's board: 1 job in progress, 3 booked, 3 done — crew load lines under each day, nobody double-booked. The money rail on the right. |
| **Leads** | 12 leads across every channel (Google, Facebook, Instagram, HomeStars, Kijiji, email) and every stage (New → Contacted → Verified → Rejected → Converted). Fresh ones today, aging ones going rose past three days, call-log notes with time stamps. |
| **Jobs** | The state ladder: the heat-pump install live as a full ticket, three jobs booked on the date rail, three completed in the drawer. |
| **Clients** | Seven customers with the iron on site — furnaces, AC, a rooftop unit — warranty active (emerald) or expired (rose), plus two service contracts. |
| **Contracts** | Two maintenance plans on the year rule: a commercial rooftop (spring + fall) and an annual furnace plan. |
| **Invoices** | Six invoices in a paid / partial / overdue mix, including a deposit-and-balance pair cut from one install estimate. |
| **Finance** | The T-account: this week's revenue against materials, fuel and tool expenses, netting out. |

---

## The story, screen by screen

Walk it in this order. It follows one lead from a phone call to paid money, then widens to
the shop's whole week.

1. **Open on Dispatch.** "This is the dispatcher's desk on a Tuesday morning." Point at the
   week board — the job **in progress** (amber, live), the ones **booked** later in the week,
   the crew load lines naming who is out. The money rail on the right is the day's numbers.

2. **Leads — the morning call sheet.** "Every enquiry lands here, from every channel." Show
   the pipeline strip up top, then the split: fresh leads on the phone side, the aging ones
   turning rose because nobody has called back. Open **Ingrid Sørensen** — the call log with
   time-stamped notes is the record of the follow-up.

3. **Follow a converted lead into a job.** **Liam O'Doherty** started as a Google lead and
   is now the **heat-pump install** in progress. Open the job: the accepted estimate, the
   crew, the schedule, the paper trail.

4. **The install's money — deposit and balance.** From Liam's job, the estimate was accepted
   and cut into **two invoices**: a 50% deposit (paid, `INV-2026-0101`) and the balance
   (`INV-2026-0102`, out, due on commissioning). "This is exactly how a shop bills an
   install — half on booking, half on completion, each half independently payable."

5. **Clients — the iron on site.** Open **Meadowbrook Dental**: the rooftop unit, its serial
   and warranty date, and the spring/fall service contract that bills automatically. "The
   product knows the equipment, not just the ticket — that's the recurring revenue an HVAC
   shop lives on."

6. **Invoices — the receivables book.** The ledger, grouped by aging. Show the healthy paid
   rows, the half-paid furnace job, and the **overdue** tune-up (`INV-2026-0100`) that the
   chase lane has already reminded once. "Overdue is derived from the due date and what's
   actually owed — no stale flag, the desk can't disagree with reality."

7. **Finance — the books.** Close on the T-account: the week's revenue on the left, materials
   and fuel and tools on the right, netting to a number. "Every figure on this screen traces
   back to an invoice or an expense you just saw — nothing is typed twice."

8. **Land the address point.** "And this whole desk lives at
   `northwind.agintent.com` — a business gets its own working address the day it signs up,
   automatically." That is the close.

---

## Notes

- **Money always reconciles.** Every invoice's total is priced from its own line items via
  `quoteTotals`, and every payment is written against the total the invoice stored (read
  back, never re-typed). The paid invoices are paid to the cent; the partial is exactly half;
  the overdue owes its whole total.
- **No before/after photos.** The completed jobs are records without image files attached —
  a demo desk carries no broken thumbnails and no client's house behind a public URL.
- **Everything is "this week."** Jobs are dated against the current week and leads aged in
  days, so the board and the call sheet read as today no matter when you run the script.
- **It touches one workspace only.** `present-fill` writes to the slug you name and stamps
  that workspace's journal. It never reaches another tenant's data.
