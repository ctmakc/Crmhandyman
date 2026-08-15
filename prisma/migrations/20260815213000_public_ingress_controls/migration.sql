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

CREATE TABLE "ServiceVisitReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "cycle" TEXT NOT NULL,
  "projectId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceVisitReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceVisitReceipt_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ServiceVisitReceipt_tenantId_contractId_cycle_key"
  ON "ServiceVisitReceipt"("tenantId", "contractId", "cycle");
CREATE INDEX "ServiceVisitReceipt_tenantId_createdAt_idx"
  ON "ServiceVisitReceipt"("tenantId", "createdAt");

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "resetAt" BIGINT NOT NULL,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
