-- Additive fixed-slot expansion; original six columns and values stay untouched.
-- Must precede submit_report_v1, which references all twenty typed slots.
begin;
alter table public.submissions
  add column if not exists photo7_path text,
  add column if not exists photo7_url text,
  add column if not exists photo8_path text,
  add column if not exists photo8_url text,
  add column if not exists photo9_path text,
  add column if not exists photo9_url text,
  add column if not exists photo10_path text,
  add column if not exists photo10_url text,
  add column if not exists photo11_path text,
  add column if not exists photo11_url text,
  add column if not exists photo12_path text,
  add column if not exists photo12_url text,
  add column if not exists photo13_path text,
  add column if not exists photo13_url text,
  add column if not exists photo14_path text,
  add column if not exists photo14_url text,
  add column if not exists photo15_path text,
  add column if not exists photo15_url text,
  add column if not exists photo16_path text,
  add column if not exists photo16_url text,
  add column if not exists photo17_path text,
  add column if not exists photo17_url text,
  add column if not exists photo18_path text,
  add column if not exists photo18_url text,
  add column if not exists photo19_path text,
  add column if not exists photo19_url text,
  add column if not exists photo20_path text,
  add column if not exists photo20_url text;
commit;
