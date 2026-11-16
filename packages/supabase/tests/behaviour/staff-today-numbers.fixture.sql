-- Throwaway Postgres 16 database for the numbers above the Today desk
-- (20261116125017_staff_today_numbers): the admin-console-stats database (shops,
-- orders and wallet lines) with its views from the real migrations.
-- NEVER run this against Supabase: it creates roles and tables.

\ir admin-console-stats.fixture.sql
