// apps/mobile/src/types.ts
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

  tags?: string[] | string | null;
  notes?: string | null;

  photo1_path?: string | null;
  photo2_path?: string | null;
  photo1_url?: string | null;
  photo2_url?: string | null;

  brand?: string | null;
  store_site?: string | null;
  location?: string | null;

  priority_level?: number | null;
};

export type SubmissionWithSubmitter = Submission & {
  submitter_email?: string | null;
  submitter_display_name?: string | null;
};

/* ===========================
   NEW: Templates / Last-Used
   =========================== */

/** The subset of fields we prefill via templates/last-used. */
export type TemplateData = {
  storeSite?: string;
  storeLocation?: string;
  location?: string;
  brand?: string;
  shelfSpace?: string;
  pricePerUnit?: string;
  onShelf?: string;
  tags?: string;
  notes?: string;
  priorityLevel?: number; // 1..3
};

/** Row shape for submission_templates table. */
export type Template = {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  team_id: string | null;
  name: string;
  is_default: boolean;
  data: TemplateData;
};
