import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { router, type Href } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { supabase } from './supabase'

/* ------------------------------------------------------------------
 * Push notifications on this phone: reminders, the Monday recap and coach
 * replies, sent by the website's server through Expo
 * (apps/web/lib/expo-push.ts). The phone's Expo push token is saved for the
 * signed-in person (save_mobile_push_token, supabase/mobile-push.sql) and
 * removed when they log out, so a shared phone never shows someone else's.
 * ------------------------------------------------------------------ */

const TOKEN_KEY = 'omniwell.push-token'

// Shown even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
})

const projectId = (): string | undefined => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId

export type PushState = 'on' | 'off' | 'blocked' | 'unsupported'

/** Whether this phone gets notifications now. */
export async function pushState(): Promise<PushState> {
  if (!Device.isDevice || !projectId()) return 'unsupported'
  const { status, canAskAgain } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') return canAskAgain ? 'off' : 'blocked'
  return (await SecureStore.getItemAsync(TOKEN_KEY)) ? 'on' : 'off'
}

/** Why push can't work here, in plain words (null when it can). */
export function unsupportedReason() {
  if (!Device.isDevice) return 'Notifications need a real phone, not a simulator.'
  if (!projectId()) return 'Notifications aren’t set up in this version of the app yet.'
  return null
}

async function channels() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT })
  await Notifications.setNotificationChannelAsync('messages', { name: 'Messages from your wellness team', importance: Notifications.AndroidImportance.HIGH })
}

/** Gets this phone's token and saves it for the signed-in person. Asks for permission only when `ask`. */
async function register(ask: boolean): Promise<PushState> {
  const reason = unsupportedReason()
  if (reason) return 'unsupported'
  await channels()
  let { status, canAskAgain } = await Notifications.getPermissionsAsync()
  if (status !== 'granted' && ask && canAskAgain) ({ status, canAskAgain } = await Notifications.requestPermissionsAsync())
  if (status !== 'granted') return canAskAgain ? 'off' : 'blocked'
  let token: string
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data
  } catch (e) {
    // Expo Go on Android can't receive push notifications (a development or store build can).
    throw new Error(Platform.OS === 'android' ? 'Notifications need the installed OmniWell app on Android; Expo Go doesn’t support them.' : (e as Error).message)
  }
  const { error } = await supabase.rpc('save_mobile_push_token', { p_token: token, p_platform: Platform.OS === 'ios' ? 'ios' : 'android' })
  if (error) throw new Error(error.code === 'PGRST202' ? 'Notifications aren’t set up yet. Run supabase/mobile-push.sql in Supabase first.' : error.message)
  await SecureStore.setItemAsync(TOKEN_KEY, token)
  return 'on'
}

/** "Turn on notifications": asks for permission if needed. */
export const enablePush = () => register(true)

/** On opening the app signed in: refresh the saved token quietly if notifications are on (tokens can change). */
export async function refreshPush() {
  try {
    if ((await SecureStore.getItemAsync(TOKEN_KEY)) && (await Notifications.getPermissionsAsync()).status === 'granted') await register(false)
  } catch {
    /* tried again next time */
  }
}

/** Stops notifications to this phone for the signed-in person (turning them off, or logging out). */
export async function disablePush() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY)
  if (token) await supabase.from('mobile_push_tokens').delete().eq('token', token)
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

/** A notification's link (website paths too, as the server sends both) as an app screen. */
export function appPath(url: string): string {
  if (url.startsWith('/dashboard')) return '/'
  if (url.startsWith('/messages/')) return url.replace('/messages/', '/chat/')
  if (url.startsWith('/messages')) return '/chats'
  if (url.startsWith('/water')) return '/water'
  if (url.startsWith('/profile')) return '/reminders'
  return url
}

/** Opens the right screen when a notification is tapped (also one that launched the app). */
export function useNotificationTaps(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return
    const go = (n: Notifications.Notification) => {
      const url = n.request.content.data?.url
      if (typeof url === 'string' && url.startsWith('/')) router.push(appPath(url) as Href)
    }
    const last = Notifications.getLastNotificationResponse()
    if (last?.notification) go(last.notification)
    const sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification))
    void refreshPush()
    return () => sub.remove()
  }, [signedIn])
}
