import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Skip static assets, generated icons, the web manifest and the PWA's service
  // worker and offline page: none need a session, and the worker must never get
  // a login redirect instead of itself. The cron route checks its own secret.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|swe-worker|~offline|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
