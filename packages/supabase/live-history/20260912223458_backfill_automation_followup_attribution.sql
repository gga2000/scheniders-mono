-- RECORD OF AN OUT-OF-BAND RUN. Do not re-run this against production.
--
-- This backfill was applied to production (sduvpgqwhxragxtxztur) on 2026-09-12
-- between 22:34:58 and 22:42:14 UTC by pasting the body below into execute_sql,
-- so it was never recorded in supabase_migrations.schema_migrations. The window
-- is the orders.updated_at range of the 1,368 stamped rows not touched since.
-- Its effect is live: 1,401 orders carry the bot sentinel with a
-- last_followup_at before 2026-09-13, and no order with an automated send from
-- before 2026-10-02 is left unattributed. Recorded on 2026-10-20 with a
-- schema_migrations insert (repair --status applied semantics), not executed.
--
-- It was authored as 20260913110000 on feat/notifications-overhaul. main gave
-- that version to 20260913110000_notification_settings_locale.sql, so it is
-- filed here under the time it actually ran.
--
-- Re-running it is NOT a no-op. Its guard only checks last_followup_by_name, so
-- today it would stamp 16 orders with automated sends from 2026-10-02..10-13
-- that 20261019132424_backfill_followup_attribution_oct deliberately skipped (a
-- later manual send exists, so the last sender is unknown). On an empty
-- database (db reset, branches) it touches nothing.
--
-- Backfill follow-up attribution for messages the system sent itself.
--
-- `dispatchWhatsAppEvent` (the LightFunnels webhook's immediate confirmation)
-- stamped `last_contacted_at` but never recorded WHO sent the message, so the
-- orders card showed a customer who had already been messaged with nobody behind
-- it — indistinguishable from "no one has touched this". The dispatcher records
-- the sender from now on; this fills in the sends already on record.
--
-- Only automation is backfilled. `whatsapp_logs` rows written by the manual send
-- route carried no actor, so which agent sent those is genuinely unknown and is
-- left null rather than guessed at. (The route records it from now on, so the
-- gap closes going forward.)
--
-- Applied in chunks: each UPDATE on `orders` fires the inventory, loyalty,
-- referral and trust row triggers, so one statement over ~1,400 rows runs past
-- the statement timeout. Re-running is free — the guard skips anything already
-- attributed.
DO $$
DECLARE v_rows INTEGER;
BEGIN
    LOOP
        WITH latest_send AS (
            SELECT DISTINCT ON (l.order_uuid)
                   l.order_uuid,
                   l.created_at,
                   COALESCE(l.payload->>'templateType', 'confirmation') AS template_type
            FROM public.whatsapp_logs l
            JOIN public.orders o ON o.id = l.order_uuid
            WHERE l.direction = 'outbound'
              AND l.status = 'sent'
              AND l.payload->>'source' IN ('dispatch-event', 'dispatch-event-secondary', 'auto_follow_up')
              AND o.last_followup_by_name IS NULL
            ORDER BY l.order_uuid, l.created_at DESC
            LIMIT 200
        )
        UPDATE public.orders o
        SET last_followup_by_name   = 'الإرسال التلقائي',
            last_followup_by_avatar = 'bot',
            last_followup_at        = s.created_at,
            last_followup_type      = s.template_type
        FROM latest_send s
        WHERE o.id = s.order_uuid
          AND o.last_followup_by_name IS NULL;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        EXIT WHEN v_rows = 0;
    END LOOP;
END $$;
