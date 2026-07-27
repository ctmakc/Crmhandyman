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
- **Finance** — payments (cash, e-transfer, cheque, card), expenses by category, monthly P&L
- **Team** — admin + multiple workers, role-based access
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

**Default login:**
- Admin: `admin@handyman.ca` / `admin123`
- Worker: `worker1@handyman.ca` / `worker123`

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
- **Database**: SQLite via Prisma 7 + LibSQL adapter
- **Auth**: NextAuth.js (email/password)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
