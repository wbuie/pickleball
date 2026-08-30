-- 012: let admins delete a tournament
-- Run this in the Supabase SQL Editor after 001–011.
--
-- Until now a tournament could only ever be created and edited. There was no
-- way to take one back out — a duplicate created by mistake, a test event, or
-- one that was called off sat on the tournament list forever, because status
-- only ever moves forward and only reaches 'completed' by playing the final.
--
-- Deleting cascades: tournament_registrations and matches both reference
-- tournaments ON DELETE CASCADE, and registration_members cascades from
-- registrations, so removing the tournament row takes its entries, teams,
-- brackets and scores with it. There is no undo.
--
-- Writes go through the server's API route, which checks is_admin before it
-- deletes; this policy is what actually permits the delete at the database
-- level (the server's Supabase client still carries the signed-in admin's JWT,
-- so RLS applies to it too — without a policy the delete would silently match
-- zero rows).

DROP POLICY IF EXISTS "tournaments_delete_admin" ON public.tournaments;

CREATE POLICY "tournaments_delete_admin" ON public.tournaments FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
