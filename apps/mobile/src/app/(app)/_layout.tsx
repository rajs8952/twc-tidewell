import { Stack } from 'expo-router'
import { COLORS } from '@/lib/theme'

/**
 * The signed-in app: the tabs, and the screens opened over them (back swipe).
 * Each screen draws its own header (components/kit.tsx TrackerScreen, the chat
 * screen): with the navigator's native header, iOS kept closing the keyboard.
 */
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
      <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
    </Stack>
  )
}
