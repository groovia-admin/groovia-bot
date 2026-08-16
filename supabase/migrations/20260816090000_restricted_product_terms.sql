-- Platform-wide list of restricted product name keywords (e.g. tobacco,
-- alcohol, certain medicines) — managed only by Groovia super admins,
-- never by individual shop owners. A new product's name is checked
-- against this list (case-insensitive substring match) before it can
-- be created; a match blocks creation with a clear error instead of
-- silently allowing it.
CREATE TABLE IF NOT EXISTS public.restricted_product_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS restricted_product_terms_term_uq
  ON public.restricted_product_terms (lower(term));

ALTER TABLE public.restricted_product_terms ENABLE ROW LEVEL SECURITY;
-- No policies added — accessed only via the admin API routes using the
-- service-role key, same pattern as platform_admins and other
-- super-admin-only tables in this schema.
