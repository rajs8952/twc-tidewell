import { ArrowRight, Lock, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { BrandBackdrop } from './BrandBackdrop'
import { InsightCard } from './insights/InsightCard'
import { Logo, LogoMark } from './Logo'
import { BRAND, PILLAR_COLORS, PILLAR_ORDER } from '@/lib/brand'
import type { Headline } from '@/lib/insights/headline'
import { BMI_TOOL, TRACKERS, type TrackerId } from '@/lib/trackers'

/** One concrete line per pillar for the feature grid. */
const HIGHLIGHTS: Record<TrackerId, string> = {
  water: 'A glass that fills as you drink, with streaks and a garden that grows with you.',
  mood: 'Five-face check-ins with energy, stress and the feelings behind them.',
  meditation: 'A guided breathing timer, or log a session you did elsewhere.',
  sleep: 'Bedtime, wake time and how well you slept, against a 7–9 hour guide.',
  weight: 'A calm trend line over weeks, in kg or lb.',
  exercise: 'Nine activities, with calories estimated from your weight.',
}

/** A sample finding, rendered with the real insight card. */
const SAMPLE: Headline = {
  kind: 'finding',
  id: 'water-next-sleep',
  icon: 'water-sleep',
  text: 'When you hit your water goal, you sleep 45 minutes longer that night.',
  detail: 'Strong link · based on 24 days',
  rho: null,
  n: 24,
  comparison: {
    outcome: 'sleep',
    outcomeLabel: 'Avg sleep',
    better: 0,
    groups: [
      { label: 'Days ≥ 3 L water', value: 440, display: '7h 20m', days: 13 },
      { label: 'Days < 3 L water', value: 395, display: '6h 35m', days: 11 },
    ],
  },
}

/** The six pillars circling the mark. */
function PillarOrbit() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[22rem] sm:max-w-md">
      <div className="absolute inset-[18%] rounded-full bg-white/70 shadow-[0_30px_80px_-30px_rgba(15,47,55,0.35)] ring-1 ring-line" />
      <div className="absolute inset-[30%] flex items-center justify-center rounded-full bg-white ring-1 ring-line">
        <LogoMark className="h-1/2 w-1/2" />
      </div>
      {TRACKERS.map((t, i) => {
        const Icon = t.icon
        const angle = (i / TRACKERS.length) * Math.PI * 2 - Math.PI / 2
        return (
          <div
            key={t.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
            style={{ left: `${50 + Math.cos(angle) * 40}%`, top: `${50 + Math.sin(angle) * 40}%` }}
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg sm:h-14 sm:w-14"
              style={{ background: t.accent, boxShadow: `0 12px 24px -10px ${t.accent}` }}
            >
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-bold text-ink ring-1 ring-line">{t.name}</span>
          </div>
        )
      })}
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-mist">
      <div className="bg-brand-gradient h-1.5 w-full" aria-hidden />

      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="rounded-xl" aria-label={`${BRAND.name} home`}>
          <Logo />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2 sm:gap-3">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-bold text-ink hover:bg-white/70">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary px-4 py-2.5">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <BrandBackdrop />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-12">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-bold ring-1 ring-line backdrop-blur">
                <span className="flex -space-x-1" aria-hidden>
                  {PILLAR_ORDER.map((k) => (
                    <span key={k} className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: PILLAR_COLORS[k] }} />
                  ))}
                </span>
                Six habits. One calm place.
              </p>
              <h1 className="mt-5 text-[2.6rem] font-extrabold leading-[1.04] sm:text-6xl">
                Your whole wellbeing, <span className="text-brand-gradient">in one place.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted">{BRAND.description}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="btn-primary px-6 py-3.5 text-base">
                  Create your free account <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href="/login" className="btn-secondary px-6 py-3.5 text-base">
                  Log in
                </Link>
              </div>
              <p className="mt-5 flex items-center gap-2 text-sm text-muted">
                <Lock className="h-4 w-4" aria-hidden /> Private by default. Only you can see your entries.
              </p>
            </div>
            <div>
              <PillarOrbit />
              <p className="mx-auto mt-2 flex w-fit items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-bold ring-1 ring-line backdrop-blur">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg text-white" style={{ background: BMI_TOOL.accent }}>
                  <BMI_TOOL.icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                Plus a BMI calculator
              </p>
            </div>
          </div>
        </section>

        {/* Feature grid: the six trackers */}
        <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="max-w-2xl">
            <h2 id="features-title" className="text-3xl font-extrabold sm:text-4xl">
              Six trackers that work together
            </h2>
            <p className="mt-3 text-lg text-muted">Each one takes seconds to log. Together they show you the bigger picture. And a BMI calculator when you want to check where you stand.</p>
          </div>
          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRACKERS.map((t) => {
              const Icon = t.icon
              return (
                <li key={t.id} className="relative overflow-hidden rounded-3xl bg-white p-6 ring-1 ring-line">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: t.accent }} aria-hidden />
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ background: `${t.accent}1A`, color: t.accent }}
                  >
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-xl font-bold">{t.name}</h3>
                  <p className="mt-1 font-semibold text-ink/80">{t.description}</p>
                  <p className="mt-2 text-sm text-muted">{HIGHLIGHTS[t.id]}</p>
                </li>
              )
            })}
          </ul>

          {/* The BMI calculator: a tool, not a daily tracker, so it sits under the six. */}
          <div className="relative mt-4 grid gap-5 overflow-hidden rounded-3xl bg-white p-6 ring-1 ring-line sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: BMI_TOOL.accent }} aria-hidden />
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${BMI_TOOL.accent}1A`, color: BMI_TOOL.accent }}>
              <BMI_TOOL.icon className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h3 className="text-xl font-bold">{BMI_TOOL.name}</h3>
              <p className="mt-1 font-semibold text-ink/80">{BMI_TOOL.description}</p>
              <p className="mt-2 text-sm text-muted">
                Filled in from your profile, with the healthy weight range for your height. Try other numbers safely; nothing changes until you save. A rough guide, so a
                dietitian is a message away for a proper check.
              </p>
            </div>
            {/* A sample reading, like the one in the app. */}
            <div className="rounded-2xl bg-mist px-4 py-3 ring-1 ring-line sm:w-56" aria-label="Example BMI reading">
              <p className="flex items-baseline justify-between text-sm font-bold">
                Body-mass index <span className="text-2xl font-extrabold tabular-nums">22.4</span>
              </p>
              <div className="relative mt-2 h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#7FB6E6 0 17.5%,#5CC79A 17.5% 50%,#F2C14E 50% 75%,#EF8A5B 75%)' }}>
                <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-white" style={{ left: '37%' }} />
              </div>
              <p className="mt-2 text-xs font-semibold text-[#1E7A52]">In the healthy range</p>
            </div>
          </div>
        </section>

        {/* Insights */}
        <section aria-labelledby="insights-title" className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 lg:pb-24">
          <div className="grid items-center gap-10 rounded-[2rem] bg-white/60 p-6 ring-1 ring-line sm:p-10 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6A55C9]">
                <Sparkles className="h-4 w-4" aria-hidden /> Insights
              </p>
              <h2 id="insights-title" className="mt-2 text-3xl font-extrabold sm:text-4xl">
                See how your habits connect
              </h2>
              <p className="mt-3 text-lg text-muted">
                After a week of logging, {BRAND.name} looks for patterns across your trackers and explains them in plain words. No charts to
                decode, no statistics to interpret.
              </p>
              <ul className="mt-6 space-y-2 text-ink/80">
                <li>• Does more water mean better sleep?</li>
                <li>• Do longer nights lift your mood the next day?</li>
                <li>• Explore any two habits side by side, whenever you want the detail.</li>
              </ul>
            </div>
            <div aria-label="Example insight">
              <InsightCard headline={SAMPLE} />
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#13263B] px-6 py-12 text-center text-white sm:px-12">
            <BrandBackdrop tone="deep" />
            <div className="relative">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Start with one habit. See the whole picture.</h2>
              <p className="mx-auto mt-3 max-w-xl text-white/80">Free to use. Set up in about a minute.</p>
              <Link href="/signup" className="btn mt-8 bg-white px-6 py-3.5 text-base text-ink hover:bg-white/90">
                Create your free account <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-line px-5 py-8 text-sm text-muted sm:flex-row sm:px-8">
        <Logo className="text-base" />
        <p>
          © {new Date().getFullYear()} {BRAND.name}
        </p>
        <nav aria-label="Footer" className="flex gap-4 font-semibold">
          <Link href="/login" className="hover:text-ink">
            Log in
          </Link>
          <Link href="/signup" className="hover:text-ink">
            Create account
          </Link>
        </nav>
      </footer>
    </div>
  )
}
