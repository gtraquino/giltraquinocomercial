ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS nif text,
  ADD COLUMN IF NOT EXISTS address text;