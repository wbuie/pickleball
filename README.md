# CFC Sports Tournaments 🏓🏀

A tournament hosting web app for **Christ Fellowship Church, Birmingham**. Built with Next.js, Supabase, and Tailwind CSS.

## Features

- **Multiple Sports** — Each tournament picks a sport and an event. **Pickleball** runs singles and doubles; **basketball** runs 3v3, 4v4, and 5v5. The bracket engine is sport-agnostic (it works on entries), so adding another sport/event is a matter of extending the `Sport`/`EventType` tables in `lib/types/app.ts`
- **Singles & Doubles (pickleball)** — Doubles entries are two-player teams: a player can pick their partner when registering, or an organizer can pair players on the admin panel. Teams are seeded by their average skill
- **Team events (basketball)** — 3v3/4v4/5v5 entries are named teams with a captain and a roster. A captain names the team and picks teammates when registering, or an organizer creates teams and fills rosters on the admin panel. Teams are seeded by their roster's average skill
- **Entry list edits** — Until the bracket is generated an organizer can reshape the field from the admin panel: add a player, pair or unpair a doubles team, fill a roster, and remove anyone — a whole entry, or one player out of a team (their partner stays in as a solo entry and keeps the seed). Changes show up on the panel as they're made, without waiting on a reload
- **Player Registration** — Players create accounts and set their skill level by either picking a plain-language description ("Brand new", "Recreational", "Advanced", …) or entering a DUPR rating (2.0–5.0) if they know it
- **Password reset** — A self-serve "Forgot password?" flow: players request a reset email, click the link, and set a new password (Supabase Auth recovery; the link routes through `/auth/callback` → `/auth/reset`)
- **Tournament Management** — Admins create tournaments with format, date, location, and capacity
- **Single Elimination** — Standard knockout bracket with proper seeding and byes
- **Double Elimination** — Full WB/LB/Grand Finals structure with reset match support
- **Per-sport ratings** — Players carry a pickleball DUPR rating (2.0–5.0) and a separate basketball tier (1–5). Brackets seed by the rating for that tournament's sport
- **Admins by email** — Organizers grant admin access by email from the League Admin page; a matching account is promoted immediately, and unregistered emails are auto-granted admin when they sign up
- **Auto-Seeding** — Seeded automatically by skill level; admins can override
- **Courts** — An organizer says how many courts the event runs on, and every match that's ready to play is handed a court number. Courts recycle themselves: entering a score frees that court for the next match in line, and players see an "On the courts" board (plus a "You're up on Court 3" callout) on the tournament page. Court count can change mid-event, and an admin can move any match to a specific court
- **Rules & regulations** — Every tournament has a rules section on its page: scoring, serving, line calls, conduct — whatever the organizer posts. It's plain text (short lines become headings, `-`/numbered lines become lists), and the create/edit form can start an organizer off with the standard rules for that sport. Leave it empty and the section stays hidden from players
- **Printable QR sign** — Every tournament gets a QR code pointing at its page. Organizers find it on the tournament's edit screen and can print a full-sheet sign (name, date, location, big code) to tape up at the check-in table, or download the bare code as PNG/SVG for a flyer or slide. The same code carries the event from sign-ups through live scores
- **Live Scoring** — Admins enter scores; winners advance automatically through the bracket, and the bracket updates in real time for spectators (Supabase Realtime) without refreshing
- **Open score reporting** — Per tournament, an organizer can drop the sign-in gate so anyone on the tournament page reports scores themselves: they tap their court, type the score, and the bracket moves — no account, no organizer standing there. Off by default, flipped from the Admin Panel (or the create/edit form) at any point in the event. Correcting a score that's already final stays with the organizers either way
- **Editable Results** — Admins can correct a completed match; if the result hasn't already cascaded into a played match, the change re-propagates automatically
- **Visual Brackets** — Clean horizontal bracket visualization for both formats
- **Role-Based Access** — Admin vs player permissions enforced via Supabase RLS (the admin panel is also guarded server-side)

## Tech Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS v4
- **Database + Auth:** Supabase (PostgreSQL + Row Level Security)
- **Deployment:** Vercel + Supabase

---

## Theming / Brand Colors

