-- Money moves from REAL dollars to INTEGER cents.
--
-- Float cannot hold 0.1, so a column of stored amounts drifted away from its own stored
-- total while every printed number still looked clean. Every amount becomes a whole
-- number of cents, named `<field>Cents`, and the arithmetic stops guessing.
--
-- Conversion is ROUND(value * 100): the nearest cent, which is the amount that was
-- printed on the paper the client is holding. A row cannot move by more than half a cent.
--
-- Line items ride inside a JSON string, so they are rewritten with the JSON1 functions:
-- `unitPrice` (dollars) becomes `unitPriceCents`. A row whose JSON does not parse is
-- left exactly as it is — src/lib/money.ts reads a dollar line as a fallback, and
-- silently emptying somebody's estimate would be worse than an old-shaped row.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- ServiceContract.pricePerVisit → pricePerVisitCents
CREATE TABLE "new_ServiceContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "name" TEXT NOT NULL,
    "visitMonths" TEXT NOT NULL,
    "pricePerVisitCents" INTEGER NOT NULL,
    "autoInvoice" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startedOn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceContract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceContract_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ServiceContract" ("id", "tenantId", "clientId", "equipmentId", "name", "visitMonths", "pricePerVisitCents", "autoInvoice", "active", "startedOn", "notes", "createdAt", "updatedAt")
SELECT "id", "tenantId", "clientId", "equipmentId", "name", "visitMonths", CAST(ROUND("pricePerVisit" * 100) AS INTEGER), "autoInvoice", "active", "startedOn", "notes", "createdAt", "updatedAt"
FROM "ServiceContract";
DROP TABLE "ServiceContract";
ALTER TABLE "new_ServiceContract" RENAME TO "ServiceContract";
CREATE INDEX "ServiceContract_tenantId_active_idx" ON "ServiceContract"("tenantId", "active");

-- Estimate.subtotal/tax/total → *Cents
CREATE TABLE "new_Estimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lineItems" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "notes" TEXT,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Estimate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Estimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Estimate" ("id", "tenantId", "projectId", "lineItems", "subtotalCents", "taxCents", "totalCents", "notes", "validUntil", "status", "pdfUrl", "createdAt")
SELECT "id", "tenantId", "projectId", "lineItems", CAST(ROUND("subtotal" * 100) AS INTEGER), CAST(ROUND("tax" * 100) AS INTEGER), CAST(ROUND("total" * 100) AS INTEGER), "notes", "validUntil", "status", "pdfUrl", "createdAt"
FROM "Estimate";
DROP TABLE "Estimate";
ALTER TABLE "new_Estimate" RENAME TO "Estimate";
CREATE INDEX "Estimate_tenantId_projectId_idx" ON "Estimate"("tenantId", "projectId");

-- Invoice.subtotal/tax/total → *Cents
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'FULL',
    "remindedAt" DATETIME,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateId" TEXT,
    "number" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "address" TEXT,
    "email" TEXT,
    "lineItems" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "sentAt" DATETIME,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("id", "kind", "remindedAt", "reminderCount", "tenantId", "projectId", "estimateId", "number", "clientName", "address", "email", "lineItems", "subtotalCents", "taxCents", "totalCents", "notes", "status", "issuedAt", "dueDate", "sentAt", "paidAt", "createdAt", "updatedAt")
SELECT "id", "kind", "remindedAt", "reminderCount", "tenantId", "projectId", "estimateId", "number", "clientName", "address", "email", "lineItems", CAST(ROUND("subtotal" * 100) AS INTEGER), CAST(ROUND("tax" * 100) AS INTEGER), CAST(ROUND("total" * 100) AS INTEGER), "notes", "status", "issuedAt", "dueDate", "sentAt", "paidAt", "createdAt", "updatedAt"
FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");

-- Payment.amount → amountCents
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("id", "tenantId", "projectId", "invoiceId", "amountCents", "method", "date", "notes")
SELECT "id", "tenantId", "projectId", "invoiceId", CAST(ROUND("amount" * 100) AS INTEGER), "method", "date", "notes"
FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";

-- Expense.amount → amountCents
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiptUrl" TEXT,
    CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("id", "tenantId", "projectId", "amountCents", "category", "description", "date", "receiptUrl")
SELECT "id", "tenantId", "projectId", CAST(ROUND("amount" * 100) AS INTEGER), "category", "description", "date", "receiptUrl"
FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";

-- Line items: unitPrice (dollars) → unitPriceCents, inside the stored JSON array.
UPDATE "Estimate"
SET "lineItems" = (
    SELECT json_group_array(json_object(
        'description', json_extract("value", '$.description'),
        'qty', json_extract("value", '$.qty'),
        'unit', json_extract("value", '$.unit'),
        'unitPriceCents', CAST(ROUND(COALESCE(json_extract("value", '$.unitPrice'), 0) * 100) AS INTEGER)
    ))
    FROM json_each("Estimate"."lineItems")
)
WHERE json_valid("lineItems")
  AND json_type("lineItems") = 'array'
  AND EXISTS (SELECT 1 FROM json_each("Estimate"."lineItems") WHERE json_extract("value", '$.unitPrice') IS NOT NULL);

UPDATE "Invoice"
SET "lineItems" = (
    SELECT json_group_array(json_object(
        'description', json_extract("value", '$.description'),
        'qty', json_extract("value", '$.qty'),
        'unit', json_extract("value", '$.unit'),
        'unitPriceCents', CAST(ROUND(COALESCE(json_extract("value", '$.unitPrice'), 0) * 100) AS INTEGER)
    ))
    FROM json_each("Invoice"."lineItems")
)
WHERE json_valid("lineItems")
  AND json_type("lineItems") = 'array'
  AND EXISTS (SELECT 1 FROM json_each("Invoice"."lineItems") WHERE json_extract("value", '$.unitPrice') IS NOT NULL);

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
