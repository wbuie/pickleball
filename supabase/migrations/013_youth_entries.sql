-- 013: Youth entries
-- Run this in the Supabase SQL Editor after 001–012.
--
-- Marks an entry — a singles player, a doubles team, a basketball roster — as
-- Youth for one tournament. It sits on the registration rather than the profile
-- on purpose: the same person can be a youth entry in the Saturday event and
-- play in the open event the next week, and a team is Youth as a team.
--
-- The tag does two things: it shows on the entry lists, and it steers seeding.
-- When the bracket is generated (or an organizer taps "Auto-seed by skill"),
-- youth entries are given seeds that face each other in round 1 wherever the
-- numbers allow, so a first game is youth-vs-youth rather than youth against
-- the strongest adult in the draw.
--
-- Off by default, so existing entries are unaffected.

ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS is_youth BOOLEAN NOT NULL DEFAULT FALSE;

-- No RLS change is needed: "registrations_update_admin" (001) already lets an
-- admin update entries in place, and that is the only way this flag is set.
