export type Submission = {
  id: string;
  created_at: string;
  created_by: string;
  team_id: string;

  date: string;
  store_location: string;

  // NEW optional fields supported by the UI & metrics
  brand?: string | null;
  store_site?: string | null;
  location?: string | null;

  conditions?: string | null;
  price_per_unit?: number | null;
  shelf_space?: string | null;
  on_shelf?: number | null;
  tags?: string[] | null;
  notes?: string | null;

  // Photos (support both the new public URLs and legacy signed paths)
  photo1_url?: string | null;
  photo2_url?: string | null;
  photo1_path?: string | null;
  photo2_path?: string | null;

  // Optional status (kept for forward-compat; not required)
  status?: string | null;
};
