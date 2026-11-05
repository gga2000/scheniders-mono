-- =============================================================================
-- Shield Trust rules: reason wording -> category -> points
-- =============================================================================
--
-- WHAT THIS PROVES (after the shield_* migrations are applied)
--   * every real reason label stores use maps to the category Ali approved,
--     including the cases that went wrong before:
--       - a rejected "away / travelling" order costs 25, not 5 (Ali 2026-11-05);
--       - a cancelled "away" order still costs 5;
--       - store-fault reasons (duplicate, out of stock, not delivered, fault)
--         cost 0; a rejection with no reason costs 25;
--   * the points table: refused 35, no answer / phone off / no reason 25,
--     wrong info 20, changed mind 10, away 5, anything else 0.
--
-- READ-ONLY. Both functions are pure, so this is safe on any database.
--
-- HOW TO RUN
--   psql -d <db> -v ON_ERROR_STOP=1 -f shield_rules.sql   -- prints PASS, raises on a failure
-- =============================================================================
DO $$
DECLARE
    c record;
    got text;
BEGIN
    FOR c IN SELECT * FROM (VALUES
        ('rejected',    'رفض العميل',                 'refused'),
        ('rejected',    'العميل رفض استلام الطلب',     'refused'),
        ('rejected',    NULL,                          'refused_unspecified'),
        ('rejected',    'سبب آخر',                     'refused_unspecified'),
        ('rejected',    'غير متواجد/مسافر',            'refused_unspecified'),
        ('rejected',    'غير متواجد',                  'refused_unspecified'),
        ('rejected',    'لا يجاوب',                    'no_answer'),
        ('rejected',    'لم يرد',                      'no_answer'),
        ('rejected',    'لا يرد بعد الاتفاق',          'no_answer'),
        ('rejected',    'الهاتف مغلق',                 'phone_off'),
        ('rejected',    'عنوان خاطئ',                  'wrong_info'),
        ('rejected',    'duplicate_merged',            NULL),
        ('rejected',    'طلب مكرر',                    NULL),
        ('rejected',    'لم يتم توصيله',               NULL),
        ('rejected',    'منتج خاطئ',                   NULL),
        ('no_response', NULL,                          'no_answer'),
        ('cancelled',   NULL,                          NULL),
        ('cancelled',   'ألغى العميل',                 'changed_mind'),
        ('cancelled',   'Customer cancelled',          'changed_mind'),
        ('cancelled',   'معلومات خاطئة',               'wrong_info'),
        ('cancelled',   'منتج غير متوفر',              NULL),
        ('cancelled',   'خارج منطقة التوصيل',          NULL),
        ('cancelled',   'عطل',                         NULL),
        ('cancelled',   'Cancelled via duplicate comparison', NULL),
        ('cancelled',   'غير متواجد',                  'not_available'),
        ('cancelled',   'تأجيل',                       'not_available')
    ) v(status, reason, want) LOOP
        got := shield.reason_category(c.status, c.reason);
        IF got IS DISTINCT FROM c.want THEN
            RAISE EXCEPTION 'reason_category(%, %) = %, want %', c.status, c.reason, got, c.want;
        END IF;
    END LOOP;

    FOR c IN SELECT * FROM (VALUES
        ('refused', 35), ('refused_unspecified', 25), ('no_answer', 25), ('phone_off', 25),
        ('wrong_info', 20), ('changed_mind', 10), ('not_available', 5), ('something_else', 0)
    ) v(cat, pts) LOOP
        IF shield.trust_penalty(c.cat) <> c.pts THEN
            RAISE EXCEPTION 'trust_penalty(%) = %, want %', c.cat, shield.trust_penalty(c.cat), c.pts;
        END IF;
    END LOOP;

    RAISE NOTICE 'PASS shield_rules: 26 reasons, 8 penalties';
END $$;
