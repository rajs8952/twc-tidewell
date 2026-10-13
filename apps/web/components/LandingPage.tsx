import { ArrowRight, BarChart3, BookOpen, Building2, CalendarRange, Check, Crown, EyeOff, Flame, Lightbulb, Lock, MessageCircleHeart, ShieldAlert, Sparkles, Target, Zap } from 'lucide-react'
import Link from 'next/link'
import { BrandBackdrop } from './BrandBackdrop'
import { InsightCard } from './insights/InsightCard'
import { Logo, LogoMark } from './Logo'
import { BRAND, PILLAR_COLORS, PILLAR_ORDER } from '@/lib/brand'
import type { Headline } from '@/lib/insights/headline'
import { FREE_FEATURES, PREMIUM_FEATURES, PRICES, TRIAL_DAYS } from '@/lib/plans'
import { BMI_TOOL, TRACKERS, type TrackerId } from '@/lib/trackers'

/** One concrete line per pillar for the feature grid. */
const HIGHLIGHTS: Record<TrackerId, string> = {
  water: 'A glass that fills as you drink, one-tap +250 ml from Home, and a garden that grows with your streak.',
  mood: 'Five-face check-ins with energy, stress and the feelings behind them, right from Home.',
  meditation: 'A guided breathing timer, or log a session you did elsewhere.',
  sleep: 'Bedtime, wake time and how well you slept, against your own goal.',
  weight: 'A calm trend line over weeks, in kg or lb.',
  exercise: 'Nine activities and a weekly goal, so a rest day never counts against you.',
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

/** What turns logging into a habit. */
const HABIT_FEATURES = [
  { icon: Target, title: 'Your own goals', text: 'Set sleep, meditation and a weekly exercise goal. Every card shows “Logged” or “Goal met”, so progress is always clear.' },
  { icon: Flame, title: 'Streaks and a growing garden', text: 'Days in a row for every tracker, and a plant that blooms with each water-goal day.' },
  { icon: Zap, title: 'One tap from Home', text: 'Add a glass of water or check in your mood without opening a tracker. Log for earlier today or yesterday, and fix any entry.' },
  { icon: CalendarRange, title: 'Your week, every Monday', text: 'A short recap of last week next to the week before, with the one thing that went best.' },
  { icon: Lightbulb, title: 'Nudges that notice', text: 'Gentle suggestions when things slip, a cheer when you’re back on track, and reminders that stop once you’re done.' },
  { icon: BookOpen, title: 'Short programmes', text: 'Sleep reset, Stress reset, Hydration kickstart and Move more: one small step a day, plus a daily tip.' },
] as const

const PROGRAMMES = [
  { name: 'Sleep reset', days: 7, color: PILLAR_COLORS.sleep },
  { name: 'Stress reset', days: 7, color: PILLAR_COLORS.mood },
  { name: 'Hydration kickstart', days: 5, color: PILLAR_COLORS.water },
  { name: 'Move more', days: 7, color: PILLAR_COLORS.exercise },
]

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

/** A static picture of the care-team chat (sample names), in the app's own style. */
function ChatPreview() {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-30px_rgba(15,47,55,0.45)] ring-1 ring-line" aria-label="Example conversation with a therapist (sample)">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6A55C9] text-sm font-bold text-white">
          AR
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight">Dr. Ananya Rao</p>
          <p className="text-xs text-muted">
            <span className="font-bold text-[#6A55C9]">Therapist</span> · Online · usually replies within a day
          </p>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold text-[#B8402B] ring-1 ring-[#E8B4A9] sm:inline-flex">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Need help now?
        </span>
      </div>
      <div className="space-y-2 bg-[#F4F7F8] px-4 py-4 text-[14px] leading-relaxed">
        <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#1A6DB5] px-3.5 py-2.5 text-white">I’ve been overwhelmed with deadlines and I’m not sleeping well.</p>
        <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 ring-1 ring-line">
          Thank you for reaching out. Can we look at what a typical evening looks like for you right now?
        </p>
        <p className="text-right text-[11px] font-semibold text-muted">Seen by Ananya</p>
      </div>
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
          <a href="#pricing" className="hidden rounded-full px-4 py-2 text-sm font-bold text-ink hover:bg-white/70 sm:inline-flex">
            Pricing
          </a>
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
                Habits, insights and real support
              </p>
              <h1 className="mt-5 text-[2.6rem] font-extrabold leading-[1.04] sm:text-6xl">
                Your whole wellbeing, <span className="text-brand-gradient">in one place.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted">{BRAND.description}</p>
              <ul className="mt-5 grid max-w-xl gap-2 text-sm font-semibold text-ink/85 sm:grid-cols-2">
                {['Six trackers, one tap to log', 'Goals, streaks and a weekly recap', 'Programmes and a daily tip', 'Private chat with a therapist or dietitian'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-[#1F6E64]" strokeWidth={3} aria-hidden /> {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="btn-primary px-6 py-3.5 text-base">
                  Create your free account <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href="/login" className="btn-secondary px-6 py-3.5 text-base">
                  Log in
                </Link>
              </div>
              <p className="mt-5 flex items-center gap-2 text-sm text-muted">
                <Lock className="h-4 w-4" aria-hidden /> Private by default. Only you see your entries, and your chats are only with your coach.
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
            <p className="mt-3 text-lg text-muted">
              Each one takes seconds to log, for now or earlier, and every entry can be edited. Together they show you the bigger picture. And a BMI calculator when you want to
              check where you stand.
            </p>
          </div>
          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRACKERS.map((t) => {
              const Icon = t.icon
              return (
                <li key={t.id} className="relative overflow-hidden rounded-3xl bg-white p-6 ring-1 ring-line">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: t.accent }} aria-hidden />
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${t.accent}1A`, color: t.accent }}>
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

        {/* Habits */}
        <section aria-labelledby="habits-title" className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 lg:pb-20">
          <div className="max-w-2xl">
            <h2 id="habits-title" className="text-3xl font-extrabold sm:text-4xl">
              Built to become a habit
            </h2>
            <p className="mt-3 text-lg text-muted">Pick what you want to work on when you sign up, and {BRAND.name} keeps you going from there.</p>
          </div>
          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {HABIT_FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <li key={f.title} className="rounded-3xl bg-white p-6 ring-1 ring-line">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mist text-[#1F6E64]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted">{f.text}</p>
                </li>
              )
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-3xl bg-white/60 p-4 ring-1 ring-line">
            <span className="mr-1 text-sm font-bold">Programmes:</span>
            {PROGRAMMES.map((p) => (
              <span key={p.name} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-line">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
                {p.name} <span className="font-normal text-muted">· {p.days} days</span>
              </span>
            ))}
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
                From your second entry, {BRAND.name} shows how each habit is going. Over time it finds patterns across your trackers and explains them in plain words. No charts
                to decode, no statistics to interpret.
              </p>
              <ul className="mt-6 space-y-2 text-ink/80">
                <li>• Your last 30 days for all six trackers, at a glance.</li>
                <li>• Habits that go together: do you sleep longer after days you exercise?</li>
                <li>• Does more water mean better sleep, or a better mood?</li>
              </ul>
            </div>
            <div aria-label="Example insight">
              <InsightCard headline={SAMPLE} />
            </div>
          </div>
        </section>

        {/* Care team */}
        <section aria-labelledby="care-title" className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 lg:pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <ChatPreview />
              <p className="mt-2 text-center text-xs text-muted">Sample conversation</p>
            </div>
            <div className="order-1 lg:order-2">
              <p className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6A55C9]">
                <MessageCircleHeart className="h-4 w-4" aria-hidden /> Your care team
              </p>
              <h2 id="care-title" className="mt-2 text-3xl font-extrabold sm:text-4xl">
                Real people, when you need them
              </h2>
              <p className="mt-3 text-lg text-muted">
                Message your company’s therapist or dietitian privately, from the app. You keep the same coach each time, so you never have to start your story again.
              </p>
              <ul className="mt-6 space-y-3 text-ink/85">
                <li className="flex gap-2">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[#1F6E64]" strokeWidth={3} aria-hidden /> Replies within a day, and you can see when your message has been read.
                </li>
                <li className="flex gap-2">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[#1F6E64]" strokeWidth={3} aria-hidden /> Share a photo, like a meal or a sleep tracker screen.
                </li>
                <li className="flex gap-2">
                  <ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-[#B8402B]" aria-hidden /> Support right away when it’s urgent: the EAP helpline is one tap away in every
                  chat, and a hard day in your mood check-in brings it straight up.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" aria-labelledby="pricing-title" className="mx-auto max-w-6xl scroll-mt-6 px-5 pb-16 sm:px-8 lg:pb-24">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-[#B9650E]">
              <Crown className="h-4 w-4" aria-hidden /> Pricing
            </p>
            <h2 id="pricing-title" className="mt-2 text-3xl font-extrabold sm:text-4xl">
              Start free. Go Premium when you’re ready.
            </h2>
            <p className="mt-3 text-lg text-muted">
              Every new account gets {TRIAL_DAYS} days of Premium free, no card needed. Prices include GST and other taxes; cancel any time.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl bg-white p-6 ring-1 ring-line">
              <h3 className="text-xl font-extrabold">Free</h3>
              <p className="mt-2 font-display text-4xl font-extrabold">₹0</p>
              <p className="text-sm text-muted">Forever</p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1F6E64]" strokeWidth={3} aria-hidden /> {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="btn-secondary mt-6 w-full">
                Create your free account
              </Link>
            </div>

            <div className="relative rounded-3xl bg-gradient-to-br from-[#FFF7E6] to-white p-6 ring-2 ring-[#E9A21F] lg:col-span-2">
              <span className="absolute -top-3 left-6 rounded-full bg-[#B9650E] px-3 py-1 text-xs font-bold text-white">{TRIAL_DAYS}-day free trial</span>
              <h3 className="flex items-center gap-2 text-xl font-extrabold">
                <Crown className="h-5 w-5 text-[#B9650E]" aria-hidden /> Premium
              </h3>
              <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
                <p>
                  <span className="font-display text-4xl font-extrabold">{PRICES.monthly.label}</span>
                  <span className="font-bold text-muted"> / {PRICES.monthly.per}</span>
                </p>
                <p className="pb-1 text-sm">
                  or <b>{PRICES.yearly.label} / {PRICES.yearly.per}</b> <span className="text-muted">({PRICES.yearly.note})</span>
                </p>
              </div>
              <p className="mt-4 text-sm font-semibold">Everything in Free, plus:</p>
              <ul className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {PREMIUM_FEATURES.map((f) => (
                  <li key={f.key} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1F6E64]" strokeWidth={3} aria-hidden />
                    <span>
                      <b>{f.title}</b>
                      <span className="block text-muted">{f.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="btn-primary mt-6">
                Start your free trial <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-white/70 px-4 py-3 text-sm text-ink/85 ring-1 ring-line">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1F6E64]" aria-hidden />
            <span>
              <b>Is your company providing {BRAND.name}?</b> Then Premium is included for you; there’s nothing to pay. In an emergency, 112 is always shown, on every plan.
            </span>
          </p>
        </section>

        {/* For companies */}
        <section aria-labelledby="company-title" className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
          <div className="grid gap-8 rounded-[2rem] bg-white p-6 ring-1 ring-line sm:p-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1F6E64]">
                <BarChart3 className="h-4 w-4" aria-hidden /> For your company
              </p>
              <h2 id="company-title" className="mt-2 text-3xl font-extrabold sm:text-4xl">
                See the trends, never the person
              </h2>
              <p className="mt-3 text-lg text-muted">
                HR sees anonymised company totals: how many people use {BRAND.name}, which habits they build, mood and stress trends, and how quickly the wellness team replies.
              </p>
            </div>
            <ul className="space-y-3 self-center text-ink/85">
              <li className="flex gap-2">
                <EyeOff className="mt-1 h-4 w-4 shrink-0 text-[#1F6E64]" aria-hidden /> Totals only, with any group of fewer than 5 people hidden. No names, entries or
                messages, ever.
              </li>
              <li className="flex gap-2">
                <Check className="mt-1 h-4 w-4 shrink-0 text-[#1F6E64]" strokeWidth={3} aria-hidden /> Invite your whole team from a spreadsheet; everyone sets their own
                password.
              </li>
              <li className="flex gap-2">
                <Check className="mt-1 h-4 w-4 shrink-0 text-[#1F6E64]" strokeWidth={3} aria-hidden /> Coaches get a fair, shared queue; admins see workload and reply times at
                a glance.
              </li>
            </ul>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#13263B] px-6 py-12 text-center text-white sm:px-12">
            <BrandBackdrop tone="deep" />
            <div className="relative">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Start with one habit. See the whole picture.</h2>
              <p className="mx-auto mt-3 max-w-xl text-white/80">Free to use. Set up in about a minute, on your phone or computer.</p>
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
