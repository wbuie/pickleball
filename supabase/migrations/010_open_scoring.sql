-- 010: open scoring
-- Run this in the Supabase SQL Editor after 001–009.
--
-- An organizer can hand scoring over to the players: with open scoring on,
-- anyone looking at the tournament page can enter the score for a match that
-- hasn't been scored yet. Correcting an already-completed score stays with
-- admins, so a bad entry can't be quietly rewritten by the next passer-by.
--
-- Scores are written by the API route with the service role (see
-- app/api/matches/[matchId]/score), which is where the permission check lives —
-- the admin-only RLS policy on public.matches deliberately stays as it is, so
-- direct client writes are still admin-only.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS open_scoring BOOLEAN NOT NULL DEFAULT FALSE;
