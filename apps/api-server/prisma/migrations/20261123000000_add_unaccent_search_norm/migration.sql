-- Enable unaccent extension for accent-insensitive Vietnamese full-text search
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Immutable search normalization function: removes Vietnamese diacritics, folds đ->d, lowercases, and folds y->i
-- NOTE: Does NOT alter MDM `normalized_name` deduplication column (Hard Invariant 7).
CREATE OR REPLACE FUNCTION f_search_norm(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT translate(
    lower(unaccent(replace(replace(coalesce(input, ''), 'đ', 'd'), 'Đ', 'd'))),
    'y',
    'i'
  );
$$;
