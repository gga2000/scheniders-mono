-- Throwaway Postgres 16 database with what next_order_number reads and writes
-- (live shapes, 2026-11-22): the four per-source sequences, the per-day base
-- table and orders.order_id with its global unique key.
-- NEVER run this against Supabase.

CREATE SEQUENCE public.order_number_seq_1 AS bigint;
CREATE SEQUENCE public.order_number_seq_2 AS bigint;
CREATE SEQUENCE public.order_number_seq_3 AS bigint;
CREATE SEQUENCE public.order_number_seq_4 AS bigint;

CREATE TABLE public.order_number_days (
    prefix     text PRIMARY KEY CHECK (prefix ~ '^[1-4][0-9]{6}$'),
    base       bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id text NOT NULL CONSTRAINT orders_order_id_key UNIQUE
);
