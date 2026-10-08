-- Run once in Supabase SQL Editor. Public, read-only series presentation data.
-- No students, checkouts, or private teacher records are exposed.
create or replace function public.student_series_catalog()
returns jsonb language sql stable security definer set search_path = ''
as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'name', s."Name",
  'cover', s."Cover URL",
  'complete', coalesce(s."Complete", false)
) order by s."Name"), '[]'::jsonb)
from public."Series" s;
$$;
revoke all on function public.student_series_catalog() from public;
grant execute on function public.student_series_catalog() to anon, authenticated;
