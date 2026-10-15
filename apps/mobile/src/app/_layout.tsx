import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { SessionProvider, useSession } from '@/lib/auth'
import { useNotificationTaps } from '@/lib/push'
import { useTimezoneSync } from '@/lib/timezone'
import { COLORS } from '@/lib/theme'

// Keep the splash screen up until the saved sign-in has been read, and for at least SPLASH_MS.
SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({ fade: true, duration: 400 })
const SPLASH_MS = 3000

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SessionProvider>
  )
}

/** Signed in: the app. Signed out (or choosing a new password): the sign-in screens. */
function RootNavigator() {
  const { session, loading, held } = useSession()
  const [shownLongEnough, setShownLongEnough] = useState(false)
  const signedIn = !!session && !held
  useNotificationTaps(signedIn)
  useTimezoneSync(signedIn)

  // The screens load underneath meanwhile, so the app is ready when the splash goes.
  useEffect(() => {
    const timer = setTimeout(() => setShownLongEnough(true), SPLASH_MS)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!loading && shownLongEnough) SplashScreen.hideAsync()
  }, [loading, shownLongEnough])

  if (loading) return null
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
    </Stack>
  )
}
