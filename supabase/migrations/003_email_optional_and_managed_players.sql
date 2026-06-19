-- Email-optional registration + admin-managed (roster-only) players
-- Run this in the Supabase SQL Editor after 001/002.
--
-- This migration adds two related capabilities:
--   1. A global, admin-controlled toggle for whether an email is required to
--      register (public self-signup).
--   2. "Managed" players — roster entries an admin can create directly (one at
--      a time or in bulk from a CSV) that are NOT backed by a Supabase auth
--      account. They have no email and cannot log in; they exist only so admins
--      can seed and run brackets for people who registered offline.

-- ============================================
-- APP SETTINGS (single row)
-- ============================================

CREATE TABLE public.app_settings (
  id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  require_email BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exactly one settings row.
INSERT INTO public.app_settings (id, require_email) VALUES (1, TRUE);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone may read settings (the registration form needs to know the rule).
CREATE POLICY "app_settings_select_all" ON public.app_settings FOR SELECT USING (TRUE);
-- Only admins may change them.
CREATE POLICY "app_settings_update_admin" ON public.app_settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- MANAGED PLAYERS (profiles without an auth account)
-- ============================================

-- Allow profile rows that are not tied to an auth.users row. Managed players
-- get a freshly generated id; auth-backed players keep id = auth.users.id.
-- NOTE: dropping this FK also drops the ON DELETE CASCADE from auth.users, so a
-- normal user's profile is no longer auto-removed when their auth account is
-- deleted. That is an acceptable trade-off for a small league roster.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.profiles ADD COLUMN is_managed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN email      TEXT;

-- Admins can create/update/remove any profile (needed for managed players).
-- Self-service insert/update policies from 001 still apply to normal users.
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE));
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE));
CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE));

-- Capture the email for auth-backed users going forward.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- ============================================
-- ADMIN-MANAGED TOURNAMENT REGISTRATION
-- ============================================

-- Admins can register any player (e.g. a managed/roster player) into a
-- tournament, not just themselves.
CREATE POLICY "registrations_insert_admin" ON public.tournament_registrations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
