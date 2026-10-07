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
  lib/wellness-team.ts             The company's EAP, therapist and dietitian contacts
packages/core/                     @rajs8952/core: dates, streaks, each tracker's model and validators, storage interfaces
packages/storage/                  @rajs8952/storage: memory, localStorage and REST adapters; Supabase on /supabase
packages/interventions/            @rajs8952/interventions: turns a logged metric into a nudge or crisis prompt
packages/ui/                       @rajs8952/ui: storage provider, CompletionRing, StreakCard, profile inputs, hooks
packages/tracker-water/            @rajs8952/tracker-water: glass, quick log, streaks, stats, garden
packages/tracker-mood/, -sleep/, -weight/, -exercise/, -meditation/, -bmi/
packages/trackers/                 @rajs8952/trackers: every tracker, plus the registry and Hub summaries
packages/config-tailwind/          @rajs8952/config-tailwind: --omni-* colour variables, omni-* component classes
packages/config-typescript/        Shared tsconfig bases (private)
packages/config-eslint/            Shared ESLint configs (private)
supabase/                          SQL: schema, wellness, insights, notifications, messaging
```

Inside the workspace the packages resolve to their TypeScript source, which the app compiles
(`transpilePackages`). In a server component, import a tracker by file, e.g.
`@rajs8952/tracker-water/WaterGarden`: importing a package root there bundles every component it exports.

## Using the trackers in another app

```bash
pnpm add @rajs8952/tracker-mood @rajs8952/ui @rajs8952/storage framer-motion
pnpm add -D @rajs8952/config-tailwind
```

Each tracker reads and writes through a storage adapter. Pass one to a single tracker:

```tsx
import { createLocalStorage } from '@rajs8952/storage'
import { MoodTracker } from '@rajs8952/tracker-mood'

const storage = createLocalStorage() // saved in this browser

<MoodTracker adapter={storage.mood} />
```

or give every tracker below a provider the same storage:

```tsx
import { TrackerStorageProvider } from '@rajs8952/ui'

<TrackerStorageProvider storage={storage}>…</TrackerStorageProvider>
```

`@rajs8952/storage` has `createMemoryStorage` (demos and tests), `createLocalStorage`,
`createRestStorage` (your own API; the routes are listed in `packages/storage/src/rest.ts`) and,
on `@rajs8952/storage/supabase`, `createSupabaseStorage` for the OmniWell database schema.
Anything that implements `TrackerStorage` (exported by `@rajs8952/ui`) works too.

Styling needs Tailwind CSS 3: add the preset and let Tailwind scan the packages.

```js
// tailwind.config.js
module.exports = {
  presets: [require('@rajs8952/config-tailwind')],
  content: ['./src/**/*.{ts,tsx}', './node_modules/@rajs8952/*/dist/*.mjs'],
}
```

Recolour by overriding the `--omni-*` variables (space-separated RGB, e.g. `--omni-ink: 15 47 55`).
The trackers run on React 18 and 19 and need `framer-motion` 11.

## Releasing packages

Packages publish to GitHub Packages under `@rajs8952`, linked to this repo.

1. **One-time setup.** Create a GitHub personal access token (classic) with `write:packages`
   and add it to `~/.npmrc` in your home folder (the repo ignores `.npmrc` files so tokens can't be committed):
   ```
   //npm.pkg.github.com/:_authToken=YOUR_TOKEN
   ```
2. **With each package change,** add a changeset: `pnpm changeset`, pick the packages and the bump.
3. **To release:** `pnpm version-packages`, commit, then `pnpm release`. It builds every package
   (ESM, CommonJS, types and sourcemaps via tsup) and publishes the new versions. See `.changeset/README.md`.

### Installing in another app

GitHub's registry needs a token even for public packages (`read:packages` is enough). In the app:

```
# .npmrc
@rajs8952:registry=https://npm.pkg.github.com
```

with the token in `~/.npmrc` as above (or `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` in CI).

## Notes

- Logging is optimistic: the glass fills immediately, then rolls back if the save fails.
- Streaks count consecutive goal days ending today, or ending yesterday if today's goal isn't met yet, so a streak doesn't break at breakfast. Past days are compared against your current goal.
- All animation respects `prefers-reduced-motion`.
- To deploy on Vercel, import the repo, set the project's Root Directory to `apps/web`, add the env vars, and update the Supabase URL settings to your domain.
