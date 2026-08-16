-- The team vertical: named invites, open join links, and a per-member approval gate.
--
-- Additive and back-compatible. `User.approved` defaults to true, so every member already
-- in the table keeps opening the desk; only someone who joins through an OPEN link is
-- written approved=false and waits for the owner. The Invite table is new — nothing is
-- rebuilt, so no existing row is touched.

-- AlterTable: existing crew stay approved.
ALTER TABLE "User" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'WORKER',
    "email" TEXT,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "Invite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE INDEX "Invite_tenantId_idx" ON "Invite"("tenantId");
