-- =============================================
-- WhatsApp Templates Migration - Schneider Perfumes
-- Run this in Supabase SQL Editor
-- =============================================

-- Add new columns to message_templates if they don't exist
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS template_type TEXT 
  CHECK (template_type IN ('confirmation', 'reminder', 'discount'));
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS discount_percentage INTEGER DEFAULT 10;

-- Delete existing Schneider templates to replace with new ones
DELETE FROM message_templates WHERE template_type IN ('confirmation', 'reminder', 'discount');

-- Insert the 3 workflow templates for Schneider Perfumes
-- New variables: {customer_name} in greeting, {product} shows multiple items with +, {discount_percent}
INSERT INTO message_templates (name, content, content_ar, category, variables, sort_order, is_active, template_type, discount_percentage) 
VALUES
  (
    'تأكيد الطلب - شنايدر',
    'Order Confirmation - Schneider Perfumes',
    '★ *يا هلا ومرحبا {customer_name}* ★
نورتونا بطلبكم من متجر *شنايدر للعطور الفاخرة* ★
حبينا نطمنكم بأنو طلبكم راح يتم تجهيزه بكل حب وارساله لشركة التوصيل

■ *بالتفاصيل التالية:*

● *اسم العميل المحترم:* ({customer_name})
● *المنتجات:* ({product})
● *رقم الحجز:* {sequence_number}
● *عنوان العميل:* ({address})
● *رقم الهاتف الاول:* ({phone})
● *رقم الهاتف الاحتياط:* ({secondary_phone})
● *السعر الاجمالي:* ({price}) دينار عراقي فقط والتوصيل مجاني

► لتأكيد الحجز الرجاء ارسال كلمة *تأكيد*
► لتعديل البيانات أو الغاء الطلب الرجاء ارسال كلمة *الغاء*

★ شكرا لثقتكم بنا ★',
    'confirmation',
    ARRAY['customer_name', 'product', 'sequence_number', 'address', 'phone', 'secondary_phone', 'price'],
    1,
    true,
    'confirmation',
    NULL
  ),
  (
    'تذكير - شنايدر',
    'Reminder - Schneider Perfumes',
    '■ *مرحبا {customer_name}* ■

تواصلنا معك سابقا بخصوص طلبك من متجر *شنايدر للعطور الفاخرة*

نود تذكيرك بأن طلبك لا يزال محجوزا بإسمك

■ *تفاصيل الطلب:*
● *اسم العميل:* ({customer_name})
● *المنتجات:* ({product})
● *رقم الحجز:* {sequence_number}
● *السعر:* ({price}) دينار عراقي فقط

★ *العرض لفترة محدودة!* ★

► لتأكيد الطلب ارسل *تأكيد*
► للإلغاء ارسل *الغاء*

★ نتطلع لخدمتك ★',
    'reminder',
    ARRAY['customer_name', 'product', 'sequence_number', 'price'],
    2,
    true,
    'reminder',
    NULL
  ),
  (
    'عرض خاص - شنايدر',
    'Discount Offer - Schneider Perfumes',
    '★ *عرض خاص لك {customer_name}* ★

لأنك من عملائنا المميزين، نقدم لك *خصم إضافي {discount_percent}%* على طلبك!

■ *العرض الجديد:*
● *المنتجات:* ({product})
● *السعر الأصلي:* ({price}) دينار
● *السعر بعد الخصم:* ({discounted_price}) دينار فقط!
● *التوصيل:* مجاني

★★ *هذا العرض صالح لـ 24 ساعة فقط!* ★★

► للحصول على العرض ارسل *موافق*
► أو تواصل معنا مباشرة

★ شنايدر للعطور الفاخرة ★',
    'discount',
    ARRAY['customer_name', 'product', 'price', 'discounted_price', 'discount_percent'],
    3,
    true,
    'discount',
    10
  )
ON CONFLICT DO NOTHING;

-- Add comments
COMMENT ON COLUMN message_templates.template_type IS 'Type of workflow template: confirmation, reminder, or discount';
COMMENT ON COLUMN message_templates.discount_percentage IS 'Discount percentage for discount-type templates';
