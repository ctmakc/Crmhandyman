# HandymanPro CRM

Work-order CRM for Canadian HVAC, moving and trade contractors. Next.js 14, Prisma,
SQLite, Tailwind CSS, NextAuth.

The interface follows the «НАРЯД / WORK ORDER» design system — see **[DESIGN.md](DESIGN.md)**
before touching any UI. Tokens are law: no raw hex in components, one 3px radius, zero
box-shadows, every number in Chivo Mono.

## Features

- **Multi-channel lead intake** — Facebook Lead Ads, Instagram, Google Local Services Ads, HomeStars/Kijiji (via email), manual entry
- **Clients** — the customer, not a string on a ticket: one address with its whole
  history, balance owing, lifetime paid, and every job and invoice on it
- **Equipment** — what is installed at the address (furnace, AC, heat pump…): brand,
  model, serial, location, install date and warranty. A job shows it before the drive.
- **Lead management** — contact, verify, reject, convert to a job (carrying the client)
- **Jobs** — full work-order lifecycle (Scheduled → In Progress → Completed)
- **Estimates** — line-item builder with HST/GST, printable view, PDF export
- **Invoices** — an accepted estimate tears off into a numbered invoice (`INV-YYYY-NNNN`)
  with the same lines and totals; mark sent, log part payments, auto-settle to PAID, void
  (never delete) so the numbering stays honest. Payments write real `Payment` rows, so
  Finance and the invoice can never disagree.
- **Service contracts** — seasonal maintenance plans that book themselves onto the
  board. The schedule is derived, so no cron owns the truth, and pressing "book"
  twice never double-books a visit. Optional draft invoice per visit.
- **Field mode** (`/today`) — the tech's screen: today's stops, the equipment on site,
  and call / drive / start / finish in one tap each. Unclosed work carries forward.
- **Field mode works with no signal** — the board is installable on a phone and keeps
  the last answer it received, stamped with the time it arrived. Start and finish taken
  in a basement queue up and send themselves when the signal returns; each one carries
  the status the tech was looking at, so the dispatcher who cancelled the job an hour ago
  wins and the tap comes back as a rejection he can read. Taking a payment and uploading
  a photo stay online actions — replaying those would book the same $500 twice.
- **New-lead alerts** (`Settings → Lead alerts`) — a lead arriving from a landing page,
  a Meta form or the mail hook reaches the owner's own Telegram bot and inbox within
  seconds, with the phone number in dialable form. Quiet hours hold the message and say
  when it goes out; a burst folds into one digest. The bot token never leaves the server.
  Every attempt is written to the action log, including the ones that failed.
- **The response clock** — how long each lead has been waiting for a callback, on the
  card as a stopwatch and on the sheet as a column that sorts it. The call sheet points
  at today: live unanswered leads on top, cold ones below them, worked ones last.
- **Ad channel report** (`/reports`, owner only) — leads → reached → jobs → invoiced →
  collected → margin per channel, against the ad spend booked for that month: cost per
  lead, cost per job, return on the ad dollar, and the average time to first reply.
  Exports as CSV.
- **Crew load and double booking** — the week rail counts the day by who actually holds
  the work, names the man with two jobs at once, and counts a multi-day renovation on
  every day it runs. A clash warns and lets the dispatcher through: two short moving
  jobs in one afternoon is a normal Saturday.
- **Tasks** — crew kanban (drag & drop), assign to workers
- **Job economics** — quoted → invoiced → collected → costs → margin on every job.
  Margin is measured against what was *collected*, not what was billed: money still on
  the street is not profit. Flags the two silent leaks — quoted-but-never-invoiced and
  billed-but-unpaid.
- **Deposits** — an accepted estimate can be torn into two independently payable
  invoices (50/50, 30/70, 25/75). The deposit is a single percentage line; the balance
  carries the real items and subtracts the deposit. The halves sum to the whole exactly.
- **Overdue reminders** — the first week carries no pressure (the bill goes out again
  «for your records»), the nudge lands on day 7, the «when can we expect it» on day 14,
  the stop-work notice on day 30. One ladder feeds both the lane and the letter, so they
  cannot disagree. An invoice with no address on file moves to a CALL band with the
  number, the balance and what the work was; the letter is still written, as the script
  for that call. The attempt is always recorded, and one delivered reminder per invoice
  per day is the ceiling.
- **CSV export** — invoices, payments, expenses and per-job margin, Excel-safe
- **Finance** — payments (cash, e-transfer, cheque, card), expenses by category, monthly P&L
- **Renovation** — the third vertical: 53 reno line items priced for Ottawa, four whole-job
  templates (repaint, bathroom gut, basement, kitchen) and an area take-off that turns
  floor area, ceiling height, room count and scope into an editable scope of work
