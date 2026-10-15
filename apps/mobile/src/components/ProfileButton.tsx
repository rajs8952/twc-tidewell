import type { Profile } from '@rajs8952/core/types'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { loadProfile } from '@/lib/profile'
import { COLORS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * The round profile photo at the top right of the tab screens: it opens
 * the profile (the Me tab). Initials until a photo is set. It reuses the
 * profile already loaded (lib/profile.ts), so it costs no extra request.
 * ------------------------------------------------------------------ */

export const initialsOf = (name: string | undefined) =>
  (name ?? '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

export function ProfileButton({ profile, size = 42 }: { profile?: Profile | null; size?: number }) {
  const [loaded, setLoaded] = useState<Profile | null>(null)
  // Re-read on focus: a new photo from the profile screen shows straight away.
  useFocusEffect(
    useCallback(() => {
      let alive = true
      loadProfile().then(
        (p) => alive && setLoaded(p),
        () => {},
      )
      return () => {
        alive = false
      }
    }, []),
  )
  const me = profile ?? loaded
  const initials = initialsOf(me?.full_name)
  const ring = { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }
  const circle = { width: size, height: size, borderRadius: size / 2 }

  return (
    <Pressable
      onPress={() => router.navigate('/profile')}
      hitSlop={8}
      style={({ pressed }) => [styles.ring, ring, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel="Your profile"
    >
      {me?.avatar_url ? (
        <Image source={{ uri: me.avatar_url }} style={circle} contentFit="cover" transition={150} />
      ) : (
        <View style={[circle, styles.empty]}>
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="avatarFill" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#2189D6" />
                <Stop offset="1" stopColor="#7C6BD6" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={size} height={size} fill="url(#avatarFill)" />
          </Svg>
          <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials || '?'}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  ring: { backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#0F2F37', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  empty: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '800', color: COLORS.white, letterSpacing: 0.5 },
})
