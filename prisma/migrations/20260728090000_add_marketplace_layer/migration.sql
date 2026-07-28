-- CreateTable
CREATE TABLE "ContractorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "phone" TEXT,
    "publicEmail" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Canada',
    "latitude" REAL,
    "longitude" REAL,
    "serviceRadiusKm" INTEGER NOT NULL DEFAULT 30,
    "yearsInBusiness" INTEGER,
    "emergencyService" BOOLEAN NOT NULL DEFAULT false,
    "minimumJobValue" REAL,
    "languages" TEXT NOT NULL DEFAULT 'English',
    "insuranceVerified" BOOLEAN NOT NULL DEFAULT false,
    "licenceVerified" BOOLEAN NOT NULL DEFAULT false,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "profileStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "averageRating" REAL NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "responseTimeMinutes" INTEGER,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractorProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractorService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "priceFrom" REAL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractorService_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Canada',
    "postalPrefix" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "radiusKm" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceArea_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "sourceUrl" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "city" TEXT,
    "serviceSlug" TEXT,
    "completedAt" DATETIME,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketplaceJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "address" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "budgetMin" REAL,
    "budgetMax" REAL,
    "urgency" TEXT NOT NULL DEFAULT 'FLEXIBLE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "consentToShare" BOOLEAN NOT NULL DEFAULT false,
    "sourceTenantId" TEXT,
    "convertedLeadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplaceJob_sourceTenantId_fkey" FOREIGN KEY ("sourceTenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceJob_convertedLeadId_fkey" FOREIGN KEY ("convertedLeadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "compensationMin" REAL,
    "compensationMax" REAL,
    "compensationUnit" TEXT NOT NULL DEFAULT 'HOUR',
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validThrough" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vacancy_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "budgetMin" REAL,
    "budgetMax" REAL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "maxClaims" INTEGER NOT NULL DEFAULT 3,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "contactUnlockPriceCredits" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeadListing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadListing_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "creditsPaid" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeadClaim_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "LeadListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractorProfile_tenantId_key" ON "ContractorProfile"("tenantId");
CREATE UNIQUE INDEX "ContractorProfile_slug_key" ON "ContractorProfile"("slug");
CREATE INDEX "ContractorProfile_city_province_idx" ON "ContractorProfile"("city", "province");
CREATE INDEX "ContractorProfile_profileStatus_verificationStatus_idx" ON "ContractorProfile"("profileStatus", "verificationStatus");
CREATE UNIQUE INDEX "ContractorService_profileId_slug_key" ON "ContractorService"("profileId", "slug");
CREATE INDEX "ContractorService_slug_category_idx" ON "ContractorService"("slug", "category");
CREATE INDEX "ServiceArea_city_province_idx" ON "ServiceArea"("city", "province");
CREATE INDEX "ServiceArea_postalPrefix_idx" ON "ServiceArea"("postalPrefix");
CREATE INDEX "Review_profileId_isVisible_idx" ON "Review"("profileId", "isVisible");
CREATE INDEX "PortfolioItem_profileId_isPublished_idx" ON "PortfolioItem"("profileId", "isPublished");
CREATE UNIQUE INDEX "MarketplaceJob_slug_key" ON "MarketplaceJob"("slug");
CREATE UNIQUE INDEX "MarketplaceJob_convertedLeadId_key" ON "MarketplaceJob"("convertedLeadId");
CREATE INDEX "MarketplaceJob_serviceSlug_city_province_status_idx" ON "MarketplaceJob"("serviceSlug", "city", "province", "status");
CREATE INDEX "MarketplaceJob_createdAt_idx" ON "MarketplaceJob"("createdAt");
CREATE UNIQUE INDEX "Vacancy_slug_key" ON "Vacancy"("slug");
CREATE INDEX "Vacancy_serviceSlug_city_province_status_idx" ON "Vacancy"("serviceSlug", "city", "province", "status");
CREATE UNIQUE INDEX "LeadListing_leadId_key" ON "LeadListing"("leadId");
CREATE INDEX "LeadListing_serviceSlug_city_province_status_idx" ON "LeadListing"("serviceSlug", "city", "province", "status");
CREATE UNIQUE INDEX "LeadClaim_listingId_tenantId_key" ON "LeadClaim"("listingId", "tenantId");
CREATE INDEX "LeadClaim_tenantId_status_idx" ON "LeadClaim"("tenantId", "status");
