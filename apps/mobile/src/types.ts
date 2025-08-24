export type Submission = {
  id: string;
  created_at: string;
  created_by: string;
  team_id: string;

  // base fields
  date: string;
  store_location: string;
  conditions?: string | null;
  price_per_unit?: number | null;
  shelf_space?: string | null;
  on_shelf?: number | null;
  tags?: string[] | null;
  notes?: string | null;

  // photos (we store *paths*; detail screen signs them)
  photo1_path?: string | null;
  photo2_path?: string | null;

  // new optional fields (present if you added them to DB)
  brand?: string | null;
  store_site?: string | null;
  location?: string | null;

  // legacy compatibility (some rows may have these)
  photo1_url?: string | null;
  photo2_url?: string | null;
};
