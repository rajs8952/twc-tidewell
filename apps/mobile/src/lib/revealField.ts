import { createContext, use, useRef, type RefObject } from 'react'
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, type View } from 'react-native'

/* ------------------------------------------------------------------
 * Keeps the field being typed in above the keyboard: when it gains focus
 * and the keyboard is up, the screen's ScrollView scrolls just enough to
 * show it, with a little room below. No state changes (re-rendering while
 * the keyboard opens made iOS close it again), only a scroll.
 * ------------------------------------------------------------------ */

const ROOM = 24

interface Scroller {
  scrollRef: RefObject<ScrollView | null>
  offset: RefObject<number>
}

const ScrollerContext = createContext<Scroller | null>(null)
export const ScrollerProvider = ScrollerContext

/** For a screen's ScrollView: its ref, the scroll position, and the handler that tracks it. */
export function useScroller(outer?: RefObject<ScrollView | null>) {
  const own = useRef<ScrollView | null>(null)
  const scrollRef = outer ?? own
  const offset = useRef(0)
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y
  }
  return { scroller: { scrollRef, offset } as Scroller, scrollRef, onScroll }
}

/** For a field: call with its wrapper's ref when it gains focus. */
export function useRevealOnFocus() {
  const scroller = use(ScrollerContext)
  return (field: RefObject<View | null>) => {
    if (!scroller) return
    const reveal = (keyboardTop: number) => {
      field.current?.measureInWindow((_x, y, _w, h) => {
        const overlap = y + h + ROOM - keyboardTop
        if (overlap > 0) scroller.scrollRef.current?.scrollTo({ y: scroller.offset.current + overlap, animated: true })
      })
    }
    const shown = Keyboard.isVisible() ? Keyboard.metrics() : null
    if (shown) {
      // Moving between fields with the keyboard already up.
      reveal(shown.screenY)
      return
    }
    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      sub.remove()
      // Let the screen finish making room for the keyboard first.
      setTimeout(() => reveal(e.endCoordinates.screenY), 60)
    })
    setTimeout(() => sub.remove(), 1500)
  }
}
