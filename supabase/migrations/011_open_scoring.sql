-- 011: open score reporting
-- Run this in the Supabase SQL Editor after 001–010.
--
-- Normally only an organizer can enter a score. Some events would rather let
-- the players do it themselves — nobody has to hunt down the person with the
-- laptop, and the bracket keeps moving. This flag turns that on for a single
-- tournament: with it set, anyone looking at the tournament page can report the
-- result of a match that hasn't been played yet, signed in or not. Correcting a
-- score that's already final stays with the organizers either way.
--
-- Off by default, so existing tournaments keep the sign-in gate.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS open_scoring BOOLEAN NOT NULL DEFAULT FALSE;

-- No RLS change is needed: score writes already go through the server's
-- service-role client after the API route decides who's allowed, and this flag
-- is what that decision now reads. Direct table writes stay admin-only.
