# CFC Pickleball League 🏓

A pickleball tournament hosting web app for **Christ Fellowship Church, Birmingham**. Built with Next.js, Supabase, and Tailwind CSS.

## Features

- **Player Registration** — Players create accounts and set their skill level by either picking a plain-language description ("Brand new", "Recreational", "Advanced", …) or entering a DUPR rating (2.0–5.0) if they know it
- **Tournament Management** — Admins create tournaments with format, date, location, and capacity
- **Single Elimination** — Standard knockout bracket with proper seeding and byes
- **Double Elimination** — Full WB/LB/Grand Finals structure with reset match support
- **Auto-Seeding** — Seeded automatically by skill level; admins can override
- **Live Scoring** — Admins enter scores; winners advance automatically through the bracket
- **Visual Brackets** — Clean horizontal bracket visualization for both formats
- **Role-Based Access** — Admin vs player permissions enforced via Supabase RLS

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
2. In the **SQL Editor**, run the full contents of `supabase/migrations/001_initial_schema.sql`

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

---

## Deploy to Vercel

1. Push this repo to GitHub
2. Import in [Vercel](https://vercel.com/new)
3. Add the three env vars in your Vercel project settings
4. Deploy

---

## Tournament Flow

1. **Admin** creates a tournament (single or double elimination, max players, date)
2. **Players** register via the tournament page
3. **Admin** opens the Admin Panel → optionally adjusts seeding → clicks **Generate Bracket**
4. Seeds 1–N are assigned by DUPR rating (highest = seed 1); byes go to top seeds
5. **Admin** clicks any ready match → enters scores → winner advances automatically
6. Double elimination: losers drop to the Losers Bracket; Grand Finals can have a Reset match

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
  api/
    tournaments/route.ts      # POST create tournament
    tournaments/[id]/register/route.ts   # Register/withdraw
    tournaments/[id]/bracket/generate/route.ts  # Generate bracket
    tournaments/[id]/seed/route.ts       # Update seeds
    matches/[matchId]/score/route.ts     # Enter match score
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
    scoring.ts                 # Score recording + winner advancement
  types/app.ts
```
