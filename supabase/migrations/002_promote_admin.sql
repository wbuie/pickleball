-- Promote specific users to admin
-- Run this in the Supabase SQL Editor.
--
-- NOTE: a profile row only exists after the person has signed up at least
-- once (the on_auth_user_created trigger creates it). If this updates 0 rows,
-- have the user register first, then re-run — this statement is idempotent and
-- safe to run repeatedly.

UPDATE public.profiles AS p
SET is_admin = TRUE
FROM auth.users AS u
WHERE u.id = p.id
  AND lower(u.email) = 'tale87@gmail.com';
