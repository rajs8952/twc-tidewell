import { router, type Href } from 'expo-router'
import { Image } from 'expo-image'
import { Apple, Camera, ChevronDown, ChevronRight, Clock, Lock, MessageCircleHeart, PenSquare, ShieldAlert } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { OfflineNotice } from '@/components/kit'
import { Loader } from '@/components/Loader'
import { PremiumCard } from '@/components/Support'
import { Notice } from '@/components/ui'
import { REPLY_TARGET_HOURS, TEAMS, isOpenStatus, listMyChats, type Chat, type Team } from '@/lib/chat'
import { usePlan } from '@/lib/plan'
import { COLORS, RADIUS } from '@/lib/theme'
import { useLoad } from '@/lib/useLoad'
import { newRow, useRealtime } from '@/lib/useRealtime'

/* ------------------------------------------------------------------
 * Chats: "Your care team". One card per team (the coach, whether they're
 * online, the last message and anything unread), the way to start a
 * conversation, a clear route to urgent help, and earlier conversations.
 * Live through Realtime, like the website's inbox.
 * ------------------------------------------------------------------ */

const TEAM_ICON = { therapist: MessageCircleHeart, dietitian: Apple } as const
const TEAM_BLURB: Record<Team, string> = {
  therapist: 'Stress, anxiety, low mood or burnout',
  dietitian: 'Eating, energy and healthy weight',
}

const WATCHES = [
  { table: 'thread_messages', event: 'INSERT' as const },
  { table: 'therapist_threads', event: '*' as const },
]

