-- CreateTable
CREATE TABLE "WorkerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "publicName" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Canada',
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "yearsExperience" INTEGER,
    "employmentTypes" TEXT NOT NULL DEFAULT 'FULL_TIME,CONTRACT,GIG,SUBCONTRACT',
    "hourlyRateMin" REAL,
    "hourlyRateMax" REAL,
    "hasVehicle" BOOLEAN NOT NULL DEFAULT false,
    "hasTools" BOOLEAN NOT NULL DEFAULT false,
    "languages" TEXT NOT NULL DEFAULT 'English',
    "availability" TEXT,
    "resumeUrl" TEXT,
    "consentToContact" BOOLEAN NOT NULL DEFAULT false,
    "consentToPublic" BOOLEAN NOT NULL DEFAULT false,
    "profileStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkerSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearsExperience" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkerSkill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WorkerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerProfile_slug_key" ON "WorkerProfile"("slug");
CREATE UNIQUE INDEX "WorkerProfile_email_key" ON "WorkerProfile"("email");
CREATE INDEX "WorkerProfile_city_province_profileStatus_idx" ON "WorkerProfile"("city", "province", "profileStatus");
CREATE INDEX "WorkerProfile_verificationStatus_updatedAt_idx" ON "WorkerProfile"("verificationStatus", "updatedAt");
CREATE UNIQUE INDEX "WorkerSkill_profileId_slug_key" ON "WorkerSkill"("profileId", "slug");
CREATE INDEX "WorkerSkill_slug_idx" ON "WorkerSkill"("slug");
