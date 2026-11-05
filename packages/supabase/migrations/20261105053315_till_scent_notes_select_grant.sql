-- products uses column-level SELECT grants (cost columns stay hidden), so the
-- new scent_notes column must be granted for the Till to read it.
GRANT SELECT (scent_notes) ON public.products TO authenticated;
