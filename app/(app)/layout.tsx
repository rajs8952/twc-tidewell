import { AppNav } from '@/components/AppNav'
import { TimezoneSync } from '@/components/TimezoneSync'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      <TimezoneSync />
      <div className="pb-28 md:pb-0 md:pl-24 lg:pl-64">
        <main className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
    </>
  )
}
