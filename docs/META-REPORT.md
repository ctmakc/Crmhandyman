# Meta campaign outcome report

`Reports -> Meta campaigns` reads the acquisition metadata already stored on native Meta Lead Ads and follows each lead through the CRM outcome and job money.

Hierarchy:

```text
Campaign -> Ad set -> Ad -> Form
```

For each level HandyCRM shows:

- leads received;
- reached leads;
- qualified leads;
- rejected leads;
- jobs opened;
- quoted amount;
- invoiced amount;
- collected amount;
- job margin.

The cohort is the lead arrival period. A lead received in August keeps the job and money it later produces attached to August's campaign outcome, matching the source-to-cash report.

## Missing attribution

A Facebook Lead Ad is never dropped from the report because optional Meta metadata is absent or malformed. It stays visible under `Campaign unavailable` / `Ad set unavailable` / `Ad unavailable` / `Form unavailable` as necessary.

IDs are the stable bucket identity when Meta supplies them. Renaming a campaign or ad therefore does not create a second performance bucket for the same Meta object.

## Platform

Native Meta Lead Ads enter through the Facebook `leadgen` webhook even when Meta reports an Instagram placement/platform. The report therefore starts from CRM source `FACEBOOK` and displays Meta's stored `platform` values inside the hierarchy. Instagram direct-message leads are a different ingestion path and are not treated as paid Lead Ads here.

## Spend and ROAS

Campaign-level spend and ROAS are intentionally absent for now.

HandyCRM may know a total monthly Meta/channel advertising bill, but that does not reveal how much was spent on each campaign, ad set or ad. The report must not allocate that total proportionally by leads, jobs or revenue: doing so would create a precise-looking but invented campaign ROAS.

Campaign spend should be added only from a trusted campaign-level source, such as Meta Ads Insights or another explicit campaign/ad spend import. Until then this report answers **which Meta objects produced the best downstream outcomes**, not **which had the best ROAS**.
