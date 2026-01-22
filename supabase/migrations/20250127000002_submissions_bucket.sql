-- Storage bucket and policies for submissions photos
-- Edge function expects: teams/{team_id}/submissions/{submission_id}/photoX.jpg

-- Create submissions bucket (public because photos need to be accessible)
INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', true)
ON CONFLICT (id) DO UPDATE
SET public = excluded.public
WHERE storage.buckets.id = 'submissions';

-- Public can read (for edge function and public viewing)
DROP POLICY IF EXISTS "public can read submissions" ON storage.objects;
CREATE POLICY "public can read submissions"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'submissions');

-- Authenticated users can upload (with team scoping)
DROP POLICY IF EXISTS "authenticated upload submissions" ON storage.objects;
CREATE POLICY "authenticated upload submissions"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'submissions'
  AND storage.foldername(name) LIKE 'teams/%/submissions/%'
  -- Team scoping: ensure user belongs to the team
  AND split_part(name, '/', 2) IN (
    SELECT team_id::text 
    FROM team_members 
    WHERE user_id = auth.uid()
  )
);

-- Authenticated users can update their team's photos
DROP POLICY IF EXISTS "authenticated update submissions" ON storage.objects;
CREATE POLICY "authenticated update submissions"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'submissions'
  AND storage.foldername(name) LIKE 'teams/%/submissions/%'
  AND split_part(name, '/', 2) IN (
    SELECT team_id::text 
    FROM team_members 
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'submissions'
  AND storage.foldername(name) LIKE 'teams/%/submissions/%'
  AND split_part(name, '/', 2) IN (
    SELECT team_id::text 
    FROM team_members 
    WHERE user_id = auth.uid()
  )
);

-- Service role bypass for edge function
-- The edge function uses SERVICE_ROLE_KEY and should have full access
COMMENT ON COLUMN storage.objects.bucket_id IS 'Bucket identifier';
COMMENT ON COLUMN storage.objects.name IS 'Full path including team/submission folders';