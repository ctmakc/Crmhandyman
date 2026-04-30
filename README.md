# HandymanPro CRM

Simple CRM for a Canadian handyman small business. Built with Next.js 14, Prisma, SQLite, Tailwind CSS, and NextAuth.

## Features

- **Multi-channel lead intake** — Facebook Lead Ads, Instagram, Google Local Services Ads, HomeStars/Kijiji (via email), manual entry
- **Lead management** — verify, contact, reject, convert to project
- **Projects** — full job lifecycle (Scheduled → In Progress → Completed)
- **Estimates** — line-item estimate builder with HST/GST, printable HTML view
- **Tasks** — kanban board (drag & drop), assign to workers
- **Finance** — record payments (cash, e-transfer, cheque, card), expenses by category, monthly P&L
- **Team** — admin + multiple workers, role-based access
- **Mobile-friendly** — works on phone in the field

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
