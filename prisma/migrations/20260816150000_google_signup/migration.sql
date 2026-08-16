-- Google sign-in link + self-serve moderation gate.
-- Existing workspaces keep working: status defaults to ACTIVE, so every row already in
-- the table is open; only a new Google sign-up writes PENDING.
ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

ALTER TABLE "Tenant" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
