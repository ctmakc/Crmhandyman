# Direct marketplace lead costs

HandyCRM distinguishes two acquisition-cost shapes:

1. **Channel spend** — a monthly/general ad bill such as Meta or Google campaign spend. Enter it in Finance with an `Ad spend: <SOURCE>` description.
2. **Direct lead fee** — an amount charged for one concrete marketplace contact. Enter it under **Settings → Lead costs**.

Direct lead fees are supported for:

- Google Local Services Ads (`GOOGLE_LSA`)
- HomeStars (`HOMESTARS`)
- Bark (`BARK`)
- UrbanTasker (`URBANTASKER`)
- MovingWaldo (`MOVINGWALDO`)

They are not supported for Facebook/Instagram/general Google/manual leads because those normally use channel-level spend; entering both would double-count acquisition cost.

## Storage contract

A direct fee is a real `Expense`, not a field on the customer-facing `Lead` record. The expense id is deterministic:

```text
leadfee_<lead-id>
```

The description starts with the existing acquisition marker:

```text
Ad spend: BARK — direct lead fee [lead:<lead-id>]
```

This means the existing source-to-cash report automatically includes direct fees in acquisition spend, CPL, cost/job, net-after-ads and collected-return calculations. Re-saving a fee updates the same expense row instead of creating duplicates.

The expense date is the lead's arrival date so the fee stays in the same acquisition cohort as the lead, even when the owner records it later.

## Permissions

Lead-cost APIs and the worksheet are owner/admin-only. Field workers continue to receive ordinary lead payloads without acquisition-cost data.

## Audit

Setting or clearing a direct fee appends a `lead.acquisition_cost` entry to the Action log. The accounting mutation succeeds independently of the audit witness, following the rest of HandyCRM's journal behavior.

## Clearing and zero

- Blank value: remove the direct fee expense.
- `0.00`: keep an explicit known free lead.
- Negative values are rejected.
- Values over CAD 100,000 per individual lead are rejected as likely unit/typing mistakes.
