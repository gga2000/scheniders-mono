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
