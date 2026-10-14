import { Tabs } from 'expo-router'
import { House, LifeBuoy, MessageCircle, Sparkles, UserRound } from 'lucide-react-native'
import { COLORS } from '@/lib/theme'
import { useUnread } from '@/lib/useUnread'

/** The app's tabs. Trackers and conversations open over them (../_layout.tsx). */
export default function TabsLayout() {
  const unread = useUnread()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.ink,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: { backgroundColor: COLORS.white, borderTopColor: COLORS.line },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        sceneStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} /> }} />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
          tabBarBadge: unread || undefined,
          tabBarBadgeStyle: { backgroundColor: '#E5553C', color: COLORS.white, fontSize: 11 },
          tabBarAccessibilityLabel: unread ? `Chats, ${unread} unread` : 'Chats',
        }}
      />
      <Tabs.Screen name="support" options={{ title: 'Support', tabBarIcon: ({ color, size }) => <LifeBuoy color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />, tabBarAccessibilityLabel: 'Profile' }} />
    </Tabs>
  )
}
