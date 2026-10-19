-- A plain WhatsApp send (no template) is still contact worth attributing, but it
-- is not one of the scheduled follow-ups. Give it its own value rather than
-- mislabelling it as a reminder.
alter table public.orders
    drop constraint if exists orders_last_followup_type_check;

alter table public.orders
    add constraint orders_last_followup_type_check
    check (last_followup_type is null or last_followup_type in ('reminder', 'discount', 'confirmation', 'manual'));;
