# Email intake worker

Inbound email → CRM leads without Mailgun. Cloudflare Email Routing receives
mail for `leads-<slug>@agintent.com`, this worker parses the raw message and
POSTs it to the CRM's existing `/api/webhooks/email` with a Mailgun-compatible
signature. The CRM does not know the provider changed: same fields, same
HMAC check against the same shared secret.

```
customer mail → Cloudflare Email Routing → handyman-email-intake (this worker)
             → POST https://handymanpro.ca/api/webhooks/email → tenant lead
```

## Deploy

From this directory (wrangler ≥ 3, logged into the Cloudflare account that
owns agintent.com):

```bash
wrangler deploy
wrangler secret put SIGNING_KEY     # paste the shared secret when prompted
```

`SIGNING_KEY` must be byte-for-byte identical to `MAILGUN_WEBHOOK_SIGNING_KEY`
in the CRM's environment (`.env` on the VPS, see DEPLOY.md). Generate one once
with `openssl rand -hex 32` and set it in both places. The webhook fails closed:
with the key missing on either side, every message is refused with a 401.

`CRM_WEBHOOK_URL` defaults to production in `wrangler.toml`; point a staging
deploy elsewhere with `wrangler deploy --var CRM_WEBHOOK_URL:https://staging.../api/webhooks/email`.

## Wire up an address (per tenant)

1. Cloudflare dashboard → the agintent.com zone → **Email** → **Email Routing**.
   Enable it once for the zone (Cloudflare adds the MX/SPF records itself).
2. **Routing rules** → **Create address**: custom address
   `leads-<slug>@agintent.com` (the tenant's slug, e.g. `leads-dreamhvac`),
   action **Send to a Worker**, worker `handyman-email-intake`.
3. In the CRM, as that tenant: **Settings → Integrations → Email · HomeStars ·
   Kijiji**, paste the same `leads-<slug>@agintent.com` into the forwarding
   address field and save. That stores the address on the tenant's
   ChannelIntegration record — the webhook routes each message to a tenant by
   matching the address the mail was sent to, so the two sides must agree
   exactly (matching is case-insensitive).
4. The tenant forwards their HomeStars/Kijiji/Google notification mail to that
   address, or lists it directly as their enquiry address.

A message to an address no tenant has configured is accepted and dropped (the
CRM logs `Inbound lead for an unconfigured address`) — check step 3 first when
leads silently fail to appear.

## Verify locally, no Cloudflare needed

`test-local.mjs` runs the worker's own MIME parser on a sample multipart
message and sends the same signed form the worker would send:

```bash
# CRM dev server on :3001 with MAILGUN_WEBHOOK_SIGNING_KEY=<key> in .env
SIGNING_KEY=<key> node test-local.mjs
# or explicitly:
node test-local.mjs http://localhost:3001/api/webhooks/email leads-demo@agintent.com <key>
```

Exit 0 and `Lead accepted` means the full path works; the script explains the
two usual failures (key mismatch → 401, unconfigured recipient → routed:false).

## Behaviour on failure

- Unparseable message (no text part at all): logged with `console.error` and
  **rejected** — the sender gets a bounce instead of the CRM getting garbage.
- CRM down or returning non-2xx, or worker env unset: the worker **throws**,
  which tempfails delivery so the sending server retries later. No lead is lost
  to CRM downtime.
- Live worker logs: `wrangler tail handyman-email-intake`.
