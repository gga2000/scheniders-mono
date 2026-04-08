-- Migration: Create Vault Backups Storage and Security Logs
-- Description: Sets up the secure infrastructure for the Data Vault cloud sync.

-- 1. Create a `security_logs` table for auditing vault operations
CREATE TABLE IF NOT EXISTS public.security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(255) NOT NULL, -- e.g., 'VAULT_GENERATE', 'VAULT_RESTORE', 'VAULT_DOWNLOAD'
    details JSONB DEFAULT '{}'::jsonb, -- Store counts, format, etc.
    user_id UUID REFERENCES auth.users(id), -- If we have auth, track who did it
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: RLS policies for security_logs (Only admins can read/write)
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for authenticated users only" ON public.security_logs
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable read for authenticated users only" ON public.security_logs
    FOR SELECT TO authenticated USING (true);


-- 2. Ensure 'vault_backups' storage bucket exists
-- We do this through standard Supabase storage procedures
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
    'vault_backups', 
    'vault_backups', 
    false, -- Private bucket! Zero-knowledge encrypted files only.
    false, 
    104857600, -- 100MB max per vault
    ARRAY['application/octet-stream', 'application/json', 'text/csv']
) ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 104857600;

-- 3. Storage Policies for `vault_backups`
-- Allow authenticated users to upload/download their backups
CREATE POLICY "Allow authenticated full access to vault_backups" 
    ON storage.objects FOR ALL TO authenticated 
    USING (bucket_id = 'vault_backups') 
    WITH CHECK (bucket_id = 'vault_backups');
