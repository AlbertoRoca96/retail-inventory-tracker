// apps/mobile/src/types.ts

export type Submission = {
  // Identity & ownership
  id: string;
  created_at: string;        // ISO string from Postgres timestamptz
  created_by: string;        // auth.users.id (UUID)
  team_id: string;

  // Domain fields
  date: string;              // 'YYYY-MM-DD'
  store_location: string;    // required in app
  conditions?: string | null;
  price_per_unit?: number | null;
  shelf_space?: string | null;
  on_shelf?: number | null;

  /**
   * Note: historical rows might have tags as a TEXT (comma-separated) rather than TEXT[].
   * Keep the union so UI can handle both shapes safely.
   */
  tags?: string[] | string | null;

  notes?: string | null;

  // Legacy storage paths (for signing) + current public URLs
  photo1_path?: string | null;
  photo2_path?: string | null;
  photo1_url?: string | null;
  photo2_url?: string | null;

  // Optional new fields
  brand?: string | null;
  store_site?: string | null;
  location?: string | null;

  // Priority (1 urgent, 2 soon, 3 normal)
  priority_level?: number | null;
};

/**
 * Shape returned by RPC `public.get_submission_with_submitter(sub_id uuid)`.
 * Same as Submission, plus the submitter's email when available.
 */
export type SubmissionWithSubmitter = Submission & {
  submitter_email?: string | null;
};
