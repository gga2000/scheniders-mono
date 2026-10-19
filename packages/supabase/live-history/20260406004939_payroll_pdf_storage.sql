ALTER TABLE public.payroll_records
    ADD COLUMN IF NOT EXISTS pdf_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payroll-pdfs',
    'payroll-pdfs',
    false,
    10485760,
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins can manage payroll pdfs" ON storage.objects;
CREATE POLICY "Admins can manage payroll pdfs"
    ON storage.objects FOR ALL
    USING (
        bucket_id = 'payroll-pdfs' AND
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        bucket_id = 'payroll-pdfs' AND
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
    );;