All brand colors and fonts live in **one place**: the `@theme` block at the top of
`app/globals.css`. The palette is pulled straight from Christ Fellowship Church's site
(cfcbirmingham.org): primary **teal `#459db9`** (`--color-brand-*`) with a **bright cyan
`#92eaf6`** accent (`--color-accent-*`), on a charcoal `#252E32` foreground. Headings use
**DM Serif Text** (the church's display face) and body copy uses **Mulish** (a clean
geometric stand-in for the site's "Soleil"). Every page, button, and bracket references
these tokens, so re-skinning the whole app means editing only this one file.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a project
2. In the **SQL Editor**, run each file in `supabase/migrations/` in order:
   - `001_initial_schema.sql` — tables, RLS, and triggers
   - `002_promote_admin.sql` — promote a specific email to admin (edit the address first)
   - `003_email_optional_and_managed_players.sql` — admin email-optional toggle + roster-only (managed) players
   - `004_doubles.sql` — doubles support (event type, team partner, entry-based matches). Regenerate any pre-existing brackets after applying it
   - `005_signup_skill_and_realtime.sql` — capture skill level (and email) at signup + enable realtime brackets
   - `006_basketball.sql` — multi-sport support: `sport` column, 3v3/4v4/5v5 event types, team names, and team rosters (`registration_members`)
   - `007_admin_email_allowlist.sql` — `admin_emails` allowlist so organizers can grant admin by email (promotes existing accounts and auto-grants on signup)
   - `008_basketball_rating.sql` — per-player `basketball_skill_level` (1–5 tiers) used to seed basketball tournaments
   - `009_courts.sql` — courts: `tournaments.court_count` and `matches.court`, so matches get a court number players can look up
   - `010_tournament_rules.sql` — `tournaments.rules`, the free-text rules & regulations shown on the tournament page
   - `011_open_scoring.sql` — `tournaments.open_scoring`, the per-tournament switch that lets anyone (not just organizers) report match scores

### 3. Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase project credentials (found under **Settings → API**):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. Create an Admin User

1. Register an account through the app
2. In Supabase **Table Editor → profiles**, set `is_admin = true` for your user

### 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 6. Run Tests

The bracket math (seeding, generation, scoring/advancement) is covered by unit tests:

```bash
npm test
```

---

## Deploy to Vercel

1. Push this repo to GitHub
2. Import in [Vercel](https://vercel.com/new)
3. Add the three env vars in your Vercel project settings
4. Deploy

---

## Tournament Flow

1. **Admin** creates a tournament (single or double elimination, max players, courts, date)
2. **Players** register via the tournament page
3. **Admin** opens the Admin Panel → optionally adjusts seeding → clicks **Generate Bracket**
4. Seeds 1–N are assigned by DUPR rating (highest = seed 1); byes go to top seeds
5. Every match that's ready to play is given a court (1…court count); the rest wait in line
6. **Admin** clicks any ready match → enters scores → winner advances automatically, and the court passes to the next match. With **open score reporting** on for the tournament, players do this themselves from their court tile — signed in or not
7. Double elimination: losers drop to the Losers Bracket; Grand Finals can have a Reset match

---

## Project Structure

```
app/
  page.tsx                    # Landing page
  tournaments/
    page.tsx                  # Tournament listing
    new/page.tsx              # Create tournament (admin)
    [id]/page.tsx             # Tournament detail + bracket
    [id]/admin/page.tsx       # Admin panel (seed, generate, score)
    [id]/qr/page.tsx          # Printable QR sign for the tournament
  api/
    tournaments/route.ts      # POST create tournament
    tournaments/[id]/register/route.ts   # Register/withdraw
    tournaments/[id]/registrations/route.ts  # Remove an entry, or one player in it
    tournaments/[id]/bracket/generate/route.ts  # Generate bracket
    tournaments/[id]/seed/route.ts       # Update seeds
    matches/[matchId]/score/route.ts     # Enter match score
    matches/[matchId]/court/route.ts     # Move a match to a specific court
  auth/
    login/page.tsx
    register/page.tsx
    callback/route.ts

components/
  Navigation.tsx
  bracket/BracketViewer.tsx          # Chooses SE vs DE renderer
  bracket/SingleEliminationBracket.tsx
  bracket/DoubleEliminationBracket.tsx
  bracket/MatchCard.tsx
  admin/ScoreModal.tsx
  tournaments/CourtBoard.tsx         # "Where do I play?" — one tile per court
  tournaments/TournamentRules.tsx    # Rules & regulations card on the tournament page
  tournaments/TournamentQrCode.tsx   # QR code + copy/print/download controls
  tournaments/TournamentCard.tsx
  tournaments/RegisterButton.tsx
  auth/LoginForm.tsx
  auth/RegisterForm.tsx
  ui/Badge.tsx

lib/
  supabase/client.ts    # Browser client
  supabase/server.ts    # Server + admin clients
  bracket/
    utils.ts                   # nextPowerOf2, getSeedOrder, grouping
    singleElimination.ts       # SE bracket generation
    doubleElimination.ts       # DE bracket generation
    courts.ts                  # Court assignment + recycling
    scoring.ts                 # Score recording + winner advancement
  types/app.ts
  rules.ts              # Parses an organizer's plain-text rules into blocks
  scoreAccess.ts        # Who may report or correct a score (organizers vs. open scoring)
  url.ts                # displayUrl (client-safe)
  url.server.ts         # absoluteUrl — builds the shareable link from the request
```

### Optional environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Pins the canonical origin used for QR codes and share links. Leave it unset to derive the origin from each request (correct on localhost, previews, and production alike); set it when a proxy rewrites the `Host` header, or to make preview deploys point at production. |
