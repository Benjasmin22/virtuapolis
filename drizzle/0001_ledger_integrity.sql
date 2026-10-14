-- Handwritten migration: Drizzle does not represent deferred constraint triggers.
-- Keep this migration when evolving schema.ts. Do not use drizzle-kit push.
CREATE FUNCTION assert_ledger_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id uuid;
  header ledger_transactions%ROWTYPE;
  entry_count integer;
  matching_count integer;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    target_id := NEW.id;
  ELSE
    target_id := NEW.transaction_id;
  END IF;

  SELECT * INTO STRICT header FROM ledger_transactions WHERE id = target_id;
  SELECT count(*), count(*) FILTER (
    WHERE city_id = header.city_id
      AND amount_cents = header.amount_cents
      AND ((side = 'DEBIT' AND account_id = header.destination_account_id)
        OR (side = 'CREDIT' AND account_id = header.source_account_id))
  ) INTO entry_count, matching_count
  FROM ledger_entries WHERE transaction_id = target_id;

  IF entry_count <> 2 OR matching_count <> 2 THEN
    RAISE EXCEPTION 'Ledger transaction % requires a balanced pair of matching DEBIT/CREDIT entries', target_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_header_balanced
AFTER INSERT ON ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_pair();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
AFTER INSERT ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_pair();
--> statement-breakpoint
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Posted ledger data is immutable; record a compensating transaction'
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_transactions_immutable BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_transactions_no_truncate BEFORE TRUNCATE ON ledger_transactions
FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_mutation();
