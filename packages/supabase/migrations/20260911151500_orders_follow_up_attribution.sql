-- =============================================
-- Orders: who sent the reminder / discount follow-up
--
-- The card shows a follow-up cue ("مرت 61 ساعة (خصم)") computed purely from the
-- clock, so it keeps nagging after an agent has already sent the message — and
-- nobody can tell who handled it. Two agents double-sending the same discount is
-- the natural consequence.
--
-- Denormalized onto the order rather than joined from whatsapp_logs, mirroring
-- the last_status_changed_by_name / _avatar pair that already lives here: the
-- orders list is a single flat fetch and must not grow a join.
-- Already applied to the NEW project as 20260911110345 (orders_follow_up_attribution) and 20260911111350 (orders_followup_type_allow_manual);
-- this file records that schema on disk. Every statement is idempotent.
-- =============================================

alter table public.orders
    add column if not exists last_followup_by_name text,
    add column if not exists last_followup_by_avatar text,
    add column if not exists last_followup_at timestamptz,
    add column if not exists last_followup_type text;

comment on column public.orders.last_followup_by_avatar is
    'Avatar URL, or the literal ''bot'' for automated sends — same sentinel last_status_changed_by_avatar uses.';

comment on column public.orders.last_followup_type is
    'Which message was last sent: reminder | discount | confirmation | manual (a plain WhatsApp send with no template).';

alter table public.orders
    drop constraint if exists orders_last_followup_type_check;

alter table public.orders
    add constraint orders_last_followup_type_check
    check (last_followup_type is null or last_followup_type in ('reminder', 'discount', 'confirmation', 'manual'));

-- RLS is already enabled on public.orders and every policy is row-level and
-- tenant-scoped, so these columns inherit that gating. Column privileges on this
-- table are table-wide, so no GRANT is needed.
