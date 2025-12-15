-- Sample data for testing the dashboard
-- Run this in your Supabase SQL Editor to add some test orders

INSERT INTO orders (order_id, customer_name, phone, city, governorate_code, address_details, items, price, status, whatsapp_link, notes)
VALUES 
  (
    'LF-001-2024', 
    'أحمد محمد علي',
    '+9647701234567',
    'بغداد',
    'BG',
    'الكرادة - شارع 52 - بناية 10 - الطابق 3',
    '[{"name": "عطر رجالي - Dior Sauvage (100ml)", "quantity": 1, "price": 75000}]'::jsonb,
    75000.00,
    'new',
    'https://wa.me/9647701234567',
    'عميل جديد - اتصل الساعة 10 صباحاً'
  ),
  (
    'LF-002-2024',
    'فاطمة علي حسن',
    '+9647809876543',
    'البصرة',
    'BS',
    'العشار - قرب سوق العشار - محلة الجمهورية',
    '[{"name": "عطر نسائي - Chanel No.5 (50ml)", "quantity": 2, "price": 120000}]'::jsonb,
    120000.00,
    'contacted',
    'https://wa.me/9647809876543',
    'تم الاتصال - طلبت تأكيد السعر'
  ),
  (
    'LF-003-2024',
    'محمد حسين جعفر',
    '+9647712345678',
    'أربيل',
    'ER',
    'شارع 100 - منطقة الإسكان',
    '[{"name": "عطر رجالي - Tom Ford Oud Wood", "quantity": 1, "price": 95000}, {"name": "عطر نسائي - Lancôme La Vie Est Belle", "quantity": 1, "price": 85000}]'::jsonb,
    180000.00,
    'confirmed',
    'https://wa.me/9647712345678',
    'تأكيد الطلب - سيتم الشحن غداً'
  ),
  (
    'LF-004-2024',
    'زينب كريم صالح',
    '+9647798765432',
    'النجف',
    'NJ',
    'حي الأمير - بالقرب من حسينية الحيدرية',
    '[{"name": "عطر نسائي - Gucci Bloom", "quantity": 1, "price": 78000}]'::jsonb,
    78000.00,
    'delivered',
    'https://wa.me/9647798765432',
    'تم التوصيل بنجاح - عميلة مميزة'
  ),
  (
    'LF-005-2024',
    'حسن عبدالله',
    '+9647723456789',
    'كربلاء',
    'KR',
    'حي المعلمين - شارع 20',
    '[{"name": "عطر رجالي - Versace Eros", "quantity": 1, "price": 68000}]'::jsonb,
    68000.00,
    'rejected',
    'https://wa.me/9647723456789',
    'العميل ألغى الطلب - السعر غالي'
  ),
  (
    'LF-006-2024',
    'نور الهدى صادق',
    '+9647734567890',
    'الموصل',
    'MO',
    'الجانب الأيسر - حي الزهراء',
    '[{"name": "عطر نسائي - YSL Black Opium", "quantity": 1, "price": 88000}]'::jsonb,
    88000.00,
    'new',
    'https://wa.me/9647734567890',
    NULL
  ),
  (
    'LF-007-2024',
    'علي رضا محمود',
    '+9647745678901',
    'بغداد',
    'BG',
    'الجادرية - قرب الجامعة',
    '[{"name": "عطر رجالي - Paco Rabanne 1 Million", "quantity": 2, "price": 72000}]'::jsonb,
    144000.00,
    'confirmed',
    'https://wa.me/9647745678901',
    'طلب كبير - عميل مميز'
  ),
  (
    'LF-008-2024',
    'سارة أحمد كاظم',
    '+9647756789012',
    'السليمانية',
    'SU',
    'منطقة بختياري',
    '[{"name": "عطر نسائي - Miss Dior", "quantity": 1, "price": 92000}]'::jsonb,
    92000.00,
    'contacted',
    'https://wa.me/9647756789012',
    'في انتظار الرد'
  );
