import NetInfo from '@react-native-community/netinfo'
import { useEffect, useState } from 'react'

/** Whether the phone is online (true until known; "connected but no internet" counts as offline). */
export function useOnline() {
  const [online, setOnline] = useState(true)
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setOnline(s.isConnected !== false && s.isInternetReachable !== false)
      }),
    [],
  )
  return online
}
