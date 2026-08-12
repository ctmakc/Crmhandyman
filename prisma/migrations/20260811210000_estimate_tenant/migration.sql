-- Estimate carried no tenantId: isolation hung on joining through Project, and the
-- estimate API never joined. Straighten it, backfilling from the parent project.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Estimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lineItems" TEXT NOT NULL,
    "subtotal" REAL NOT NULL,
    "tax" REAL NOT NULL,
    "total" REAL NOT NULL,
    "notes" TEXT,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Estimate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Estimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Estimate" ("id", "tenantId", "projectId", "lineItems", "subtotal", "tax", "total", "notes", "validUntil", "status", "pdfUrl", "createdAt")
SELECT "e"."id", "p"."tenantId", "e"."projectId", "e"."lineItems", "e"."subtotal", "e"."tax", "e"."total", "e"."notes", "e"."validUntil", "e"."status", "e"."pdfUrl", "e"."createdAt"
FROM "Estimate" "e"
JOIN "Project" "p" ON "p"."id" = "e"."projectId";

DROP TABLE "Estimate";
ALTER TABLE "new_Estimate" RENAME TO "Estimate";
CREATE INDEX "Estimate_tenantId_projectId_idx" ON "Estimate"("tenantId", "projectId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
