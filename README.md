# OmniWell: your whole wellbeing in one place

> Formerly **Tidewell**, a water tracker. OmniWell keeps the water tracker and adds mood, meditation, sleep, weight and exercise, plus insights that connect them. Brand constants live in `apps/web/lib/brand.ts`.

A web water tracker built with Next.js 14 (App Router), Tailwind CSS, Framer Motion and Supabase. It includes auth with an avatar upload, a goal calculated from your profile, an animated glass that fills as you drink, streaks, logging for several drink types, and weekly stats.

## Setup (about 5 minutes)

1. **Create a Supabase project** at https://supabase.com.
2. **Run the schema.** Open SQL Editor, paste `supabase/schema.sql`, and click Run. It creates:
   - the `profiles` and `drink_logs` tables, with row-level security so users only see their own rows,
   - a trigger that creates a profile from sign-up data,
   - a `daily_totals()` function that groups totals by the user's own timezone (used for streaks),
   - a public `avatars` storage bucket where each user can only write to their own folder.
3. **Configure auth URLs.** Go to Authentication → URL Configuration. Set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to Redirect URLs. In production, use your real domain for both.
4. **Add environment variables:**
   ```bash
   cp apps/web/.env.local.example apps/web/.env.local   # paste your Project URL and anon key
   ```
5. **Run it** (pnpm 9; `corepack enable` provides it):
   ```bash
   pnpm install
   pnpm dev
   ```
   `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build` run across the workspace with Turborepo.

### Email confirmation

- **On (Supabase default):** sign-up shows a "Check your inbox" screen. The chosen avatar is kept in the browser and uploaded automatically on the first login.
- **Off** (Authentication → Providers → Email): users go straight to the dashboard and the avatar uploads right away. This is simpler for local development.

## How the goal is calculated (`packages/core/src/hydration.ts`)

```
base       = weight_kg × 33 ml
sex        = male +5%, female −5%, prefer not to say ±0
activity   = sitting +0, light +350, moderate +600, very active +900, athlete +1200 ml
goal       = round(base + sex + activity, to 50 ml), clamped to 1,200–5,000 ml
```

Users can override the result with a custom goal on the Profile page. All the constants are at the top of the file if you want to tune them.

### Hydration multipliers

| Drink | Multiplier |
|---|---|
| Water, sparkling, milk | 1.00 |
| Tea | 0.90 |
| Juice | 0.85 |
| Coffee | 0.80 |

Each log stores the volume and the multiplier used. The database computes `effective_ml` as a generated column, so changing a multiplier later won't rewrite past days.

## Project map

A pnpm + Turborepo monorepo:

```
apps/web/                          The OmniWell Next.js 14 app (App Router), private
  app/                             Routes: auth, dashboard, trackers, insights, messages, staff portals, cron
  components/OmniWellStorage.tsx   The trackers' data layer: server actions + Supabase
  components/MoodWithSupport.tsx   Mood tracker plus the crisis prompt
  lib/supabase/tables.ts           Which table and columns each tracker reads
packages/core/                     @omniwell/core: pure TypeScript, no React or I/O
  src/dates.ts                     Local-time day keys, week maths, streaks
  src/hydration.ts, mood.ts, …     Each tracker's model, constants and input validators
  src/storage.ts                   TrackerStorage: the interfaces trackers read and write through
packages/ui/                       @omniwell/ui: <TrackerStorageProvider>, error boundary, load/save hooks, profile inputs
packages/tracker-water/            @omniwell/tracker-water: glass, quick log, streaks, stats, garden
packages/tracker-mood/, -sleep/, -weight/, -exercise/, -meditation/, -bmi/
packages/trackers/                 @omniwell/trackers: re-exports ui and every tracker
packages/tailwind-preset/          @omniwell/tailwind-preset: --omni-* colour variables, omni-* component classes
supabase/                          SQL: schema, wellness, insights, notifications, messaging
```

Inside the workspace the packages resolve to their TypeScript source, which the app compiles
(`transpilePackages`). In a server component, import a tracker by file, e.g.
`@omniwell/tracker-water/WaterGarden`: importing a package root there bundles every component it exports.

## Using the trackers in another app

```bash
pnpm add @omniwell/tracker-mood @omniwell/ui framer-motion
pnpm add -D @omniwell/tailwind-preset
```

```tsx
import { TrackerStorageProvider, type TrackerStorage } from '@omniwell/ui'
import { MoodTracker } from '@omniwell/tracker-mood'

const storage: TrackerStorage = { /* your API: list, create and remove per tracker */ }

<TrackerStorageProvider storage={storage}>
  <MoodTracker />
</TrackerStorageProvider>
```

Styling needs Tailwind CSS 3: add the preset and let Tailwind scan the packages.

```js
// tailwind.config.js
module.exports = {
  presets: [require('@omniwell/tailwind-preset')],
  content: ['./src/**/*.{ts,tsx}', './node_modules/@omniwell/*/dist/*.mjs'],
}
```

Recolour by overriding the `--omni-*` variables (space-separated RGB, e.g. `--omni-ink: 15 47 55`).
The trackers run on React 18 and 19 and need `framer-motion` 11.

## Releasing packages

Add a changeset with each package change (`pnpm changeset`). To release: `pnpm version-packages`,
commit, then `pnpm release`, which builds every package (ESM, CommonJS and types, via tsup) and
publishes the new versions with restricted access. See `.changeset/README.md`.

## Notes

- Logging is optimistic: the glass fills immediately, then rolls back if the save fails.
- Streaks count consecutive goal days ending today, or ending yesterday if today's goal isn't met yet, so a streak doesn't break at breakfast. Past days are compared against your current goal.
- All animation respects `prefers-reduced-motion`.
- To deploy on Vercel, import the repo, set the project's Root Directory to `apps/web`, add the env vars, and update the Supabase URL settings to your domain.
