import Link from 'next/link'
import { BrandBackdrop } from './BrandBackdrop'
import { Logo } from './Logo'
import { BRAND } from '@/lib/brand'
import { BMI_TOOL, TRACKERS } from '@/lib/trackers'

/**
 * Frame for the log-in and sign-up pages: a holistic brand panel on large
 * screens (all six pillars), the form on the right. Phones get a slim
 * gradient bar and the logo above the form.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#13263B] p-12 text-white lg:flex lg:flex-col">
        <BrandBackdrop tone="deep" />
        <Link href="/" className="relative z-10 w-fit rounded-xl">
          <Logo light />
        </Link>

        <div className="relative z-10 mt-14 max-w-md xl:mt-20">
          <h1 className="text-5xl font-extrabold leading-[1.04] text-white">One calm place for your whole wellbeing.</h1>
          <p className="mt-5 text-lg text-white/80">
            {BRAND.name} brings your water, sleep, mood, meditation, exercise and weight together, with a BMI calculator, then shows you how they connect.
          </p>
        </div>

        <ul className="relative z-10 mb-10 mt-8 grid max-w-md grid-cols-2 gap-2.5" aria-label="What you can track">
          {TRACKERS.map((t) => {
            const Icon = t.icon
            return (
              <li key={t.id} className="flex items-center gap-2.5 rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: t.accent }}>
                  <Icon className="h-4 w-4 text-white" aria-hidden />
                </span>
                <span className="text-sm font-bold">{t.name}</span>
              </li>
            )
          })}
          {/* The BMI calculator: a tool rather than a daily tracker, so it spans the row. */}
          <li className="col-span-2 flex items-center gap-2.5 rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: BMI_TOOL.accent }}>
              <BMI_TOOL.icon className="h-4 w-4 text-white" aria-hidden />
            </span>
            <span className="text-sm font-bold">{BMI_TOOL.name}</span>
            <span className="ml-auto hidden text-xs text-white/70 xl:inline">Your healthy weight range</span>
          </li>
        </ul>

        <figure className="relative z-10 mt-auto max-w-md rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur [@media(max-height:800px)]:hidden">
          <figcaption className="text-xs font-bold uppercase tracking-wide text-white/60">Example insight</figcaption>
          <p className="mt-1 font-display text-lg font-bold leading-snug">When you hit your water goal, you sleep 45 minutes longer that night.</p>
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
