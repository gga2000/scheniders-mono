-- ─────────────────────────────────────────────────────────────────────────
-- QC Quarantine v2 — state-of-the-art quality-ops workspace
-- Adds: new statuses, photo evidence, inspector assignment, RMA flow,
-- reason taxonomy, activity log, realtime.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Drop old status CHECK constraint and add extended one
ALTER TABLE public.qc_quarantine
    DROP CONSTRAINT IF EXISTS qc_quarantine_status_check;

ALTER TABLE public.qc_quarantine
    ADD CONSTRAINT qc_quarantine_status_check
    CHECK (status IN (
        'pending_inspection',
        'in_inspection',
        'restocked',
        'written_off',
        'returned_to_supplier'
    ));

-- 1b. Add missing FKs to products and orders so PostgREST embeds resolve
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qc_quarantine_product_id_fkey') THEN
        ALTER TABLE public.qc_quarantine
            ADD CONSTRAINT qc_quarantine_product_id_fkey
            FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qc_quarantine_order_id_fkey') THEN
        ALTER TABLE public.qc_quarantine
            ADD CONSTRAINT qc_quarantine_order_id_fkey
            FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 2. Add new columns to qc_quarantine
ALTER TABLE public.qc_quarantine
    ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reason_category text CHECK (reason_category IN (
        'damaged', 'expired', 'defective', 'wrong_item', 'returned', 'other'
    )),
    ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS rma_number text,
    ADD COLUMN IF NOT EXISTS credit_expected numeric(12, 2),
    ADD COLUMN IF NOT EXISTS inspection_checklist jsonb,
    ADD COLUMN IF NOT EXISTS tenant_id uuid;

CREATE INDEX IF NOT EXISTS idx_qc_quarantine_status ON public.qc_quarantine(status);
CREATE INDEX IF NOT EXISTS idx_qc_quarantine_assigned_to ON public.qc_quarantine(assigned_to);
CREATE INDEX IF NOT EXISTS idx_qc_quarantine_created_at ON public.qc_quarantine(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qc_quarantine_reason_category ON public.qc_quarantine(reason_category);

-- 3. Audit log table — append-only activity events
CREATE TABLE IF NOT EXISTS public.qc_quarantine_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    qc_item_id uuid NOT NULL REFERENCES public.qc_quarantine(id) ON DELETE CASCADE,
    event_type text NOT NULL CHECK (event_type IN (
        'created',
        'status_changed',
        'assigned',
        'photo_added',
        'photo_removed',
        'note_added',
        'checklist_updated',
        'reason_updated',
        'bulk_action'
    )),
    actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    tenant_id uuid
);

CREATE INDEX IF NOT EXISTS idx_qc_events_item ON public.qc_quarantine_events(qc_item_id, created_at DESC);

ALTER TABLE public.qc_quarantine_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users on qc events" ON public.qc_quarantine_events FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users on qc events" ON public.qc_quarantine_events FOR INSERT WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_quarantine_events;

-- 4. Storage bucket for QC photo evidence
INSERT INTO storage.buckets (id, name, public)
VALUES ('qc-evidence', 'qc-evidence', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated upload to qc-evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'qc-evidence');
CREATE POLICY "Public read qc-evidence" ON storage.objects FOR SELECT USING (bucket_id = 'qc-evidence');
CREATE POLICY "Authenticated delete qc-evidence" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'qc-evidence');

-- 5. Trigger: auto-log status changes into events
CREATE OR REPLACE FUNCTION public.qc_log_status_change()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.qc_quarantine_events (qc_item_id, event_type, payload, tenant_id)
        VALUES (NEW.id, 'created', jsonb_build_object('status', NEW.status, 'reason', NEW.reason, 'quantity', NEW.quantity), NEW.tenant_id);
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.qc_quarantine_events (qc_item_id, event_type, actor_id, payload, tenant_id)
        VALUES (NEW.id, 'status_changed', NEW.resolved_by, jsonb_build_object('from', OLD.status, 'to', NEW.status), NEW.tenant_id);
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
        INSERT INTO public.qc_quarantine_events (qc_item_id, event_type, actor_id, payload, tenant_id)
        VALUES (NEW.id, 'assigned', NEW.resolved_by, jsonb_build_object('assigned_to', NEW.assigned_to), NEW.tenant_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS qc_log_status_trigger ON public.qc_quarantine;
CREATE TRIGGER qc_log_status_trigger
AFTER INSERT OR UPDATE ON public.qc_quarantine
FOR EACH ROW EXECUTE FUNCTION public.qc_log_status_change();
