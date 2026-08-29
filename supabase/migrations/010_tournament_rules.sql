-- 010: tournament rules & regulations
-- Run this in the Supabase SQL Editor after 001–009.
--
-- Organizers post the rules for an event (scoring, serving, line calls,
-- conduct, …) and players read them on the tournament page. It's free text so
-- every event can say exactly how it plays; NULL/empty means "no rules posted
-- yet" and the section stays hidden for players.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS rules TEXT;
