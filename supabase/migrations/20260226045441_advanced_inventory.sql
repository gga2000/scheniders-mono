-- 1. Add new columns to the products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS reserved_quantity integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_supply boolean NOT NULL DEFAULT false;

-- 2. Create the qc_quarantine table
CREATE TABLE IF NOT EXISTS public.qc_quarantine (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity integer NOT NULL,
    status text NOT NULL CHECK (status IN ('pending_inspection', 'restocked', 'written_off')),
    reason text NOT NULL, -- e.g., 'rejected_at_door', 'customer_refund', 'damaged_transit'
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    notes text
);

-- Note: We are not enforcing RLS initially based on the current setup, 
-- but if we do later, here is the boilerplate.
ALTER TABLE public.qc_quarantine ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.qc_quarantine FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.qc_quarantine FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.qc_quarantine FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.qc_quarantine FOR DELETE USING (true);

-- Enable realtime subscriptions for QC quarantine
-- (We may need to configure this manually in the Supabase dashboard as well)
ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_quarantine;
