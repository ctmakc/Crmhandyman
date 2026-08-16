-- One inbox, one workspace. The email webhook routes every inbound lead by the address
-- it was sent to, so whoever holds leads-<slug>@… receives that shop's leads. Those
-- addresses are guessable; with no cross-tenant guard a second workspace could name a
-- rival's inbox and harvest its enquiries the moment routing pointed there. This column
-- carries the address exactly as the router compares it (lowercased, trimmed) and the
-- unique index makes the database itself refuse the second claim — even under a race the
-- API's pre-check cannot see.
ALTER TABLE "ChannelIntegration" ADD COLUMN "normalizedAddress" TEXT;

-- Backfill: existing email integrations must reclaim their address so the constraint has
-- something to protect. Config was stored as JSON ({"address": "..."}) and, on older
-- rows, as a bare string; json_extract returns NULL for the bare-string case, and
-- COALESCE then falls back to the raw config so both shapes are covered. LOWER/TRIM
-- reproduce normalizeChannelAddress exactly. Non-email channels (Facebook routes by page
-- id) keep NULL and never enter the unique namespace.
--
-- NOTE: if two existing rows resolve to the same address, the index below will refuse to
-- build — that failure is the pre-existing cross-tenant collision surfacing, and it must
-- be resolved by hand (decide which workspace owns the inbox) before deploying. That is
-- the exact hole this migration exists to close, so failing loud here is correct.
UPDATE "ChannelIntegration"
SET "normalizedAddress" = LOWER(TRIM(
  COALESCE(
    CASE WHEN json_valid("config") THEN json_extract("config", '$.address') END,
    CASE WHEN json_valid("config") THEN json_extract("config", '$.email') END,
    "config"
  )
))
WHERE "channel" = 'EMAIL'
  AND "config" IS NOT NULL
  AND TRIM(COALESCE(
    CASE WHEN json_valid("config") THEN json_extract("config", '$.address') END,
    CASE WHEN json_valid("config") THEN json_extract("config", '$.email') END,
    "config"
  )) <> '';

-- SQLite treats every NULL as distinct, so channels without an address share NULL freely.
CREATE UNIQUE INDEX "ChannelIntegration_normalizedAddress_key" ON "ChannelIntegration"("normalizedAddress");
