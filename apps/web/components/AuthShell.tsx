import { BookOpen, MessageCircleHeart, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { BrandBackdrop } from './BrandBackdrop'
import { Logo } from './Logo'
import { BRAND } from '@/lib/brand'
import { BMI_TOOL, TRACKERS } from '@/lib/trackers'

/** Beyond the six trackers: what the rest of the app offers. */
const MORE = [
  { icon: Sparkles, title: 'Insights', text: 'How each habit is going, and how they connect', color: '#8E7CF0' },
  { icon: BookOpen, title: 'Programmes and daily tips', text: 'One small step a day for sleep, stress and more', color: '#E9A21F' },
  { icon: MessageCircleHeart, title: 'Your care team', text: 'Private chat with a therapist or dietitian', color: '#E8628A' },
]

/**
 * Frame for the log-in and sign-up pages: a holistic brand panel on large
 * screens (the six pillars, then insights, programmes and the care team),
 * the form on the right. Phones get a slim gradient bar and the logo above
 * the form.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#13263B] p-12 text-white lg:flex lg:flex-col">
        <BrandBackdrop tone="deep" />
        <Link href="/" className="relative z-10 w-fit rounded-xl">
          <Logo light />
        </Link>

        <div className="relative z-10 mt-14 max-w-md xl:mt-20 [@media(max-height:820px)]:mt-8">
          <h1 className="text-5xl font-extrabold leading-[1.04] text-white [@media(max-height:820px)]:text-4xl">One calm place for your whole wellbeing.</h1>
          <p className="mt-5 text-lg text-white/80 [@media(max-height:820px)]:mt-3 [@media(max-height:820px)]:text-base">
            Build healthy habits across six trackers, see how they connect, and talk privately with your company’s therapist and dietitian, all in {BRAND.name}.
          </p>
        </div>

        <ul className="relative z-10 mt-8 flex max-w-md flex-wrap gap-2 [@media(max-height:820px)]:mt-5" aria-label="What you can track">
          {[...TRACKERS, { ...BMI_TOOL, name: 'BMI' }].map((t) => {
            const Icon = t.icon
            return (
              <li key={t.href} className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-3 ring-1 ring-white/15 backdrop-blur">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: t.accent }}>
                  <Icon className="h-3.5 w-3.5 text-white" aria-hidden />
                </span>
                <span className="text-sm font-bold">{t.name}</span>
              </li>
            )
          })}
        </ul>

        <ul className="relative z-10 mb-10 mt-4 max-w-md space-y-2 [@media(max-height:820px)]:mb-6" aria-label="And more">
          {MORE.map((m) => {
            const Icon = m.icon
            return (
              <li key={m.title} className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="h-4 w-4" style={{ color: m.color }} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{m.title}</span>
                  <span className="block text-xs text-white/70 [@media(max-height:720px)]:hidden">{m.text}</span>
                </span>
              </li>
            )
          })}
        </ul>

        <figure className="relative z-10 mt-auto max-w-md rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur [@media(max-height:900px)]:hidden">
          <figcaption className="text-xs font-bold uppercase tracking-wide text-white/60">Example insight</figcaption>
          <p className="mt-1 font-display text-lg font-bold leading-snug">You slept 1h 20m longer after days you exercised.</p>
        </figure>
      </aside>

      <section className="relative flex flex-col">
        <div className="bg-brand-gradient h-1.5 w-full lg:hidden" aria-hidden />
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-10 inline-block rounded-xl lg:hidden">
              <Logo />
            </Link>
            {children}
          </div>
        </div>
      </section>
    </main>
  )
}
