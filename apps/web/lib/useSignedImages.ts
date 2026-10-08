'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { signImageUrls } from './chat-data'
import { CHAT_IMAGE_LINK_SECONDS } from './messages'

/** Links are renewed this long before they expire, so an open chat never shows a broken image. */
const RENEW_EARLY_MS = 5 * 60_000

/**
 * Signed viewing links for chat image paths (private bucket), fetched in one
 * batch for any new paths and renewed before they expire. Returns
 * path → URL; a path without a link yet is still loading (or not allowed).
 */
export function useSignedImages(supabase: SupabaseClient, paths: string[]) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const signedAt = useRef(new Map<string, number>())
  const key = [...new Set(paths)].sort().join('|')

  useEffect(() => {
    let alive = true
    const wanted = key ? key.split('|') : []
    const sign = async (only: string[]) => {
      if (!only.length) return
      const fresh = await signImageUrls(supabase, only)
      if (!alive || !fresh.size) return
      const now = Date.now()
      for (const p of fresh.keys()) signedAt.current.set(p, now)
      setUrls((cur) => new Map([...cur, ...fresh]))
    }
    // New paths now; every path again before its link runs out.
    sign(wanted.filter((p) => !signedAt.current.has(p)))
    const renew = setInterval(() => {
      const due = Date.now() - (CHAT_IMAGE_LINK_SECONDS * 1000 - RENEW_EARLY_MS)
      sign(wanted.filter((p) => (signedAt.current.get(p) ?? 0) < due))
    }, 60_000)
    return () => {
      alive = false
      clearInterval(renew)
    }
  }, [key, supabase])

  return urls
}
