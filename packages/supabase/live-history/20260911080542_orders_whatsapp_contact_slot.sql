alter table public.orders
    add column if not exists whatsapp_contact_slot text;

comment on column public.orders.whatsapp_contact_slot is
    'Phone the customer asked to be contacted on: primary | secondary | null (never stated).';

alter table public.orders
    drop constraint if exists orders_whatsapp_contact_slot_check;

alter table public.orders
    add constraint orders_whatsapp_contact_slot_check
    check (whatsapp_contact_slot is null or whatsapp_contact_slot in ('primary', 'secondary'));

alter table public.orders
    drop constraint if exists orders_whatsapp_slot_has_number_check;

alter table public.orders
    add constraint orders_whatsapp_slot_has_number_check
    check (
        whatsapp_contact_slot is distinct from 'secondary'
        or (secondary_phone is not null and length(btrim(secondary_phone)) > 0)
    );;