/** "Just now", "5m", "2h", "Yesterday", "Mon", "14 Oct". */
function ago(iso: string, now: number) {
  const t = Date.parse(iso)
  const mins = Math.round((now - t) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m`
  const d = new Date(t)
  if (d.toDateString() === new Date(now).toDateString()) return `${Math.round(mins / 60)}h`
  if (d.toDateString() === new Date(now - 86_400_000).toDateString()) return 'Yesterday'
  if (now - t < 6 * 86_400_000) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

const isUnread = (c: Chat) => !!c.last && c.last.sender_role === 'therapist' && (!c.user_read_at || Date.parse(c.last.created_at) > Date.parse(c.user_read_at))
const previewText = (c: Chat) => (c.last ? `${c.last.sender_role === 'user' ? 'You: ' : ''}${c.last.content || (c.last.media_url ? 'Photo' : '')}` : '')

export default function Chats() {
  const plan = usePlan()
  const locked = !!plan && !plan.premium
  const { data: chats, error, savedAt, refreshing, refresh, reload } = useLoad(listMyChats, 'chats')
  const [showEarlier, setShowEarlier] = useState(false)
  const [now] = useState(() => Date.now())

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
      {/* A soft wash behind the header, in the two teams' colours. */}
      <View style={styles.wash} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="chatsWash" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#EFECFA" />
              <Stop offset="0.6" stopColor="#FCF1E4" />
              <Stop offset="1" stopColor={COLORS.background} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#chatsWash)" />
        </Svg>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={locked ? undefined : <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.tide500} colors={[COLORS.tide500]} />}>
        <View style={styles.badge}>
          <Lock size={13} color="#4A5BC4" />
          <Text style={styles.badgeText}>Private & confidential</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Your care team
        </Text>
        <Text style={styles.lead}>Message your company’s therapist and dietitian, in confidence. Only you and your coach can read your conversations.</Text>

        <View style={styles.infoRow}>
          <View style={styles.reply}>
            <Clock size={15} color={COLORS.muted} />
            <Text style={styles.replyText}>Usually replies within {REPLY_TARGET_HOURS} hours</Text>
          </View>
          <Pressable onPress={() => router.push('/support')} style={({ pressed }) => [styles.help, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel="Need help now? Open Support">
            <ShieldAlert size={15} color="#C42B1C" />
            <Text style={styles.helpText}>Need help now?</Text>
          </Pressable>
        </View>

        {locked ? (
          <PremiumCard title="Chat with your therapist and dietitian" text="Private messages with the wellness team, with photos and read receipts, are part of Premium." />
        ) : (
          <>
            <OfflineNotice savedAt={savedAt} />
            {error && <Notice tone="error">{error}</Notice>}
            {!chats && !error && <Loader label="Loading your chats…" />}
            {chats && (['therapist', 'dietitian'] as Team[]).map((team) => <TeamCard key={team} team={team} chat={current(team)} now={now} />)}

            {earlier.length > 0 && (
              <View style={styles.earlierBox}>
                <Pressable onPress={() => setShowEarlier((s) => !s)} style={styles.earlierHead} accessibilityRole="button" accessibilityState={{ expanded: showEarlier }}>
                  <Text style={styles.earlierTitle}>Earlier conversations</Text>
                  <View style={styles.count}>
                    <Text style={styles.countText}>{earlier.length}</Text>
                  </View>
                  <View style={{ marginLeft: 'auto', transform: [{ rotate: showEarlier ? '180deg' : '0deg' }] }}>
                    <ChevronDown size={18} color={COLORS.muted} />
                  </View>
                </Pressable>
                {showEarlier &&
                  earlier.map((c) => {
                    const t = TEAMS[c.team]
                    const Icon = TEAM_ICON[c.team]
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => router.push(`/chat/${c.team}?thread=${c.id}` as Href)}
                        style={({ pressed }) => [styles.earlier, pressed && { opacity: 0.7 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`${t.label}${c.coach_name ? ` with ${c.coach_name}` : ''}, closed`}
                      >
                        <View style={[styles.earlierIcon, { backgroundColor: t.tint }]}>
                          <Icon size={16} color={t.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.earlierName} numberOfLines={1}>
                            {c.coach_name ?? t.label}
                            <Text style={styles.earlierTeam}>  ·  {t.label}</Text>
                          </Text>
                          <Text style={styles.preview} numberOfLines={1}>
                            {previewText(c) || 'No messages'}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text style={styles.time}>{ago(c.last?.created_at ?? c.created_at, now)}</Text>
                          <Text style={styles.closed}>Closed</Text>
                        </View>
                      </Pressable>
                    )
                  })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function TeamCard({ team, chat, now }: { team: Team; chat: Chat | null; now: number }) {
  const t = TEAMS[team]
  const Icon = TEAM_ICON[team]
  const unread = !!chat && isUnread(chat)
  const name = chat?.coach_name ?? t.label
  const status = !chat
    ? null
    : chat.status === 'unassigned'
      ? { text: `Waiting for a ${t.label.toLowerCase()}`, bg: '#FFF7E6', fg: '#8A5A0B' }
      : chat.coach_online
        ? { text: 'Online now', bg: '#E2F1E3', fg: '#2E7D4F' }
        : { text: 'Ongoing', bg: t.tint, fg: t.accent }
  const open = () => router.push(`/chat/${team}${chat ? `?thread=${chat.id}` : ''}` as Href)

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [styles.card, unread && { borderColor: t.accent }, pressed && { opacity: 0.92 }]}
      accessibilityRole="button"
      accessibilityLabel={`${t.label}${chat?.coach_name ? `, ${chat.coach_name}` : ''}. ${status?.text ?? 'No conversation yet'}.${unread ? ' New reply.' : ''}${chat?.last ? ` Last message: ${previewText(chat)}.` : ''}`}
    >
      <View style={[styles.accent, { backgroundColor: t.accent }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View>
            {chat?.coach_avatar_url ? (
              <Image source={{ uri: chat.coach_avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : chat?.coach_name ? (
              <View style={[styles.avatar, { backgroundColor: t.tint }]}>
                <Text style={[styles.initial, { color: t.accent }]}>{name.trim().slice(0, 1).toUpperCase()}</Text>
              </View>
            ) : (
              <View style={[styles.avatar, { backgroundColor: t.tint }]}>
                <Icon size={26} color={t.accent} />
              </View>
            )}
            {chat?.coach_online && <View style={styles.online} />}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              {chat?.last && <Text style={[styles.time, unread && { color: t.accent, fontWeight: '800' }]}>{ago(chat.last.created_at, now)}</Text>}
            </View>
            <Text style={[styles.team, { color: t.accent }]}>{chat?.coach_name ? (chat.coach_title ?? t.label) : TEAM_BLURB[team]}</Text>
            {status && (
              <View style={[styles.pill, { backgroundColor: status.bg }]}>
                <Text style={[styles.pillText, { color: status.fg }]}>{status.text}</Text>
              </View>
            )}
          </View>
        </View>

        {chat?.last ? (
          <View style={styles.previewRow}>
            {chat.last.media_url && !chat.last.content ? <Camera size={15} color={unread ? COLORS.ink : COLORS.muted} /> : null}
            <Text style={[styles.preview, { flex: 1 }, unread && styles.previewUnread]} numberOfLines={2}>
              {previewText(chat)}
            </Text>
            {unread ? (
              <View style={[styles.newDot, { backgroundColor: t.accent }]}>
                <Text style={styles.newText}>New</Text>
              </View>
            ) : (
              <ChevronRight size={18} color={COLORS.muted} />
            )}
          </View>
        ) : (
          <View style={[styles.start, { backgroundColor: t.accent }]}>
            <PenSquare size={16} color={COLORS.white} />
            <Text style={styles.startText}>Start a conversation</Text>
          </View>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#4A5BC4' },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.6, marginTop: -4 },
  lead: { fontSize: 15, lineHeight: 21, color: COLORS.muted, marginTop: -6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  reply: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyText: { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  help: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: '#F3B8B0', backgroundColor: COLORS.white },
  helpText: { fontSize: 13, fontWeight: '800', color: '#C42B1C' },
  card: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.line, overflow: 'hidden', shadowColor: '#0F2F37', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  accent: { width: 5 },
  cardBody: { flex: 1, padding: 16, gap: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 22, fontWeight: '800' },
  online: { position: 'absolute', right: 1, bottom: 1, width: 15, height: 15, borderRadius: 8, backgroundColor: '#2EB872', borderWidth: 2.5, borderColor: COLORS.white },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, fontSize: 18, fontWeight: '800', color: COLORS.ink },
  team: { fontSize: 13, fontWeight: '700' },
  time: { fontSize: 12, color: COLORS.muted },
  pill: { alignSelf: 'flex-start', borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3, marginTop: 2 },
  pillText: { fontSize: 11, fontWeight: '800' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.background, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  preview: { fontSize: 14, color: COLORS.muted },
  previewUnread: { color: COLORS.ink, fontWeight: '700' },
  newDot: { borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 },
  newText: { fontSize: 11, fontWeight: '800', color: COLORS.white },
  start: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: RADIUS.pill },
  startText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  earlierBox: { backgroundColor: COLORS.white, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 16 },
  earlierHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  earlierTitle: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  count: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.mist, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { fontSize: 12, fontWeight: '800', color: COLORS.muted },
  earlier: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  earlierIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  earlierName: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  earlierTeam: { fontSize: 13, fontWeight: '500', color: COLORS.muted },
  closed: { fontSize: 11, fontWeight: '800', color: COLORS.muted, backgroundColor: COLORS.mist, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
})
