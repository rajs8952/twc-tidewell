'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AvatarPicker } from '@/components/AvatarPicker'
import { Dialog } from '@/components/Dialog'
import { initialsOf } from '@/components/chat/ChatUI'
import { uploadAvatar } from '@/lib/avatar'
import { coachHeartbeat, loadMyCoachCard, myUserId, saveMyCoachCard, type MyCoachProfile } from '@/lib/chat-data'
import { errorMessage } from '@rajs8952/core/errors'
import { createClient } from '@/lib/supabase/client'

/** How often an open portal tells OmniWell the coach is here (Online = seen in the last 2 minutes). */
const HEARTBEAT_MS = 60_000

/**
 * The coach's own card in the portal header: their photo, opening "My
 * profile" (photo, name and title, which employees see on their chats).
 * While the portal is open and visible it also sends the presence
 * heartbeat behind the "Online" badge employees see.
 */
export function CoachProfileButton() {
  const supabase = useMemo(() => createClient(), [])
  const [card, setCard] = useState<MyCoachProfile | null>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadMyCoachCard(supabase).then(setCard, () => {})
  }, [supabase])

  // Presence: beat now, every minute while visible, and on coming back to the tab.
  useEffect(() => {
    const beat = () => document.visibilityState === 'visible' && coachHeartbeat(supabase)
    beat()
    const timer = setInterval(beat, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', beat)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [supabase])

  function start() {
    setName(card?.display_name ?? '')
    setTitle(card?.title ?? '')
    setPhoto(null)
    setError(null)
    setSaved(false)
    setOpen(true)
  }

  async function save() {
    const n = name.trim()
    if (!n) return setError('Enter your name.')
    setBusy(true)
    setError(null)
    try {
      let avatarUrl = card?.avatar_url ?? null
      if (photo) {
        const me = await myUserId(supabase)
        if (!me) throw new Error('You’re signed out. Log in again.')
        avatarUrl = await uploadAvatar(supabase, me, photo.blob)
      }
      await saveMyCoachCard(supabase, n, title.trim())
      setCard({ display_name: n, title: title.trim(), avatar_url: avatarUrl })
      setSaved(true)
      setOpen(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (!card) return null
  const shownPhoto = photo?.url ?? card.avatar_url

  return (
    <>
      <button type="button" onClick={start} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold text-ink ring-1 ring-line transition hover:bg-mist" aria-label="My profile">
        {card.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs text-white" aria-hidden>
            {initialsOf(card.display_name || '?')}
          </span>
        )}
        <span className="hidden sm:inline">My profile</span>
      </button>
      {saved && (
        <p className="sr-only" role="status">
          Profile saved.
        </p>
      )}

      <Dialog
        open={open}
        busy={busy}
        onClose={() => setOpen(false)}
        title="My profile"
        description="Employees see your photo, name and title on their conversations with you."
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save profile
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <AvatarPicker src={shownPhoto} name={name || card.display_name} onPick={(blob, url) => setPhoto({ blob, url })} />
          <div>
            <label htmlFor="coach-name" className="label">Name</label>
            <input id="coach-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="input" placeholder="e.g. Dr Priya Mehta" />
          </div>
          <div>
            <label htmlFor="coach-title" className="label">Title <span className="font-normal text-muted">(optional)</span></label>
            <input id="coach-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="input" placeholder="e.g. Clinical Psychologist" />
            <p className="mt-1 text-xs text-muted">Shown under your name, e.g. “Clinical Psychologist” or “Dietitian, RD”.</p>
          </div>
        </div>
        {error && (
          <p role="alert" className="notice-error mt-4">
            {error}
          </p>
        )}
      </Dialog>
    </>
  )
}
