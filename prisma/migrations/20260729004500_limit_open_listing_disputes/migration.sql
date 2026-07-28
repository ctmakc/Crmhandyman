-- Prevent multiple simultaneous unresolved disputes for claims belonging to the same listing.
CREATE TRIGGER "NetworkDispute_one_open_case_per_listing"
BEFORE INSERT ON "NetworkDispute"
WHEN EXISTS (
    SELECT 1
    FROM "NetworkDispute" existingDispute
    JOIN "LeadClaim" existingClaim ON existingClaim.id = existingDispute.claimId
    JOIN "LeadClaim" newClaim ON newClaim.id = NEW.claimId
    WHERE existingClaim.listingId = newClaim.listingId
      AND existingDispute.status NOT IN ('RESOLVED', 'CLOSED')
)
BEGIN
    SELECT RAISE(ABORT, 'An unresolved dispute already exists for this lead listing');
END;
