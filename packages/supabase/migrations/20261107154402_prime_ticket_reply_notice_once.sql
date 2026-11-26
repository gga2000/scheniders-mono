-- One notice per Prime ticket message per store, enforced by the database.
-- The Prime webhook used to read notifications back to see whether a message
-- was already announced (a read path the feed rules forbid, and a race when
-- Prime calls twice). The insert now fails with 23505 on a repeat, which the
-- caller reads as "already announced".
create unique index if not exists notifications_prime_ticket_reply_once
    on public.notifications (tenant_id, group_key)
    where type = 'prime.ticket_reply';
