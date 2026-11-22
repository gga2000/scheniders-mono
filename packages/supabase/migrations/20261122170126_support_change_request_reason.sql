-- "Need a change?" in the merchant header sends a change request into the Help chat.
-- Staff close those with their own reason, so the scoreboard counts them.
alter table public.support_cases drop constraint support_cases_reason_check;
alter table public.support_cases add constraint support_cases_reason_check check (reason in (
    'orders', 'delivery', 'wallet_billing', 'products', 'store_design',
    'whatsapp', 'account_login', 'bug', 'how_to', 'change_request', 'other'));

-- The inbox marks conversations that hold a change request.
create index if not exists support_messages_change_request_idx
    on public.support_messages (case_id)
    where context ->> 'kind' = 'change_request';