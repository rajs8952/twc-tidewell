import { AppNav } from '@/components/AppNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      <div className="pb-28 md:pb-0 md:pl-24">
        <main className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
    </>
  )
}
