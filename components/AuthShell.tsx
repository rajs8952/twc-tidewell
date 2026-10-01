import { AmbientWaves } from './AmbientWaves'
import { Logo } from './Logo'

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-tide-600 p-12 text-white lg:flex lg:flex-col">
        <Logo light />
        <div className="relative z-10 mt-24 max-w-md">
          <h1 className="text-5xl font-extrabold leading-[1.02]">Know how much water your body needs today.</h1>
          <p className="mt-5 text-lg text-tide-100">
            Tidewell sets a daily goal from your weight and activity, then fills up as you drink.
          </p>
        </div>
        <AmbientWaves />
      </aside>
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </section>
    </main>
  )
}