- **Landing-page intake** (`Settings → Landing intake`) — issue a key, point your own
  quiz or contact form at `POST /api/intake/<key>`, and the answers arrive as a lead with
  the whole questionnaire written into its notes. The workspace comes from the key alone,
  duplicates inside the dedup window fold together, and the desk shows when the channel
  last fired. See **[docs/INTAKE.md](docs/INTAKE.md)**.
- **Job photos** — before/after shots straight from the phone on the job card. Stored
  outside `public/`, so every read passes the session check; signatures are sniffed from
  the bytes, so a renamed file is refused.
- **Action log** (`Settings → Action log`) — who took the payment, who moved the price,
  who voided the invoice. Append-only: nothing in the code updates or deletes a line, and
  a failure to write one never blocks the payment it was describing.
- **Team** — admin + multiple workers, role-based access. The books, the paper, the
  export and the prices are the owner's; the field screens, photos and taking money at
  the door are the whole crew's. Everyone can change their own password on `/account`.
- **Mobile-friendly** — the same deck works on a phone in a driveway: 44px targets in
  the field, a visible focus ring, a skip link into the day's work, and every tone
  doubled by something other than colour

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Set up database
npx prisma migrate dev --name init

# 4. Seed with sample data
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts

# 4a. If you are upgrading an existing database, fold the old clientName strings
#     into real Client rows (safe to re-run):
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/backfill-clients.ts

# 4b. (optional) Fill a realistic HVAC/moving week — leads, booked jobs, an accepted
#     estimate, an issued invoice with a part payment, and one overdue invoice.
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/demo-fill.ts

# 5. Run
npm run dev
```

Open http://localhost:3000

**Default login** — the local seed only, never a deployed workspace:
- Admin: `admin@handyman.ca` / `admin123`
- Worker: `worker1@handyman.ca` / `worker123`

A real client's workspace is opened with `scripts/provision-tenant.ts`, which mints a
random password per account and prints it once — see **[docs/ONBOARDING.md](docs/ONBOARDING.md)**
for the fifteen-minute runbook and **[docs/OWNER-GUIDE.md](docs/OWNER-GUIDE.md)** for what
to hand the contractor.

## Tests

```bash
npm run test        # unit + end-to-end, one command
```

Two suites under one runner. `unit` covers the money rules out of `src/lib` — tax and
totals, invoice state, deposit splits, the moving calculator, local-day parsing, the
response clock, the quiet-hours window and the enum guards. `e2e` boots the real
application on a throwaway database and drives it over HTTP with real sessions: the whole
chain from a landing-page lead to a settled invoice, and a second workspace failing to
reach the first one through every route that takes an id.

The end-to-end suite never touches `dev.db`. It builds its own database with
`prisma migrate deploy` in a temp directory and deletes it on the way out.

### Does the paper add up?

```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/check-money.ts
```

Read-only. Walks every estimate and invoice in the database and asserts the two promises
printed on each one: the line amounts add up to the subtotal, and the subtotal plus tax
is the total. Exits non-zero when one does not, so it can gate a release. Run it before
handing a workspace to a client and after any import — a stored total nobody looks at is
exactly where a document quietly stops adding up.

## Deployment

**[DEPLOY.md](DEPLOY.md)** is the whole path: Docker on a VPS, wildcard DNS and TLS,
`/api/health`, nightly SQLite backups with a verified restore, and the rollback.

## Channel Integrations

### Facebook Lead Ads
1. Create a Meta Developer App at https://developers.facebook.com
2. Add `META_APP_ID`, `META_APP_SECRET` to `.env`
3. Webhook URL: `https://yourdomain.com/api/webhooks/facebook`
4. Subscribe to `leadgen` events on your Facebook Page
5. In Settings → Integrations, enter your Page Access Token and Page ID

### Instagram
1. Same Meta app as Facebook
2. Subscribe to `messages` webhook for your Instagram Business Account
3. Webhook URL: `https://yourdomain.com/api/webhooks/instagram`

### Google Local Services Ads
1. Create a Google Cloud project, enable Local Services API
2. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`
3. In Settings → Integrations, connect with Google OAuth

### HomeStars / Kijiji / Email
1. Set up Mailgun account, configure inbound email parsing
2. Route to: `https://yourdomain.com/api/webhooks/email`
3. Forward HomeStars/Kijiji notification emails to your Mailgun address

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: SQLite via Prisma 7 + better-sqlite3 adapter
- **Auth**: NextAuth.js (email/password)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
