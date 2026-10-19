-- Who sent the reminder / discount follow-up, mirroring the existing
-- last_status_changed_by_name / _avatar denormalization on this table.
-- `_avatar` carries the literal 'bot' for automated sends, same sentinel the
-- status actor already uses, so the card can render a bot glyph instead of a photo.
alter table public.orders
    add column if not exists last_followup_by_name text,
    add column if not exists last_followup_by_avatar text,
    add column if not exists last_followup_at timestamptz,
    add column if not exists last_followup_type text;

comment on column public.orders.last_followup_type is
    'Which follow-up was last sent: reminder | discount | confirmation.';

alter table public.orders
    drop constraint if exists orders_last_followup_type_check;

alter table public.orders
    add constraint orders_last_followup_type_check
    check (last_followup_type is null or last_followup_type in ('reminder', 'discount', 'confirmation'));;
