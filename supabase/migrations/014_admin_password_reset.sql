-- 014: Reset the admin password for tale87@gmail.com
-- Run this in the Supabase SQL Editor (one-off maintenance — not part of the
-- schema, and safe to re-run).
--
-- Passwords are not stored in this app. Login goes through Supabase Auth
-- (`signInWithPassword` in components/auth/LoginForm.tsx), which checks the
-- bcrypt hash in auth.users.encrypted_password. That is the only place a
-- password can be set, so it is set here rather than in application code.
--
-- Besides the password, this clears the two other things that make a correct
-- password still get rejected: an unconfirmed email address and an active ban.
-- It also makes sure the profile row actually carries is_admin.
--
-- SECURITY: this puts a known password on a live admin account, and the
-- password is written in plaintext in this file and in your git history.
-- Sign in and change it (Account → password, or the "Forgot password?" flow),
-- then treat `Admin123` as burned.

SET search_path = public, extensions;

DO $$
DECLARE
  target_email CONSTANT TEXT := 'tale87@gmail.com';
  new_password CONSTANT TEXT := 'Admin123';
  target_id    UUID;
BEGIN
  SELECT id INTO target_id
    FROM auth.users
   WHERE lower(email) = target_email;

  IF target_id IS NULL THEN
    RAISE NOTICE
      'No auth user for %. Nothing was changed. Register that address at /auth/register first, then re-run this file — the 007 allowlist grants it admin automatically on signup.',
      target_email;
    RETURN;
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(new_password, gen_salt('bf')),
         -- An unconfirmed address makes Supabase reject a correct password
         -- with "Email not confirmed".
         email_confirmed_at  = COALESCE(email_confirmed_at, NOW()),
         banned_until        = NULL,
         updated_at          = NOW()
   WHERE id = target_id;

  -- The allowlist from 007 only grants admin at signup, so an account that
  -- predates it can be a confirmed user with is_admin = FALSE.
  INSERT INTO public.admin_emails (email) VALUES (target_email)
    ON CONFLICT DO NOTHING;

  UPDATE public.profiles
     SET is_admin = TRUE
   WHERE id = target_id;

  RAISE NOTICE 'Password reset for % (%). Sign in, then change it.', target_email, target_id;
END $$;
