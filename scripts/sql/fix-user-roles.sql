-- Fix User Profiles and Roles for specific user
-- Run this in the Supabase SQL Editor

-- 1. Ensure profile exists (if missing)
INSERT INTO public.user_profiles (id, email, display_name, role)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1)),
    'admin' -- Force admin for this specific user if creating new
FROM auth.users
WHERE email = 'aa988695@gmail.com'
ON CONFLICT (id) DO UPDATE
SET role = 'admin'; -- If exists, update to admin

-- 2. Update role to admin if profile already existed but was not admin
UPDATE public.user_profiles
SET role = 'admin'
WHERE email = 'aa988695@gmail.com';

-- Verify
SELECT * FROM public.user_profiles WHERE email = 'aa988695@gmail.com';
