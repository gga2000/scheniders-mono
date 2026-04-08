-- Create the storage bucket for product images if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Set up RLS policies for the objects in the product-images bucket

-- Allow public read access to the images
CREATE POLICY "Public Read Access for Product Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Allow authenticated and anon (for dev flexibility) to upload images
CREATE POLICY "Allow Uploads to Product Images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'product-images');

-- Allow updates to images
CREATE POLICY "Allow Updates to Product Images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'product-images');

-- Allow deletions
CREATE POLICY "Allow Deletions for Product Images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'product-images');
