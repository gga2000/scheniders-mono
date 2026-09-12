-- =============================================
-- Orders: which number the customer asked to be contacted on
--
-- An order already carries `phone` and `secondary_phone`, but nothing recorded
-- that the customer *said* "reach me on this one". Agents were re-deriving it
-- from notes, or guessing and calling the wrong line.
--
-- Modelled as a pointer at one of the two existing slots rather than a third
-- number: a pair of booleans could claim both numbers are the WhatsApp line,
-- and a separate `whatsapp_phone` column would be a third number for staff to
-- keep in sync with the two that already exist.
-- =============================================

alter table public.orders
    add column if not exists whatsapp_contact_slot text;

comment on column public.orders.whatsapp_contact_slot is
    'Phone the customer asked to be contacted on: primary | secondary | null (never stated).';

alter table public.orders
    drop constraint if exists orders_whatsapp_contact_slot_check;

alter table public.orders
    add constraint orders_whatsapp_contact_slot_check
    check (whatsapp_contact_slot is null or whatsapp_contact_slot in ('primary', 'secondary'));

-- Designating the secondary slot while there is no secondary number would point
-- the UI at nothing. The client clears the designation whenever that number is
-- cleared or swapped; this constraint stops a bug from persisting the
-- inconsistent state silently.
alter table public.orders
    drop constraint if exists orders_whatsapp_slot_has_number_check;

alter table public.orders
    add constraint orders_whatsapp_slot_has_number_check
    check (
        whatsapp_contact_slot is distinct from 'secondary'
        or (secondary_phone is not null and length(btrim(secondary_phone)) > 0)
    );

-- RLS is already enabled on public.orders and every policy is tenant-scoped at
-- the row level, so the new column inherits that gating with no policy change.
-- Column privileges on this table are table-wide, so no GRANT is needed either.
