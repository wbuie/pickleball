-- 006: multi-sport support (basketball)
-- Run this in the Supabase SQL Editor after 001–005.
--
-- A tournament now belongs to a sport. Pickleball keeps its singles/doubles
-- events; basketball events are team events (3v3, 4v4, 5v5). A basketball
-- entry is a named team: the captain (player_id) plus teammates in the new
-- registration_members table. Matches keep referencing the entry
-- (tournament_registrations.id), so the bracket engine is unchanged.

-- ============================================
-- Tournament sport + team event types
-- ============================================
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'pickleball'
    CHECK (sport IN ('pickleball', 'basketball'));

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_event_type_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_event_type_check
    CHECK (event_type IN ('singles', 'doubles', '3v3', '4v4', '5v5'));

-- ============================================
-- Team name on an entry (team events only)
-- ============================================
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS team_name TEXT;

-- ============================================
-- Team rosters: members beyond the captain
-- ============================================
CREATE TABLE IF NOT EXISTS public.registration_members (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES public.tournament_registrations(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (registration_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_members_registration ON public.registration_members(registration_id);
CREATE INDEX IF NOT EXISTS idx_members_player ON public.registration_members(player_id);

ALTER TABLE public.registration_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select_all" ON public.registration_members;
CREATE POLICY "members_select_all" ON public.registration_members FOR SELECT USING (TRUE);

-- The team captain (or an admin) manages the roster.
DROP POLICY IF EXISTS "members_insert_captain_or_admin" ON public.registration_members;
CREATE POLICY "members_insert_captain_or_admin" ON public.registration_members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tournament_registrations r
            WHERE r.id = registration_id AND r.player_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- A member can leave the team themselves; the captain and admins can remove anyone.
DROP POLICY IF EXISTS "members_delete_self_captain_or_admin" ON public.registration_members;
CREATE POLICY "members_delete_self_captain_or_admin" ON public.registration_members FOR DELETE
  USING (
    player_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.tournament_registrations r
               WHERE r.id = registration_id AND r.player_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );
