-- Provider reporting cache, deliberately separate from Expense.
-- Finance remains the accounting book; these rows exist only to allocate real Meta spend
-- to campaign/ad-set/ad outcome reporting without double-booking the Meta invoice.
--
-- tenantId is intentionally a scoped scalar rather than a relation: this is disposable
-- provider cache, not business/accounting data, and every read/write carries tenantId.
CREATE TABLE "MetaAdSpend" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "campaignName" TEXT,
  "adsetId" TEXT NOT NULL,
  "adsetName" TEXT,
  "adId" TEXT NOT NULL,
  "adName" TEXT,
  "spendCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "MetaAdSpend_tenant_account_day_ad_key"
ON "MetaAdSpend"("tenantId", "accountId", "day", "adId");

CREATE INDEX "MetaAdSpend_tenant_day_idx"
ON "MetaAdSpend"("tenantId", "day");

CREATE INDEX "MetaAdSpend_tenant_campaign_day_idx"
ON "MetaAdSpend"("tenantId", "campaignId", "day");
