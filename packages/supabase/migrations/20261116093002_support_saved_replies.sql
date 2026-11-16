-- Merchant support, wave 2: saved replies the support team writes and edits.
--
-- One shared list for the whole team (not per shop). Staff pick a reply in the
-- staff console and it fills the reply box; {name}, {shop} and {order} are
-- filled from the conversation before sending.
--
-- Server-only, like the other support tables: RLS on, no policies, no grants to
-- the browser roles. The staff console reads and writes through service-role
-- routes and records who last changed each reply.

CREATE TABLE public.support_saved_replies (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title      text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 40),
    body       text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
    position   integer NOT NULL DEFAULT 0,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_saved_replies_order_idx ON public.support_saved_replies (position, title);

ALTER TABLE public.support_saved_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_saved_replies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_saved_replies TO service_role;

-- The four replies that were fixed in code in wave 1, plus one that uses the
-- order number. The team edits them from here on.
INSERT INTO public.support_saved_replies (title, body, position) VALUES
    ('Greeting',         'أهلاً {name}، معك فريق دعم شنايدر. كيف نقدر نساعدك؟', 10),
    ('Checking',         'وصلتنا رسالتك ونراجع المشكلة الآن، نرجع لك بعد قليل.', 20),
    ('Ask order number', 'ممكن ترسل لنا رقم الطلب حتى نراجعه؟', 30),
    ('Checking order',   'نراجع الطلب {order} الآن، نرجع لك بعد قليل.', 40),
    ('Fixed',            'تم حل المشكلة. جرّب مرة ثانية وخبرنا إذا بقى شيء.', 50);
