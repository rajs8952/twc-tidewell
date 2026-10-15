import { NextResponse } from 'next/server'
import { cancelSubscription } from '@/lib/razorpay'
import { isJson, signedInFromBearer } from '@/lib/supabase/bearer'
import { supabaseAdmin } from '@/lib/supabase/admin'

/* ------------------------------------------------------------------
 * POST /api/mobile/delete-account { confirm: 'DELETE' }: the OmniWell app's
 * "Delete my account" (the App Store and Google Play require it).
 *
 * Employees only: coaches, HR and admins are asked to go through an admin,
 * since their accounts carry other people's conversations and settings.
 *   1. A paid plan is cancelled on Razorpay first, so nothing more is charged
 *      (if that fails, nothing is deleted and they're told to try again).
 *   2. Their files are removed: the profile photo, and the photos in their
 *      conversations (storage isn't cleared by the database).
 *   3. The account is deleted; the database removes everything that belongs
 *      to it (every table references auth.users with ON DELETE CASCADE, or
 *      SET NULL for references from other people's data).
 * Logs counts only, never who.
 * ------------------------------------------------------------------ */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!isJson(req)) return NextResponse.json({ error: 'Send JSON.' }, { status: 415 })
  const session = await signedInFromBearer(req)
  if (!session) return NextResponse.json({ error: 'You’re signed out. Log in again to continue.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null
  if (body?.confirm !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 })

  const { data: role } = await session.supabase.rpc('my_role')
  if (role === 'coach' || role === 'admin' || role === 'hr') {
    return NextResponse.json({ error: 'Wellness team, HR and admin accounts can’t be deleted from the app. Ask an OmniWell administrator.' }, { status: 403 })
  }

  const admin = supabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Account deletion isn’t available right now. Try again later.' }, { status: 503 })
  const userId = session.userId

  // 1. No more charges.
  const { data: sub } = await admin
    .from('subscriptions')
    .select('source, status, provider_subscription_id')
    .eq('user_id', userId)
    .maybeSingle<{ source: string; status: string; provider_subscription_id: string | null }>()
  if (sub?.source === 'paid' && sub.provider_subscription_id && sub.status !== 'cancelled') {
    try {
      await cancelSubscription(sub.provider_subscription_id)
    } catch (e) {
      console.error('[delete-account] cancelling the subscription failed:', (e as Error).message)
      return NextResponse.json({ error: 'We couldn’t stop your paid plan, so nothing was deleted. Try again in a few minutes.' }, { status: 502 })
    }
  }

  // 2. Their files.
  let files = 0
  const remove = async (bucket: string, folder: string) => {
    const { data } = await admin.storage.from(bucket).list(folder, { limit: 1000 })
    const paths = (data ?? []).filter((f) => f.name && f.id).map((f) => `${folder}/${f.name}`)
    if (!paths.length) return
    const { error } = await admin.storage.from(bucket).remove(paths)
    if (error) console.error('[delete-account] removing files failed:', bucket, error.message)
    else files += paths.length
  }
  await remove('avatars', userId)
  const { data: threads } = await admin.from('therapist_threads').select('id').eq('user_id', userId)
  for (const t of (threads ?? []) as { id: string }[]) await remove('chat_media', t.id)

  // 3. The account, and with it everything that belongs to it.
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    console.error('[delete-account] deleting the account failed:', error.message)
    return NextResponse.json({ error: 'Something went wrong deleting your account. Try again, or contact your OmniWell administrator.' }, { status: 500 })
  }
  console.info(`[delete-account] account deleted (${files} files removed)`)
  return NextResponse.json({ ok: true })
}
