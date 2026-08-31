# Meta Lead Ads / Instagram — production setup

This is the current operator guide for HandyCRM on `itopsi.com`.

## What the integration does

Facebook Lead Ads are delivered to HandyCRM by webhook. The webhook contains the lead id and page id; HandyCRM then retrieves the full lead from Meta Graph API and creates a tenant-scoped CRM lead.

The CRM stores:

- name, phone, email, address/city and service/job type;
- Meta lead id for replay protection;
- campaign id/name;
- ad set id/name;
- ad id/name;
- form id/name;
- Meta platform / organic flag when Meta supplies them;
- lead creation time.

These marketing facts are stored separately from human notes in `Lead.sourceMeta` and appear on the lead card under **Attribution**.

Instagram business-account messages use the separate `/api/webhooks/instagram` route.

## Server environment

Required:

```env
META_APP_ID="..."
META_APP_SECRET="..."
META_WEBHOOK_VERIFY_TOKEN="..."
```

Optional Graph version override:

```env
META_GRAPH_VERSION="v26.0"
```

The application currently defaults to `v26.0`. Do not pin an old Graph version in code. Meta retires Graph versions on a rolling schedule, so a future version bump should normally be an environment/configuration change followed by CI and a real test lead.

`META_APP_SECRET` is load-bearing: if it is absent, webhook deliveries are rejected. The webhook verifies `X-Hub-Signature-256` against the raw request body.

The Page access token is stored per tenant in HandyCRM under the Facebook integration. The token is sent to Graph API in the `Authorization: Bearer ...` header; it is not placed in the request URL.

## Meta app setup

1. Open Meta for Developers and create/use the Business app that owns the integration.
2. In **Settings → Basic**, record App ID and App Secret.
3. Add the Webhooks product.
4. Subscribe the **Page** object to `leadgen`.
5. Set the callback URL to:

```text
https://crm.itopsi.com/api/webhooks/facebook
```

6. Use exactly the same value as `META_WEBHOOK_VERIFY_TOKEN` for the webhook verify token.
7. Subscribe the Beaver Movers Facebook Page to the app for `leadgen`.

For Instagram messages, configure the Instagram business-account webhook separately and use:

```text
https://crm.itopsi.com/api/webhooks/instagram
```

## Permissions / token

The Page token used by HandyCRM must be able to retrieve Lead Ads data for the configured Page. The Meta app/account setup normally needs the relevant Page and lead-retrieval permissions, including `leads_retrieval` and the Page permissions required by the current Meta flow.

Do not paste tokens into Git, docs, tickets or this memory repository. Enter them only in the production environment / HandyCRM integration settings.

## HandyCRM tenant setup

In the Beaver Movers workspace:

**Settings → Intake channels → Facebook Lead Ads**

Set:

- Page access token;
- Facebook Page ID;
- active = on.

The Page ID is the tenant-routing key. A Facebook lead is accepted only when its `page_id` matches one active Facebook integration. This prevents one customer's Page from feeding another tenant.

## What HandyCRM asks Graph API for

The lead retrieval request includes:

```text
field_data
created_time
campaign_id
campaign_name
adset_id
adset_name
ad_id
ad_name
form_id
form_name
is_organic
platform
```

If Meta omits an optional attribution field, the lead is still accepted; only that attribution row stays absent.

## Form-field mapping

Prefer Meta's standard lead-form names:

| Meta field | HandyCRM |
| --- | --- |
| `full_name`, or `first_name` + `last_name` | Name |
| `email` | Email |
| `phone_number` / `phone` | Phone |
| `street_address` | Address |
| `city` | City |
| custom field containing `job_type` or `service` | Job type |
| custom field containing `message` or `comments` | Notes |

## Production acceptance test

Use Meta's Lead Ads Testing Tool or a real unpublished/test campaign form.

A successful Beaver acceptance is not merely “a row appeared”. Verify all of these:

1. The lead appears once in `https://beaver-movers.itopsi.com/leads`.
2. Name and phone are correct.
3. Source is `FACEBOOK`.
4. The lead card shows **Attribution**.
5. Campaign / ad set / ad / form values match the Meta test source when Meta supplied them.
6. A repeat delivery of the same Meta `leadgen_id` does not create a duplicate.
7. Owner notification is delivered if configured.
8. If Beaver SMS automation is enabled and the lead has a phone, the configured acknowledgement/SLA path starts without falsifying the human response clock.

Do this acceptance before putting meaningful paid traffic through the form.

## Website campaign attribution

Beaver's own keyed website intake is separate from Meta Lead Ads. The website endpoint can store these structured values when the landing sends them:

```text
utm_source
utm_medium
utm_campaign
utm_content
utm_term
event_source_url / page / landing_page
referrer_url / referrer
fbclid
gclid
```

They appear in the same **Attribution** block on the lead card. This lets a Facebook ad that lands on Beaver's website be compared with a native Facebook Lead Ad without flattening both into a generic source label.

## Troubleshooting

**Webhook verification fails** — confirm callback URL and `META_WEBHOOK_VERIFY_TOKEN` match exactly.

**Every POST is `Invalid signature`** — confirm `META_APP_SECRET` belongs to the exact Meta app delivering the webhook.

**Lead arrives without Page ID** — HandyCRM skips it because it cannot route the lead to a tenant safely.

**Webhook arrives but no lead is created** — confirm an active Facebook integration exists for that Page ID and has a usable Page access token.

**Graph retrieval returns an error** — check token permissions/expiry first. If Meta has retired the configured Graph version, update `META_GRAPH_VERSION`, run CI, then re-test with a real lead.

**Lead exists but Attribution is empty** — confirm the Graph response actually contains campaign/ad/form fields. The lead itself is deliberately not rejected when optional attribution fields are unavailable.

**Testing Tool seems to stop creating duplicates** — a replay with the same `leadgen_id` is intentionally deduplicated. Create/delete/reset the test lead in Meta before testing again.

## Security rules

- Never log or persist Page access tokens in URLs.
- Never disable webhook signature verification to “make testing work”.
- Never route a lead by a user-controlled tenant slug; Facebook routing is by the configured Page ID.
- Never put raw Meta credentials in lead notes or attribution metadata.
