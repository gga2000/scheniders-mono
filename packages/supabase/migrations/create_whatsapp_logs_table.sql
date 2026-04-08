-- WhatsApp Message Logs
-- Tracks all outbound and inbound WhatsApp messages for auditing
-- Used by the Interakt integration (COD confirmation flow)

CREATE TABLE IF NOT EXISTS whatsapp_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,                         -- Display order ID (e.g., "L-5768")
    order_uuid UUID REFERENCES orders(id) ON DELETE SET NULL,
    phone TEXT NOT NULL,
    template_name TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'outbound',      -- 'outbound' | 'inbound'
    status TEXT NOT NULL DEFAULT 'sent',             -- 'sent' | 'delivered' | 'read' | 'failed' | 'received'
    interakt_message_id TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_order_uuid ON whatsapp_logs(order_uuid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_phone ON whatsapp_logs(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created_at ON whatsapp_logs(created_at DESC);

-- RLS: Allow authenticated users to read/insert
ALTER TABLE whatsapp_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON whatsapp_logs
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON whatsapp_logs
    FOR INSERT TO authenticated WITH CHECK (true);

-- Service role can do everything (for webhook handler)
CREATE POLICY "Allow service role all" ON whatsapp_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
