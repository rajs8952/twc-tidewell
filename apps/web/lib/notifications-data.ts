'use client'

import type { SupabaseClient } from '@supabase/supabase-js'

/*
 * In-app notifications (supabase/coach-alerts.sql), straight from the browser.
 * Row-level security only returns the signed-in user's own rows and only
 * lets them flip is_read; notifications are created by the server.
 */

export interface InAppNotification {
  id: string
  message: string
  thread_id: string | null
  is_read: boolean
  created_at: string
}

/** The newest notifications, or null if notifications aren't set up yet (coach-alerts.sql not run). */
export async function loadNotifications(supabase: SupabaseClient, limit = 20): Promise<InAppNotification[] | null> {
  const { data, error } = await supabase
    .from('in_app_notifications')
    .select('id, message, thread_id, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<InAppNotification[]>()
  if (error) return null
  return data ?? []
}

export async function markNotificationsRead(supabase: SupabaseClient, ids: string[]) {
  if (!ids.length) return
  await supabase.from('in_app_notifications').update({ is_read: true }).in('id', ids)
}
