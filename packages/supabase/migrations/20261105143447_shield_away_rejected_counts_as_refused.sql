-- Shield (Ali, 2026-11-05): a REJECTED order whose reason is "away / travelling"
-- (غير متواجد/مسافر) now counts like a rejection with no reason
-- (refused_unspecified, -25), not as not_available (-5). Staff often use it as
-- a soft excuse for a refusal. The same reason on a cancelled or postponed
-- order keeps not_available (-5).
CREATE OR REPLACE FUNCTION shield.reason_category(p_status text, p_reason text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
    SELECT CASE
        WHEN p_status = 'no_response' THEN 'no_answer'
        WHEN r ~ '(مكرر|duplicate|غير متوفر|unavailable|منتج خاطئ|wrong product|سعر|price|خارج منطقة|outside|لم يتم توصيله|عطل)' THEN NULL
        WHEN r ~ '(رفض|refus)' THEN 'refused'
        WHEN r ~ '(مغلق|phone off|switched off)' THEN 'phone_off'
        WHEN r ~ '(لا يجاوب|لم يرد|لا يرد|يجاوب|no answer|no reply|didn.t reply|did not reply)' THEN 'no_answer'
        WHEN r ~ '(الغى العميل|ألغى العميل|إلغاء العميل|customer cancel|changed mind|ملغي)' THEN 'changed_mind'
        WHEN r ~ '(معلومات خاطئة|عنوان خاطئ|رقم خاطئ|wrong address|wrong info|wrong number)' THEN 'wrong_info'
        WHEN p_status = 'rejected' THEN 'refused_unspecified'
        WHEN r ~ '(غير متواجد|مسافر|تأجيل|لاحقا|postpon|not available)' THEN 'not_available'
        ELSE NULL
    END
    FROM (SELECT lower(COALESCE(p_reason, '')) AS r) x;
$$;
REVOKE ALL ON FUNCTION shield.reason_category(text, text) FROM PUBLIC, anon, authenticated;

-- Rescore the phones that already have a not_available event.
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT DISTINCT f.tenant_id, f.norm_phone
               FROM public.customer_order_facts f
              WHERE length(f.norm_phone) = 10
                AND EXISTS (SELECT 1 FROM shield.events e
                             WHERE e.tenant_id = f.tenant_id
                               AND e.phone_key = shield.phone_key(f.norm_phone)
                               AND e.category = 'not_available') LOOP
        PERFORM shield.sync_phone(r.tenant_id, r.norm_phone);
    END LOOP;
END $$;
