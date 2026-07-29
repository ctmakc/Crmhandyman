-- Prevent mutation or deletion of append-only financial and operational audit records.
CREATE TRIGGER "CreditTransaction_prevent_update"
BEFORE UPDATE ON "CreditTransaction"
BEGIN
    SELECT RAISE(ABORT, 'Credit transactions are immutable');
END;

CREATE TRIGGER "CreditTransaction_prevent_delete"
BEFORE DELETE ON "CreditTransaction"
BEGIN
    SELECT RAISE(ABORT, 'Credit transactions are immutable');
END;

CREATE TRIGGER "AuditEvent_prevent_update"
BEFORE UPDATE ON "AuditEvent"
BEGIN
    SELECT RAISE(ABORT, 'Audit events are immutable');
END;

CREATE TRIGGER "AuditEvent_prevent_delete"
BEFORE DELETE ON "AuditEvent"
BEGIN
    SELECT RAISE(ABORT, 'Audit events are immutable');
END;
