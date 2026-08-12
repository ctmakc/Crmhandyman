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
- **Crew load** — jobs per day against crew size, overbooked days flagged
- **Tasks** — crew kanban (drag & drop), assign to workers
- **Job economics** — quoted → invoiced → collected → costs → margin on every job.
  Margin is measured against what was *collected*, not what was billed: money still on
  the street is not profit. Flags the two silent leaks — quoted-but-never-invoiced and
  billed-but-unpaid.
- **Deposits** — an accepted estimate can be torn into two independently payable
  invoices (50/50, 30/70, 25/75). The deposit is a single percentage line; the balance
  carries the real items and subtracts the deposit. The halves sum to the whole exactly.
- **Overdue reminders** — tone escalates with the age of the debt (nudge → call → final
  notice). The attempt is always recorded, and if SMTP is not configured the desk says
  so rather than pretending an email went out.
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
- **Mobile-friendly** — the same deck works on a phone in a driveway

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
totals, invoice state, deposit splits, the moving calculator, local-day parsing. `e2e`
boots the real application on a throwaway database and drives it over HTTP with real
sessions: the whole chain from a landing-page lead to a settled invoice, and a second
workspace failing to reach the first one through every route that takes an id.

The end-to-end suite never touches `dev.db`. It builds its own database with
`prisma migrate deploy` in a temp directory and deletes it on the way out.

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
