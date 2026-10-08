-- Run in Supabase SQL Editor to enable student Category search.
-- Only public book metadata and aggregate availability are returned.
CREATE OR REPLACE FUNCTION public.student_catalog()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'title', b."Title",
    'author', b."Author",
    'category', b."Category",
    'description', b."Description",
    'cover', b."Cover URL",
    'genre', b."Genre",
    'genres', b."Genres",
    'series', b."Series",
    'series_number', b."Series #",
    'reading_level', b."Reading Level",
    'available', GREATEST(0, COALESCE(b."Copies",0)-COALESCE(used.n,0))
  ) ORDER BY b."Title"), '[]'::jsonb)
  FROM public."Books" b
  LEFT JOIN LATERAL (
    SELECT count(*)::integer n FROM public."Checkouts" c
    WHERE c.book_id=b.id AND c."Return Date" IS NULL
  ) used ON true;
$$;
REVOKE ALL ON FUNCTION public.student_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_catalog() TO anon, authenticated;