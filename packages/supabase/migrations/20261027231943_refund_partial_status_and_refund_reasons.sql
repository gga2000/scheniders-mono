-- =============================================
-- REFUNDS: 'partial' refund status + managed refund reasons
--
-- 1. refund_status gains 'partial': an original order where some, not all,
--    of what was bought has been refunded. Set only by the refund status
--    sync trigger (next migration), never by the browser.
--
-- 2. order_reasons gains kind 'refund' so the refund sheet picks from the
--    store's managed list (Settings) instead of the hardcoded options the
--    old return modal carried. Seeded for every tenant that has none yet;
--    tenants created later get the same list from the app's defaults
--    (DEFAULT_REFUND_REASONS in apps/platform/lib/order-reasons.ts).
--
-- Tenant scoping: order_reasons keeps its existing RLS (members read their
-- tenant's rows, owner/admin write). No policy changes.
-- =============================================

ALTER TYPE public.refund_status ADD VALUE IF NOT EXISTS 'partial';

ALTER TABLE public.order_reasons DROP CONSTRAINT IF EXISTS order_reasons_kind_check;
ALTER TABLE public.order_reasons
    ADD CONSTRAINT order_reasons_kind_check CHECK (kind IN ('cancel', 'reject', 'refund'));

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT id FROM public.tenants LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.order_reasons WHERE tenant_id = t.id AND kind = 'refund'
        ) THEN
            INSERT INTO public.order_reasons
                (tenant_id, kind, label_ar, label_en, sort_order, is_active, is_system, requires_note, color, emoji)
            VALUES
                (t.id, 'refund', 'لم يعجب الزبون المنتج',   'Customer didn''t like it', 0, true, false, false, 'amber',   '🙁'),
                (t.id, 'refund', 'المنتج تالف أو معيب',     'Damaged or faulty',        1, true, false, false, 'rose',    '💔'),
                (t.id, 'refund', 'منتج خاطئ',               'Wrong item sent',          2, true, false, false, 'orange',  '🔀'),
                (t.id, 'refund', 'غير مطابق للوصف',         'Not as described',         3, true, false, false, 'violet',  '📝'),
                (t.id, 'refund', 'تأخر التوصيل',            'Late delivery',            4, true, false, false, 'sky',     '⏰'),
                (t.id, 'refund', 'سبب آخر',                 'Other reason',             5, true, true,  true,  'slate',   '✏️');
        END IF;
    END LOOP;
END $$;
