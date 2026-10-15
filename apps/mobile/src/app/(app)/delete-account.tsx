import * as SecureStore from 'expo-secure-store'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Card, Muted, TrackerScreen } from '@/components/kit'
import { Button, Field, Notice } from '@/components/ui'
import { useSession } from '@/lib/auth'
import { clearPlan } from '@/lib/plan'
import { clearProfile } from '@/lib/profile'
import { supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/theme'
import { messageOf } from '@/lib/trackers'
import { callWebsite } from '@/lib/website'

/* ------------------------------------------------------------------
 * Delete my account (required by the App Store and Google Play). The
 * website's server does it (app/api/mobile/delete-account): a paid plan is
 * cancelled first, then the person's photos and the account itself, with
 * everything that belongs to it. Typing DELETE confirms.
 * ------------------------------------------------------------------ */

export default function DeleteAccount() {
  const { session } = useSession()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = typed.trim().toUpperCase() === 'DELETE'

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await callWebsite('/api/mobile/delete-account', { confirm: 'DELETE' })
      // The account is gone: forget it on this phone (its notifications went with it).
      await SecureStore.deleteItemAsync('omniwell.push-token').catch(() => {})
      clearProfile()
      clearPlan()
      await supabase.auth.signOut({ scope: 'local' })
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }

  return (
    <TrackerScreen title={'Delete account'}>
      <Card>
        <Text style={styles.title}>This permanently deletes your OmniWell account</Text>
        <Muted>{session?.user.email}</Muted>
        <View style={styles.list}>
          {[
            'Everything you’ve logged in all six trackers',
            'Your conversations with the wellness team, and their photos',
            'Your profile, photo, goals, programmes and reminders',
          ].map((line) => (
            <Text key={line} style={styles.item}>
              •  {line}
            </Text>
          ))}
        </View>
        <Muted>It can’t be undone, on this phone or on the website. If you pay for Premium yourself, your plan is cancelled first and you won’t be charged again.</Muted>
      </Card>

      <Card>
        <Field
          label="Type DELETE to confirm"
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          // Not a name, email or password: keep iOS AutoFill out (its prompt made the keyboard flicker closed).
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button title="Delete my account" onPress={() => void remove()} busy={busy} disabled={!ready} />
      </Card>
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: COLORS.alert },
  list: { gap: 4 },
  item: { fontSize: 15, lineHeight: 21, color: COLORS.ink },
})
