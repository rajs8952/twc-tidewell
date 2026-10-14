import { router, type Href } from 'expo-router'
import { Apple, ChevronRight, MessageCircleHeart } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PremiumCard } from '@/components/Support'
import { Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { REPLY_TARGET_HOURS, TEAMS, isOpenStatus, listMyChats, type Chat, type Team } from '@/lib/chat'
import { usePlan } from '@/lib/plan'
import { COLORS, RADIUS } from '@/lib/theme'
import { useLoad } from '@/lib/useLoad'
import { newRow, useRealtime } from '@/lib/useRealtime'

const TEAM_ICON = { therapist: MessageCircleHeart, dietitian: Apple } as const

const WATCHES = [
  { table: 'thread_messages', event: 'INSERT' as const },
  { table: 'therapist_threads', event: '*' as const },
]

/** "Your care team": the open conversation with each team (or a way to start one), and earlier ones. */
export default function Chats() {
  const plan = usePlan()
  const locked = !!plan && !plan.premium
  const { data: chats, error, refreshing, refresh, reload } = useLoad(listMyChats)
  const [showEarlier, setShowEarlier] = useState(false)

  // A coach's reply or a status change in any conversation refreshes the list.
  useRealtime(locked ? null : WATCHES, (c) => {
    const row = newRow(c)
    if (c.table === 'thread_messages' && row.sender_role !== 'therapist') return
    void reload()
  })

  const current = (team: Team) => chats?.find((c) => c.team === team && isOpenStatus(c.status)) ?? null
  const earlier = chats?.filter((c) => !isOpenStatus(c.status)) ?? []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.tide500} colors={[COLORS.tide500]} />}>
        <Text style={styles.title} accessibilityRole="header">
          Your care team
        </Text>
        <Text style={styles.lead}>Private messages with your company’s therapist and dietitian. They usually reply within {REPLY_TARGET_HOURS} hours. Not for emergencies: use Support for urgent help.</Text>

        {locked ? (
          <PremiumCard title="Chat with your therapist and dietitian" text="Private messages with the wellness team, with photos and read receipts, are part of Premium." />
        ) : (
          <>
            {error && <Notice tone="error">{error}</Notice>}
            {!chats && !error && <Loader label="Loading your chats…" />}
            {chats && (
              <View style={{ gap: 12 }}>
                {(['therapist', 'dietitian'] as Team[]).map((team) => (
                  <TeamCard key={team} team={team} chat={current(team)} />
                ))}
              </View>
            )}
            {earlier.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Pressable onPress={() => setShowEarlier((s) => !s)} style={styles.earlierToggle} accessibilityRole="button" accessibilityState={{ expanded: showEarlier }}>
                  <Text style={styles.earlierToggleText}>
                    {showEarlier ? 'Hide' : 'Show'} {earlier.length} earlier {earlier.length === 1 ? 'conversation' : 'conversations'}
                  </Text>
                </Pressable>
                {showEarlier &&
                  earlier.map((c) => (
                    <Pressable key={c.id} onPress={() => router.push(`/chat/${c.team}?thread=${c.id}` as Href)} style={({ pressed }) => [styles.earlier, pressed && { opacity: 0.7 }]} accessibilityRole="button">
                      <View style={{ flex: 1 }}>
                        <Text style={styles.earlierTitle}>
                          {TEAMS[c.team].label}
                          {c.coach_name ? ` · ${c.coach_name}` : ''}
                        </Text>
                        <Text style={styles.preview} numberOfLines={1}>
                          Closed · {new Date(c.last?.created_at ?? c.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                          {c.last ? ` · ${previewText(c)}` : ''}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={COLORS.muted} />
                    </Pressable>
                  ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const previewText = (c: Chat) => (c.last ? `${c.last.sender_role === 'user' ? 'You: ' : ''}${c.last.content || (c.last.media_url ? 'Photo' : '')}` : '')

function TeamCard({ team, chat }: { team: Team; chat: Chat | null }) {
  const t = TEAMS[team]
  const Icon = TEAM_ICON[team]
  const unread = !!chat?.last && chat.last.sender_role === 'therapist' && (!chat.user_read_at || Date.parse(chat.last.created_at) > Date.parse(chat.user_read_at))
  const status = !chat ? 'Start a conversation' : chat.status === 'unassigned' ? `Waiting for a ${t.label.toLowerCase()}` : chat.coach_name ? `With ${chat.coach_name}` : 'Ongoing'
  return (
    <Pressable
      onPress={() => router.push(`/chat/${team}${chat ? `?thread=${chat.id}` : ''}` as Href)}
      style={({ pressed }) => [styles.card, unread && { borderColor: t.accent }, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={`${t.label}. ${status}.${unread ? ' New reply.' : ''}`}
    >
      <View style={[styles.icon, { backgroundColor: t.tint }]}>
        <Icon size={24} color={t.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>{t.label}</Text>
          {chat?.last && <Text style={styles.time}>{new Date(chat.last.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</Text>}
        </View>
        <Text style={[styles.status, { color: t.accent }]}>
          {status}
          {chat?.coach_online ? ' · online' : ''}
        </Text>
        {chat?.last && (
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {previewText(chat)}
          </Text>
        )}
      </View>
      {unread ? <View style={[styles.unread, { backgroundColor: t.accent }]} /> : <ChevronRight size={18} color={COLORS.muted} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.5 },
  lead: { fontSize: 15, lineHeight: 21, color: COLORS.muted, marginBottom: 6 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.white, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.line, padding: 16 },
  icon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  time: { fontSize: 12, color: COLORS.muted },
  status: { fontSize: 14, fontWeight: '700' },
  preview: { fontSize: 14, color: COLORS.muted },
  previewUnread: { color: COLORS.ink, fontWeight: '700' },
  unread: { width: 12, height: 12, borderRadius: 6 },
  earlierToggle: { minHeight: 44, justifyContent: 'center' },
  earlierToggleText: { fontSize: 14, fontWeight: '700', color: COLORS.tide600 },
  earlier: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  earlierTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
})
