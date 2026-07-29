-- Enforce lead-claim eligibility and listing capacity at the database boundary.
CREATE TRIGGER "LeadClaim_enforce_listing_capacity"
BEFORE INSERT ON "LeadClaim"
BEGIN
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM "LeadListing" listing
        WHERE listing.id = NEW.listingId
          AND listing.tenantId = NEW.tenantId
      )
      THEN RAISE(ABORT, 'A tenant cannot claim its own lead listing')
    END;

    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM "LeadListing" listing
        WHERE listing.id = NEW.listingId
          AND listing.status != 'OPEN'
      )
      THEN RAISE(ABORT, 'The lead listing is not open')
    END;

    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM "LeadListing" listing
        WHERE listing.id = NEW.listingId
          AND listing.expiresAt IS NOT NULL
          AND listing.expiresAt <= CURRENT_TIMESTAMP
      )
      THEN RAISE(ABORT, 'The lead listing has expired')
    END;

    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM "LeadListing" listing
        WHERE listing.id = NEW.listingId
          AND listing.exclusive = 1
          AND EXISTS (
            SELECT 1 FROM "LeadClaim" claim
            WHERE claim.listingId = listing.id
              AND claim.status IN ('REQUESTED', 'APPROVED', 'CONTACT_UNLOCKED', 'WON', 'LOST')
          )
      )
      THEN RAISE(ABORT, 'The exclusive lead listing already has a claim')
    END;

    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM "LeadListing" listing
        WHERE listing.id = NEW.listingId
          AND (
            SELECT COUNT(*) FROM "LeadClaim" claim
            WHERE claim.listingId = listing.id
              AND claim.status IN ('REQUESTED', 'APPROVED', 'CONTACT_UNLOCKED', 'WON', 'LOST')
          ) >= listing.maxClaims
      )
      THEN RAISE(ABORT, 'The lead listing has reached its claim limit')
    END;
END;
