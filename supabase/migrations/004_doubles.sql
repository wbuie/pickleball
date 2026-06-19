-- 004: doubles support
-- Run this in the Supabase SQL Editor after 001–003.
--
-- A tournament is now either a singles or a doubles event. A registration row
-- represents an *entry* (a team): the captain (player_id) plus an optional
-- partner (partner_id). Singles entries simply leave partner_id null.
--
-- Matches reference the ENTRY (tournament_registrations.id) rather than an
-- individual profile, so the same bracket engine drives both formats. The new
-- foreign keys are added NOT VALID so this migration never fails on any legacy
-- bracket rows; regenerate any pre-existing brackets after running it.

-- ============================================
-- Tournament event type
-- ============================================
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'singles'
    CHECK (event_type IN ('singles', 'doubles'));

-- ============================================
-- Doubles partner on an entry
-- ============================================
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- A captain can edit their own entry (e.g. set/change their partner) before the
-- bracket is generated. (Admins already have a broad update policy.)
DROP POLICY IF EXISTS "registrations_update_own" ON public.tournament_registrations;
CREATE POLICY "registrations_update_own" ON public.tournament_registrations FOR UPDATE
  USING (auth.uid() = player_id);

-- Either teammate can withdraw the team (the existing delete policy already
-- covers the captain + admins; this adds the partner).
DROP POLICY IF EXISTS "registrations_delete_partner" ON public.tournament_registrations;
CREATE POLICY "registrations_delete_partner" ON public.tournament_registrations FOR DELETE
  USING (auth.uid() = partner_id);

-- ============================================
-- Point match slots at entries (teams) instead of profiles
-- ============================================
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_player1_id_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_player2_id_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_winner_id_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_loser_id_fkey;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_player1_id_fkey FOREIGN KEY (player1_id)
    REFERENCES public.tournament_registrations(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_player2_id_fkey FOREIGN KEY (player2_id)
    REFERENCES public.tournament_registrations(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_winner_id_fkey FOREIGN KEY (winner_id)
    REFERENCES public.tournament_registrations(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_loser_id_fkey FOREIGN KEY (loser_id)
    REFERENCES public.tournament_registrations(id) ON DELETE SET NULL NOT VALID;
