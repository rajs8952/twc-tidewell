import { Stack } from 'expo-router'
import { COLORS } from '@/lib/theme'
import { BMI, TRACKERS } from '@/lib/trackers'

/** The signed-in app: the tabs, and the trackers and conversations opened from them (native header and back swipe). */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: COLORS.background },
        headerStyle: { backgroundColor: COLORS.background },
        headerShadowVisible: false,
        headerTintColor: COLORS.ink,
        headerTitleStyle: { fontWeight: '800', color: COLORS.ink },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {Object.values(TRACKERS).map((t) => (
        <Stack.Screen key={t.id} name={t.id} options={{ title: t.name }} />
      ))}
      <Stack.Screen name="bmi" options={{ title: `${BMI.name} calculator` }} />
      <Stack.Screen name="chat/[team]" options={{ headerShown: false }} />
      <Stack.Screen name="programmes" options={{ title: 'Programmes' }} />
      <Stack.Screen name="programme/[id]" options={{ title: 'Programme' }} />
      <Stack.Screen name="edit-profile" options={{ title: 'Edit profile' }} />
    </Stack>
  )
}
