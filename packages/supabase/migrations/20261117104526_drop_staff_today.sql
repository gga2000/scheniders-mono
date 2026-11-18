-- The Today desk's three reads have had no caller since the console went back
-- to the old Home (Ali, 16 Nov: "Only old home and merchants"); the page and
-- its routes were removed then. The functions stayed live and in the tests.
--
-- Rollback: apply 20261116125015_staff_today_desk.sql,
-- 20261116125017_staff_today_numbers.sql and 20261116130612_staff_today_handled.sql
-- again.

DROP FUNCTION IF EXISTS public.staff_today_desk();
DROP FUNCTION IF EXISTS public.staff_today_numbers(timestamptz);
DROP FUNCTION IF EXISTS public.staff_today_handled(timestamptz);
