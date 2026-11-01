-- QC quarantine removed from the app (Ali, 2026-11-01): the orders page now checks
-- returned and refunded items before marking them. The queue holds 175 old rows
-- (all backed up in /mnt/project-files/products-audit/qc-removal/) and 0 events.
-- Dropping the tables also drops their policies, indexes, trigger and realtime
-- publication entries.

BEGIN;

DROP TABLE IF EXISTS public.qc_quarantine_events;
DROP TABLE IF EXISTS public.qc_quarantine;
DROP FUNCTION IF EXISTS public.qc_log_status_change();

COMMIT;
