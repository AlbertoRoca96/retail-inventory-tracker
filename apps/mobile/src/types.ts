export type Submission = {
  id: string;
  created_at: string;
  created_by: string;
  team_id: string;
  date: string;
  store_location: string;
  conditions?: string | null;
  price_per_unit?: number | null;
  shelf_space?: string | null;
  on_shelf?: number | null;
  tags?: string[] | null;
  notes?: string | null;
  photo1_path?: string | null;
  photo2_path?: string | null;
};
