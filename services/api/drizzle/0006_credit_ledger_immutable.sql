-- Credit ledger is append-only, same guarantee as ai_usage_event: balances are derived from history we can audit.
CREATE OR REPLACE FUNCTION credit_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'credit_ledger is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER credit_ledger_no_update_delete
BEFORE UPDATE OR DELETE ON credit_ledger
FOR EACH ROW EXECUTE FUNCTION credit_ledger_immutable();
