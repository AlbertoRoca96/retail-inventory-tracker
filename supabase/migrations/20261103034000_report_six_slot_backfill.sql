-- Ensure legacy databases have all six original report photo slots.
-- Safe to run repeatedly; no data rewrite.
begin;

alter table public.submissions
  add column if not exists photo3_path text,
  add column if not exists photo3_url text,
  add column if not exists photo4_path text,
  add column if not exists photo4_url text,
  add column if not exists photo5_path text,
  add column if not exists photo5_url text,
  add column if not exists photo6_path text,
  add column if not exists photo6_url text;

commit;
