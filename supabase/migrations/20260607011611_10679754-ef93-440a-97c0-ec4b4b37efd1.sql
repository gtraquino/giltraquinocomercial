ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hero_title text,
  ADD COLUMN IF NOT EXISTS opening_time text,
  ADD COLUMN IF NOT EXISTS closing_time text;