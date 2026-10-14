import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, Check, CheckCheck, ImagePlus, Lock, Send, ShieldAlert, X } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PhotoViewer } from '@/components/PhotoViewer'
import { PremiumCard } from '@/components/Support'
import { Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import {
  MAX_MESSAGE_LENGTH,
  REPLY_TARGET_HOURS,
  TEAMS,
  isOpenStatus,
  isTeam,
  listMyChats,
  loadMessages,
  markRead,
  mergeMessages,
  pollThread,
  prepareImage,
  sendMessage,
  signImageUrls,
  startConversation,
  uploadImage,
  validateMessage,
  type Chat,
  type Team,
  type ThreadMessage,
} from '@/lib/chat'
import { usePlan } from '@/lib/plan'
import { COLORS, RADIUS } from '@/lib/theme'
import { messageOf } from '@/lib/trackers'
import { recountUnread } from '@/lib/useUnread'
import { useRealtime } from '@/lib/useRealtime'

/* ------------------------------------------------------------------
 * One conversation with the therapist or dietitian team, like the
 * website's (components/messages/SecureInbox.tsx): messages, photos and
 * read ticks, live through Realtime (polling as the fallback). With no
 * open conversation, the first message starts one (straight to the
 * employee's previous coach if they have room, else to the team's pool).
 * ------------------------------------------------------------------ */

interface Pending {
  key: string
  content: string
  image?: { uri: string; base64: string }
  imagePath?: string
  state: 'sending' | 'failed'
  error?: string
}

type Row = { kind: 'day'; key: string; label: string } | { kind: 'msg'; key: string; m: ThreadMessage } | { kind: 'pending'; key: string; p: Pending }

const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date()
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function Conversation() {
  const params = useLocalSearchParams<{ team: string; thread?: string }>()
  const team: Team = isTeam(params.team) ? params.team : 'therapist'
  const t = TEAMS[team]
  const plan = usePlan()
  const locked = !!plan && !plan.premium

  const [threadId, setThreadId] = useState<string | null>(params.thread ?? null)
  const [chat, setChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [image, setImage] = useState<{ uri: string; base64: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [focused, setFocused] = useState(true)
  /** The photo open full screen. */
  const [viewing, setViewing] = useState<string | null>(null)
  const threadRef = useRef(threadId)
  useEffect(() => {
    threadRef.current = threadId
  }, [threadId])

  // Which conversation: the one asked for, else this team's open one, else a new one.
  useEffect(() => {
    if (locked) return
    let alive = true
    ;(async () => {
      try {
        const chats = await listMyChats()
        if (!alive) return
        const found = params.thread ? chats.find((c) => c.id === params.thread) : chats.find((c) => c.team === team && isOpenStatus(c.status))
        setChat(found ?? null)
        setThreadId(found?.id ?? null)
        setMessages(found ? await loadMessages(found.id) : [])
      } catch (e) {
        if (alive) setNotice(messageOf(e))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [params.thread, team, locked])

  const poll = useCallback(async () => {
    const id = threadRef.current
    if (!id) return
    const newest = messages[messages.length - 1]?.created_at ?? null
    const { messages: fresh, status, receipts } = await pollThread(id, newest)
    if (threadRef.current !== id) return
    if (fresh.length) setMessages((cur) => mergeMessages(cur, fresh))
    if (status || receipts) setChat((c) => (c ? { ...c, ...(status ? { status } : {}), ...(receipts ?? {}) } : c))
    // A coach just picked it up: fetch their name.
    if (status && chat && status !== chat.status) listMyChats().then((cs) => setChat(cs.find((c) => c.id === id) ?? null), () => {})
  }, [messages, chat])

  // Live: Realtime nudges a check; polling every 5 s only if it's down, else a check a minute as a safety net.
  const live = useRealtime(
    threadId
      ? [
          { table: 'thread_messages', event: '*', filter: `thread_id=eq.${threadId}` },
          { table: 'therapist_threads', event: 'UPDATE', filter: `id=eq.${threadId}` },
        ]
      : null,
    () => void poll().catch(() => {}),
  )
  const pollRef = useRef(poll)
  useEffect(() => {
    pollRef.current = poll
  })
  useEffect(() => {
    if (!threadId || !focused) return
    const timer = setInterval(() => AppState.currentState === 'active' && void pollRef.current().catch(() => {}), live ? 60_000 : 5_000)
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void pollRef.current().catch(() => {}))
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [threadId, focused, live])

  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )

  // On screen: the coach's messages count as read (the database ignores calls with nothing new).
  const lastIncoming = [...messages].reverse().find((m) => m.sender_role === 'therapist')?.id
  useEffect(() => {
    if (!threadId || !focused || !lastIncoming) return
    markRead(threadId)
    const t = setTimeout(recountUnread, 800)
    return () => clearTimeout(t)
  }, [threadId, focused, lastIncoming])

  // Private images get short-lived links.
  const imagePaths = useMemo(() => messages.flatMap((m) => (m.media_url ? [m.media_url] : [])), [messages])
  useEffect(() => {
    const missing = imagePaths.filter((p) => !urls.has(p))
    if (!missing.length) return
    signImageUrls(missing).then((fresh) => fresh.size && setUrls((cur) => new Map([...cur, ...fresh])))
  }, [imagePaths, urls])

  async function pickImage() {
    setNotice(null)
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1, allowsMultipleSelection: false })
    if (res.canceled || !res.assets[0]) return
    const a = res.assets[0]
    try {
      setImage(await prepareImage(a.uri, a.width, a.height))
    } catch (e) {
      setNotice(messageOf(e))
    }
  }

  async function deliver(p: Pending) {
    setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, state: 'sending', error: undefined } : x)))
    try {
      let id = threadRef.current
      const saved: ThreadMessage[] = []
      let textSent = false
      if (!id) {
        // The first message opens the conversation (it's saved as part of it).
        const started = await startConversation(team, p.content)
        id = started.threadId
        threadRef.current = id
        setThreadId(id)
        setChat({ id, team, status: started.status, created_at: new Date().toISOString(), last: null, coach_name: null, coach_title: null, coach_online: false })
        textSent = true
        if (started.assigned) listMyChats().then((cs) => setChat(cs.find((c) => c.id === id) ?? null), () => {})
      }
      let imagePath = p.imagePath
      if (p.image && !imagePath) {
        imagePath = await uploadImage(id, p.image.base64)
        setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, imagePath } : x)))
      }
      if (!textSent) saved.push(await sendMessage(id, p.content, imagePath))
      else if (imagePath) saved.push(await sendMessage(id, '', imagePath))
      const all = textSent ? await loadMessages(id) : saved
      setPending((ps) => ps.filter((x) => x.key !== p.key))
      setMessages((cur) => mergeMessages(cur, all))
    } catch (e) {
      setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, state: 'failed', error: messageOf(e) } : x)))
    }
  }

  function send() {
    const parsed = validateMessage(draft, !!image)
    if (!parsed.ok) return setNotice(parsed.error)
    if (!threadRef.current && !parsed.value) return setNotice('Write a few words to start the conversation. You can add the photo too.')
    setNotice(null)
    const p: Pending = { key: `p-${Date.now()}`, content: parsed.value, image: image ?? undefined, state: 'sending' }
    setPending((ps) => [...ps, p])
    setDraft('')
    setImage(null)
    void deliver(p)
  }

  // Newest at the bottom: the list is inverted, so rows go newest first.
  const rows = useMemo(() => {
    const out: Row[] = []
    let day = ''
    for (const m of messages) {
      const d = new Date(m.created_at).toDateString()
      if (d !== day) {
        day = d
        out.push({ kind: 'day', key: `d-${d}`, label: dayLabel(m.created_at) })
      }
      out.push({ kind: 'msg', key: m.id, m })
    }
    for (const p of pending) out.push({ kind: 'pending', key: p.key, p })
    return out.reverse()
  }, [messages, pending])

  const open = !chat || isOpenStatus(chat.status)
  const lastMine = [...messages].reverse().find((m) => m.sender_role === 'user')
  const tick = (m: ThreadMessage) => {
    if (m.id !== lastMine?.id) return null
    if (chat?.coach_read_at && chat.coach_read_at >= m.created_at) return 'read'
    if (chat?.coach_delivered_at && chat.coach_delivered_at >= m.created_at) return 'delivered'
    return 'sent'
  }
  const statusLine = !chat ? `Usually replies within ${REPLY_TARGET_HOURS} hours` : !open ? 'Closed' : chat.status === 'unassigned' ? `Waiting for the next available ${t.label.toLowerCase()}` : chat.coach_online ? 'Online now' : `Usually replies within ${REPLY_TARGET_HOURS} hours`

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PhotoViewer uri={viewing} onClose={() => setViewing(null)} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={24} color={COLORS.ink} />
        </Pressable>
        <View style={[styles.avatar, { backgroundColor: t.tint }]}>
          <Text style={[styles.avatarText, { color: t.accent }]}>{(chat?.coach_name ?? t.label).slice(0, 1)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>
            {chat?.coach_name ?? t.label}
          </Text>
          <Text style={[styles.headerStatus, { color: t.accent }]} numberOfLines={1}>
            {chat?.coach_name ? `${t.label} · ` : ''}
            {statusLine}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/support')} style={styles.help} accessibilityRole="button" accessibilityLabel="Need help now?">
          <ShieldAlert size={16} color="#C42B1C" />
          <Text style={styles.helpText}>Help</Text>
        </Pressable>
      </View>
      <View style={styles.privacy}>
        <Lock size={13} color={COLORS.muted} />
        <Text style={styles.privacyText}>Private to you and your {t.label.toLowerCase()}. Not for emergencies.</Text>
      </View>

      {locked ? (
        <View style={{ padding: 16 }}>
          <PremiumCard title={`Chat with your ${t.label.toLowerCase()}`} text="Private messages with the wellness team, with photos and read receipts, are part of Premium." />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {loading ? (
            <Loader label="Loading your conversation…" />
          ) : (
            <FlatList
              inverted
              data={rows}
              keyExtractor={(r) => r.key}
              contentContainerStyle={styles.list}
              keyboardDismissMode="interactive"
              ListFooterComponent={
                !threadId ? (
                  <View style={styles.intro}>
                    <Text style={styles.introTitle}>Start a conversation with a {t.label.toLowerCase()}</Text>
                    <Text style={styles.introText}>{t.intro}</Text>
                  </View>
                ) : null
              }
              renderItem={({ item }) => {
                if (item.kind === 'day') return <Text style={styles.day}>{item.label}</Text>
                if (item.kind === 'pending') {
                  const p = item.p
                  return (
                    <Pressable onPress={() => (p.state === 'failed' ? void deliver(p) : p.image && setViewing(p.image.uri))} style={[styles.bubble, styles.mine, { opacity: 0.75 }]} accessibilityRole="button">
                      {p.image && <Image source={{ uri: p.image.uri }} style={styles.photo} contentFit="cover" />}
                      {!!p.content && <Text style={styles.mineText}>{p.content}</Text>}
                      <Text style={[styles.meta, styles.mineMeta]}>{p.state === 'sending' ? 'Sending…' : `Not sent: ${p.error ?? 'try again'}. Tap to retry.`}</Text>
                    </Pressable>
                  )
                }
                const m = item.m
                const mine = m.sender_role === 'user'
                const url = m.media_url ? urls.get(m.media_url) : null
                const ticks = mine ? tick(m) : null
                return (
                  <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                    {m.media_url &&
                      (url ? (
                        <Pressable onPress={() => setViewing(url)} accessibilityRole="imagebutton" accessibilityLabel="Photo. Open full screen">
                          <Image source={{ uri: url }} style={styles.photo} contentFit="cover" />
                        </Pressable>
                      ) : (
                        <View style={[styles.photo, styles.photoLoading]} />
                      ))}
                    {!!m.content && <Text style={mine ? styles.mineText : styles.theirsText}>{m.content}</Text>}
                    <View style={styles.metaRow}>
                      <Text style={[styles.meta, mine && styles.mineMeta]}>{timeOf(m.created_at)}</Text>
                      {ticks === 'read' && <CheckCheck size={14} color="#9BE7FF" accessibilityLabel="Read" />}
                      {ticks === 'delivered' && <CheckCheck size={14} color="rgba(255,255,255,0.7)" accessibilityLabel="Delivered" />}
                      {ticks === 'sent' && <Check size={14} color="rgba(255,255,255,0.7)" accessibilityLabel="Sent" />}
                    </View>
                  </View>
                )
              }}
            />
          )}

          {notice && (
            <View style={{ paddingHorizontal: 12 }}>
              <Notice tone="error">{notice}</Notice>
            </View>
          )}

          {open ? (
            <View style={styles.composer}>
              {image && (
                <View style={styles.attached}>
                  <Pressable onPress={() => setViewing(image.uri)} accessibilityRole="imagebutton" accessibilityLabel="Preview photo">
                    <Image source={{ uri: image.uri }} style={styles.attachedImg} contentFit="cover" />
                  </Pressable>
                  <Text style={styles.attachedText}>Photo ready to send</Text>
                  <Pressable onPress={() => setImage(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove photo">
                    <X size={18} color={COLORS.muted} />
                  </Pressable>
                </View>
              )}
              <View style={styles.inputRow}>
                <Pressable onPress={() => void pickImage()} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Add a photo">
                  <ImagePlus size={22} color={COLORS.muted} />
                </Pressable>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={chat?.coach_name ? `Write to ${chat.coach_name.split(' ')[0]}…` : `Write to a ${t.label.toLowerCase()}…`}
                  placeholderTextColor={`${COLORS.muted}99`}
                  multiline
                  maxLength={MAX_MESSAGE_LENGTH}
                  style={styles.input}
                  accessibilityLabel="Message"
                />
                <Pressable onPress={send} disabled={!draft.trim() && !image} style={({ pressed }) => [styles.send, { backgroundColor: t.accent }, (!draft.trim() && !image) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel="Send">
                  <Send size={18} color={COLORS.white} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.closed}>
              <Text style={styles.closedText}>This conversation is closed.</Text>
              <Pressable onPress={() => router.replace(`/chat/${team}`)} style={[styles.newBtn, { backgroundColor: COLORS.ink }]} accessibilityRole="button">
                <Text style={styles.newBtnText}>Start a new conversation</Text>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.white, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.line },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800' },
  headerName: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  headerStatus: { fontSize: 13, fontWeight: '600' },
  help: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 34, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: '#F3B8B0' },
  helpText: { fontSize: 13, fontWeight: '800', color: '#C42B1C' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.mist },
  privacyText: { fontSize: 12, color: COLORS.muted },
  list: { padding: 12, gap: 6 },
  intro: { margin: 12, padding: 16, borderRadius: RADIUS.card, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, gap: 6 },
  introTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  introText: { fontSize: 14, lineHeight: 20, color: COLORS.muted },
  day: { alignSelf: 'center', marginVertical: 8, fontSize: 12, fontWeight: '700', color: COLORS.muted, backgroundColor: COLORS.white, paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.pill, overflow: 'hidden' },
  bubble: { maxWidth: '82%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, gap: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: COLORS.ink, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderBottomLeftRadius: 6 },
  mineText: { fontSize: 16, lineHeight: 22, color: COLORS.white },
  theirsText: { fontSize: 16, lineHeight: 22, color: COLORS.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  meta: { fontSize: 11, color: COLORS.muted },
  mineMeta: { color: 'rgba(255,255,255,0.7)' },
  photo: { width: 220, height: 220, borderRadius: 14 },
  photoLoading: { backgroundColor: COLORS.mist },
  composer: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, backgroundColor: COLORS.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line, gap: 8 },
  attached: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  attachedImg: { width: 44, height: 44, borderRadius: 10 },
  attachedText: { flex: 1, fontSize: 13, color: COLORS.muted },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  iconBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.background, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: COLORS.ink },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  closed: { padding: 16, gap: 10, alignItems: 'center', backgroundColor: COLORS.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  closedText: { fontSize: 14, color: COLORS.muted },
  newBtn: { minHeight: 46, borderRadius: RADIUS.pill, paddingHorizontal: 20, justifyContent: 'center' },
  newBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
})
