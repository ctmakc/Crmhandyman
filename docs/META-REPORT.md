# Meta campaign outcome report

`Reports -> Meta campaigns` joins two independent, trusted data streams:

1. native Meta Lead Ads already stored in HandyCRM, including campaign/ad-set/ad/form attribution and downstream CRM outcomes;
2. Meta Ads Insights spend/impressions/clicks synced from the configured ad account.

Hierarchy:

```text
Campaign -> Ad set -> Ad -> Form
```

For each level HandyCRM can show:

- leads received;
- reached leads;
- qualified leads;
- rejected leads;
- jobs opened;
- collected amount and job margin;
- Ads Insights spend at campaign/ad-set/ad level;
- CPL and cost/job when Meta spend is CAD;
- ROAS = collected CRM revenue / real Meta spend when both sides are CAD.

The cohort is the lead arrival period. A lead received in August keeps the job and money it later produces attached to August's campaign outcome, matching the source-to-cash report. Ads Insights is synced for the selected calendar period at ad/day granularity.

## Two Meta connections, not one

The two Meta jobs use different assets and may require different tokens:

- **Settings -> Intake channels -> Facebook Lead Ads** stores the Facebook Page ID and Page access token used to retrieve a person who submitted a lead form.
- **Settings -> Meta Ads reporting** stores the Meta ad account ID and a read-only token that can read Ads Insights for that account.

Do not replace the Page token with the Ads reporting token merely because both are Meta tokens. The product keeps these integrations separate on purpose.

For Ads Insights, enter the ad account id shown by Ads Manager (`act_123...` or the digits alone) and a token that can read that ad account with the appropriate ads-read permission/access. HandyCRM normalizes the account id to digits and rejects malformed values on save.

The token is write-only in the CRM UI: the API reports only that a token exists and its trailing hint. Insights requests send it in the HTTP Authorization header, never in the query string.

## Sync contract

The report has a **Sync spend** action for the selected year/month. The sync requests Meta at `level=ad` with daily time increments and stores a provider-reporting cache containing:

- day;
- campaign id/name;
- ad set id/name;
- ad id/name;
- spend and account currency;
- impressions and clicks.

The sync fetches the provider result first. Only after a successful fetch does one transaction replace that account/period in the reporting cache. A Meta outage or expired token therefore does not erase the last successfully synced period.

This cache is intentionally **not** the `Expense` ledger. Finance remains the accounting book for the real Meta invoice/payment. Copying Ads Insights spend into `Expense` would double-book the same advertising money whenever the invoice is also entered in Finance.

## Spend allocation rules

Ads Insights is stored at ad/day level. Summing an ad's rows into its ad set and campaign is exact, so campaign/ad-set/ad spend and ROAS are allowed.

Spend is **not** allocated down to lead form. Meta does not report a trustworthy form-level spend dimension in this integration, so form rows show outcomes but no spend/CPL/ROAS. The system must not divide an ad's spend among forms by leads, bookings or revenue and present that as provider data.

A spend-only campaign/ad remains visible even if it generated zero CRM leads. Hiding zero-lead spend would remove precisely the waste the media-buy report is meant to expose.

## Currency rule

HandyCRM job revenue is CAD. Provider spend retains the account currency returned by Meta.

- CAD spend: CPL, cost/job and ROAS may be calculated.
- non-CAD spend: spend is shown in the provider currency, but CAD revenue is not divided by it.
- mixed currencies in one report period: the report says `mixed` and leaves comparable cost/ROAS metrics blank.

No implicit FX conversion is performed. A future FX layer must use an explicit trusted rate/date policy rather than today's exchange rate applied retroactively.

## Missing attribution

A Facebook Lead Ad is never dropped from the outcome report because optional Meta metadata is absent or malformed. It stays visible under `Campaign unavailable` / `Ad set unavailable` / `Ad unavailable` / `Form unavailable` as necessary.

IDs are the stable bucket identity when Meta supplies them. Renaming a campaign or ad therefore does not create a second performance bucket for the same Meta object.

Ads Insights can also create a campaign/ad row that has spend but no CRM leads. This is intentionally distinct from `Campaign unavailable`: Meta knows which object spent the money even though no matching CRM lead exists.

## Platform

Native Meta Lead Ads enter through the Facebook `leadgen` webhook even when Meta reports an Instagram placement/platform. The report therefore starts from CRM source `FACEBOOK` and displays Meta's stored `platform` values inside the hierarchy. Instagram direct-message leads are a different ingestion path and are not treated as paid Lead Ads here.

## Graph version

Lead retrieval and Ads Insights use the same validated `META_GRAPH_VERSION` helper. The application currently defaults to `v26.0`; operators may override the version through environment configuration when Meta's version lifecycle requires a controlled bump. Do not hardcode a second Graph version into the reporting path.
