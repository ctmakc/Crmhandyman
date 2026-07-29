-- Enforce non-negative wallet totals and ledger-to-wallet consistency.
CREATE TRIGGER "CreditWallet_validate_insert"
BEFORE INSERT ON "CreditWallet"
WHEN NEW.balance < 0 OR NEW.lifetimePurchased < 0 OR NEW.lifetimeSpent < 0
BEGIN
    SELECT RAISE(ABORT, 'Credit wallet values cannot be negative');
END;

CREATE TRIGGER "CreditWallet_validate_update"
BEFORE UPDATE ON "CreditWallet"
WHEN NEW.balance < 0 OR NEW.lifetimePurchased < 0 OR NEW.lifetimeSpent < 0
BEGIN
    SELECT RAISE(ABORT, 'Credit wallet values cannot be negative');
END;

CREATE TRIGGER "CreditTransaction_validate_insert"
BEFORE INSERT ON "CreditTransaction"
BEGIN
    SELECT CASE
      WHEN NEW.balanceAfter < 0
      THEN RAISE(ABORT, 'Credit transaction balance cannot be negative')
    END;

    SELECT CASE
      WHEN NEW.balanceAfter != (
        SELECT wallet.balance FROM "CreditWallet" wallet WHERE wallet.id = NEW.walletId
      )
      THEN RAISE(ABORT, 'Credit transaction balance must match wallet balance')
    END;

    SELECT CASE
      WHEN NEW.type IN ('WELCOME', 'CREDIT_PURCHASE', 'REFUND') AND NEW.amount < 0
      THEN RAISE(ABORT, 'Positive credit transaction type cannot have a negative amount')
    END;

    SELECT CASE
      WHEN NEW.type = 'LEAD_UNLOCK' AND NEW.amount > 0
      THEN RAISE(ABORT, 'Lead unlock transaction cannot have a positive amount')
    END;
END;
