-- Attribution is optional and additive. Existing leads keep NULL; no table rewrite or backfill.
ALTER TABLE "Lead" ADD COLUMN "sourceMeta" TEXT;
