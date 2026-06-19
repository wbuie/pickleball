-- 005: capture skill level at signup + enable realtime brackets
-- Run this in the Supabase SQL Editor after 001–004.

-- ============================================
-- Seed skill_level (and email) from signup metadata
-- ------------------------------------------------------------
-- The registration form sends `skill_level` (and `display_name`) in the user's
-- auth metadata. Previously only display_name was read here and the client
-- patched skill_level afterwards — which silently failed whenever email
-- confirmation was enabled (no session = RLS update blocked). Reading it in the
-- trigger makes the profile correct the moment the account is created.
--
-- This supersedes the handle_new_user defined in migration 003 (which captured
-- display_name + email): the version below keeps the email capture AND adds the
-- skill level, so it must run after 003.
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  meta_skill NUMERIC;
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

  INSERT INTO public.profiles (id, display_name, email, skill_level)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    meta_skill
  );
  RETURN NEW;
END;
$$;

-- ============================================
-- Enable realtime on matches so spectators see live score updates
-- without refreshing. Guarded so re-running is safe.
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
  END IF;
END $$;
