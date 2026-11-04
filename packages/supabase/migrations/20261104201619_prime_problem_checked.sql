-- The Prime page's problems tab: a person marks a problem parcel as handled
-- (they called the customer, say) with an optional note, so the rest of the
-- team does not call twice. A mark counts only until Prime moves the parcel
-- again (status_changed_at later than problem_checked_at), so a new problem
-- shows up unhandled. Written by POST /api/prime/problem with the service
-- role, tenant-scoped; members keep reading through prime_shipments_member_read.

ALTER TABLE public.prime_shipments
    ADD COLUMN IF NOT EXISTS problem_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS problem_checked_by TEXT CHECK (problem_checked_by IS NULL OR length(problem_checked_by) <= 100),
    ADD COLUMN IF NOT EXISTS problem_note TEXT CHECK (problem_note IS NULL OR length(problem_note) <= 300);
