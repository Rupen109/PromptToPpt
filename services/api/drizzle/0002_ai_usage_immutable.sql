-- The AI usage ledger is append-only: it is the audit trail used to reconcile against provider invoices
-- and to bill users. Block UPDATE/DELETE at the database level so no code path (or bug) can rewrite history.
CREATE OR REPLACE FUNCTION ai_usage_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ai_usage_event is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ai_usage_event_no_update_delete
BEFORE UPDATE OR DELETE ON ai_usage_event
FOR EACH ROW EXECUTE FUNCTION ai_usage_event_immutable();
