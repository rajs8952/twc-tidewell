import { StatusBar } from 'expo-status-bar'
import { Image } from 'expo-image'
import { X } from 'lucide-react-native'
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

/**
 * A chat photo, full screen on black. Pinch to zoom on iPhone (the scroll
 * view zooms); close with ✕ or the Android back button.
 */
export function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions()
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SafeAreaView style={styles.wrap} edges={['top', 'bottom']}>
          <View style={styles.bar}>
            <Pressable onPress={onClose} style={styles.close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close photo">
              <X size={24} color="#FFFFFF" />
            </Pressable>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.center}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            {uri && <Image source={{ uri }} style={{ width, height: height * 0.75 }} contentFit="contain" accessibilityLabel="Photo" />}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000000' },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
})
