-- What the printed document was missing. A Canadian invoice over $30 has to carry the
-- supplier's GST/HST number, or the business client loses the input tax credit and sends
-- the paper back. All nullable, so existing workspaces keep working until filled in.
ALTER TABLE "Tenant" ADD COLUMN "businessAddress" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "businessPhone" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "businessEmail" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "hstNumber" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "paymentInstructions" TEXT;
