import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { SessionProvider, useSession } from '@/lib/auth'
import { useNotificationTaps } from '@/lib/push'
import { useTimezoneSync } from '@/lib/timezone'
import { COLORS } from '@/lib/theme'

// Keep the splash screen up until the saved sign-in has been read.
SplashScreen.preventAutoHideAsync()

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
  const signedIn = !!session && !held
  useNotificationTaps(signedIn)
  useTimezoneSync(signedIn)

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync()
  }, [loading])

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
