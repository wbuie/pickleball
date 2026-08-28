-- 009: courts
-- Run this in the Supabase SQL Editor after 001–008.
--
-- An organizer says how many courts (or gym floors) the event has, and the app
-- hands each playable match a court number so players know where to go. Courts
-- are recycled automatically: as a match is scored, its court is offered to the
-- next match waiting to be played.

-- ============================================
-- How many courts this tournament runs on
-- ============================================
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS court_count INT NOT NULL DEFAULT 1
    CHECK (court_count >= 1 AND court_count <= 32);

-- ============================================
-- Which court a match is played on (NULL = not assigned / still queued)
-- ============================================
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS court INT CHECK (court >= 1);
