-- 007: admin email allowlist
-- Run this in the Supabase SQL Editor after 001–006.
--
-- Lets organizers grant admin by email — even before that person has signed up.
-- An email on the allowlist is promoted immediately if a matching profile
-- already exists, and is auto-granted admin the moment they register (via the
-- signup trigger below). This supersedes the single hardcoded admin in
-- migration 002.

-- ============================================
-- Allowlist table
-- ============================================
CREATE TABLE IF NOT EXISTS public.admin_emails (
  email      TEXT PRIMARY KEY,
  added_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

-- Only admins can see or manage the allowlist.
DROP POLICY IF EXISTS "admin_emails_select_admin" ON public.admin_emails;
CREATE POLICY "admin_emails_select_admin" ON public.admin_emails FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
DROP POLICY IF EXISTS "admin_emails_insert_admin" ON public.admin_emails;
CREATE POLICY "admin_emails_insert_admin" ON public.admin_emails FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
DROP POLICY IF EXISTS "admin_emails_delete_admin" ON public.admin_emails;
CREATE POLICY "admin_emails_delete_admin" ON public.admin_emails FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ============================================
-- Seed from existing admins (emails stored lowercased for case-insensitive match)
-- ============================================
INSERT INTO public.admin_emails (email) VALUES ('tale87@gmail.com')
  ON CONFLICT DO NOTHING;
INSERT INTO public.admin_emails (email)
  SELECT lower(email) FROM public.profiles WHERE is_admin = TRUE AND email IS NOT NULL
  ON CONFLICT DO NOTHING;

-- Promote any existing profile whose email is now on the allowlist.
UPDATE public.profiles p SET is_admin = TRUE
  WHERE p.email IS NOT NULL AND lower(p.email) IN (SELECT email FROM public.admin_emails);

-- ============================================
-- Auto-grant admin on signup from the allowlist.
-- Preserves the display_name/email/skill-capture behavior from migration 005 —
-- this must run after it.
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  meta_skill NUMERIC;
  is_allowlisted BOOLEAN;
BEGIN
  -- Parse + clamp the metadata skill level; fall back to 3.0 if absent/invalid.
  BEGIN
    meta_skill := (NEW.raw_user_meta_data->>'skill_level')::NUMERIC;
  EXCEPTION WHEN OTHERS THEN
    meta_skill := NULL;
  END;

  IF meta_skill IS NULL OR meta_skill < 2.0 OR meta_skill > 5.0 THEN
    meta_skill := 3.0;
  END IF;

  is_allowlisted := NEW.email IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.admin_emails WHERE email = lower(NEW.email));

  INSERT INTO public.profiles (id, display_name, email, skill_level, is_admin)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    meta_skill,
    is_allowlisted
  );
  RETURN NEW;
END;
$$;
