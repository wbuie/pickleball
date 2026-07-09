-- 008: basketball skill rating
-- Run this in the Supabase SQL Editor after 001–007.
--
-- Pickleball uses a DUPR rating (2.0–5.0) in `skill_level`. Basketball uses its
-- own 1–5 tier rating (Beginner → Elite) stored here. It's nullable so existing
-- players read as "Unrated" until an organizer sets it. Basketball tournaments
-- seed teams by the roster's average basketball rating.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS basketball_skill_level NUMERIC(2,1)
    CHECK (basketball_skill_level >= 1.0 AND basketball_skill_level <= 5.0);
