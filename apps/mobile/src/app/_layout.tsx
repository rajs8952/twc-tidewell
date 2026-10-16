import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { AnimatedSplash, SPLASH_BACKGROUND } from '@/components/AnimatedSplash'
import { SessionProvider, useSession } from '@/lib/auth'
import { useNotificationTaps } from '@/lib/push'
import { useTimezoneSync } from '@/lib/timezone'
import { COLORS } from '@/lib/theme'

// The phone's own splash (plain navy) stays until the saved sign-in has been read;
// then the animated splash, drawn on the same navy, plays over the app as it loads.
SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({ fade: false })

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  )
}

/** Signed in: the app. Signed out (or choosing a new password): the sign-in screens. */
function RootNavigator() {
  const { session, loading, held } = useSession()
  const [splashDone, setSplashDone] = useState(false)
  const signedIn = !!session && !held
  useNotificationTaps(signedIn)
  useTimezoneSync(signedIn)
  const finishSplash = useCallback(() => setSplashDone(true), [])

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync()
  }, [loading])

  return (
    <View style={{ flex: 1, backgroundColor: splashDone ? COLORS.background : SPLASH_BACKGROUND }}>
      <StatusBar style={splashDone ? 'dark' : 'light'} />
      {!loading && (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" />
          </Stack.Protected>
        </Stack>
      )}
      {!splashDone && <AnimatedSplash start={!loading} onDone={finishSplash} />}
    </View>
  )
}
