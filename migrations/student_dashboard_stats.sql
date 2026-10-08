-- Run this migration in the Supabase SQL Editor once.
-- Public student homepage statistics: book titles, dates, and aggregate counts only.
-- Never expose student IDs, names, class IDs, or raw checkout records.
create or replace function public.student_dashboard_stats()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'monthly_checkouts', (
      select count(*) from public."Checkouts" c
      where c."Check Out Date" >= date_trunc('month', timezone('America/New_York', now())) at time zone 'America/New_York'
        and c."Check Out Date" <= now()
    ),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'book_id', x.book_id,
        'checkout_date', x.checkout_date
      ) order by x.checkout_date desc, x.book_id)
      from (
        select c.book_id, c."Check Out Date" as checkout_date
        from public."Checkouts" c
        join public."Books" b on b.id=c.book_id
        where c."Check Out Date" is not null
        order by c."Check Out Date" desc, c.book_id
        limit 5
      ) x
    ), '[]'::jsonb),
    'popular', coalesce((
      select jsonb_agg(jsonb_build_object(
        'book_id', p.book_id,
        'checkouts', p.checkouts
      ) order by p.checkouts desc, p.book_id)
      from (
        select c.book_id, count(*) as checkouts
        from public."Checkouts" c
        join public."Books" b on b.id=c.book_id
        group by c.book_id
        order by count(*) desc, c.book_id
        limit 5
      ) p
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.student_dashboard_stats() from public;
grant execute on function public.student_dashboard_stats() to anon, authenticated;
