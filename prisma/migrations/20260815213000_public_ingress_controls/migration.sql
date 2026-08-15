CREATE TABLE "InboundReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "leadId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboundReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InboundReceipt_tenantId_channel_externalId_key"
  ON "InboundReceipt"("tenantId", "channel", "externalId");
CREATE INDEX "InboundReceipt_tenantId_createdAt_idx"
  ON "InboundReceipt"("tenantId", "createdAt");

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "resetAt" BIGINT NOT NULL,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
