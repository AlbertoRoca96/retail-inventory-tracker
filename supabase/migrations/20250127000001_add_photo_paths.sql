-- Add photo_path columns back for the edge function
-- The edge function expects photo1_path and photo2_path (storage paths)
-- PLUS photo1_url and photo2_url (public URLs)

-- Add photo1_path
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS photo1_path TEXT;

-- Add photo2_path  
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS photo2_path TEXT;

-- Create index for path lookups
CREATE INDEX IF NOT EXISTS idx_submissions_photo1_path
ON public.submissions(photo1_path)
WHERE photo1_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_photo2_path
ON public.submissions(photo2_path)
WHERE photo2_path IS NOT NULL;

-- Add comment explaining the two columns
COMMENT ON COLUMN public.submissions.photo1_path IS 'Storage path in submissions bucket (e.g., teams/abc/submissions/xyz/photo1.jpg)';
COMMENT ON COLUMN public.submissions.photo1_url IS 'Public URL for photo1 (can be signed or public)';
COMMENT ON COLUMN public.submissions.photo2_path IS 'Storage path in submissions bucket';
COMMENT ON COLUMN public.submissions.photo2_url IS 'Public URL for photo2';