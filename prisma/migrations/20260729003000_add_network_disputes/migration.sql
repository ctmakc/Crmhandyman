-- CreateTable
CREATE TABLE "NetworkDispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "openedByTenantId" TEXT NOT NULL,
    "respondentTenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidenceUrls" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedByEmail" TEXT,
    "slaDueAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NetworkDispute_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "LeadClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NetworkDispute_openedByTenantId_fkey" FOREIGN KEY ("openedByTenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NetworkDispute_respondentTenantId_fkey" FOREIGN KEY ("respondentTenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NetworkDisputeMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "tenantId" TEXT,
    "authorEmail" TEXT,
    "body" TEXT NOT NULL,
    "evidenceUrls" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetworkDisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "NetworkDispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NetworkDisputeMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NetworkDispute_claimId_key" ON "NetworkDispute"("claimId");
CREATE INDEX "NetworkDispute_status_slaDueAt_idx" ON "NetworkDispute"("status", "slaDueAt");
CREATE INDEX "NetworkDispute_openedByTenantId_createdAt_idx" ON "NetworkDispute"("openedByTenantId", "createdAt");
CREATE INDEX "NetworkDispute_respondentTenantId_createdAt_idx" ON "NetworkDispute"("respondentTenantId", "createdAt");
CREATE INDEX "NetworkDisputeMessage_disputeId_createdAt_idx" ON "NetworkDisputeMessage"("disputeId", "createdAt");
