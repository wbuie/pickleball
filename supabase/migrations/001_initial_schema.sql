-- Pickleball Tournament App Schema
-- Run this in the Supabase SQL Editor

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  skill_level   NUMERIC(2,1) CHECK (skill_level >= 2.0 AND skill_level <= 5.0) DEFAULT 3.0,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.tournaments (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  format        TEXT NOT NULL DEFAULT 'single_elimination'
                  CHECK (format IN ('single_elimination', 'double_elimination')),
  status        TEXT NOT NULL DEFAULT 'registration'
                  CHECK (status IN ('registration', 'seeding', 'active', 'completed')),
  max_players   INT NOT NULL DEFAULT 16 CHECK (max_players >= 4 AND max_players <= 256),
  start_date    DATE,
  location      TEXT,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.tournament_registrations (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seed          INT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, player_id)
);

CREATE TABLE public.matches (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id         UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  bracket_type          TEXT NOT NULL DEFAULT 'winners'
                          CHECK (bracket_type IN ('winners', 'losers', 'grand_finals')),
  round                 INT NOT NULL,
  position              INT NOT NULL,
  player1_id            UUID REFERENCES public.profiles(id),
  player2_id            UUID REFERENCES public.profiles(id),
  player1_score         INT,
  player2_score         INT,
  winner_id             UUID REFERENCES public.profiles(id),
  loser_id              UUID REFERENCES public.profiles(id),
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'bye', 'in_progress', 'completed')),
  winner_next_match_id  UUID REFERENCES public.matches(id),
  loser_next_match_id   UUID REFERENCES public.matches(id),
  winner_next_slot      INT CHECK (winner_next_slot IN (1, 2)),
  loser_next_slot       INT CHECK (loser_next_slot IN (1, 2)),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, bracket_type, round, position)
);

CREATE INDEX idx_matches_tournament ON public.matches(tournament_id);
CREATE INDEX idx_registrations_tournament ON public.tournament_registrations(tournament_id);
CREATE INDEX idx_registrations_player ON public.tournament_registrations(player_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Tournaments
CREATE POLICY "tournaments_select_all" ON public.tournaments FOR SELECT USING (TRUE);
CREATE POLICY "tournaments_insert_admin" ON public.tournaments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "tournaments_update_admin" ON public.tournaments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Registrations
CREATE POLICY "registrations_select_all" ON public.tournament_registrations FOR SELECT USING (TRUE);
CREATE POLICY "registrations_insert_self" ON public.tournament_registrations FOR INSERT
  WITH CHECK (auth.uid() = player_id);
CREATE POLICY "registrations_delete_self_or_admin" ON public.tournament_registrations FOR DELETE
  USING (auth.uid() = player_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "registrations_update_admin" ON public.tournament_registrations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Matches (admin-only writes, public reads)
CREATE POLICY "matches_select_all" ON public.matches FOR SELECT USING (TRUE);
CREATE POLICY "matches_insert_admin" ON public.matches FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "matches_update_admin" ON public.matches FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update updated_at on tournament changes
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
