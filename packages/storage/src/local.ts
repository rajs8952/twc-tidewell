import { createMemoryStorage, type MemoryStorage, type StorageSnapshot } from './memory'

export interface LocalStorageOptions {
  /** Storage key. Default 'omniwell:trackers'. */
  key?: string
  /** Data to start from when nothing has been saved yet. */
  initial?: Partial<StorageSnapshot>
  /** Where to persist; defaults to window.localStorage. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}

function read(storage: LocalStorageOptions['storage'], key: string): Partial<StorageSnapshot> | undefined {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? 'null')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * MemoryStorage saved to the browser after every change, so data survives
 * reloads on this device. If storage is unavailable (private mode, quota),
 * it keeps working in memory for the session.
 */
export function createLocalStorage(options: LocalStorageOptions = {}): MemoryStorage {
  const key = options.key ?? 'omniwell:trackers'
  const storage = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  return createMemoryStorage({
    initial: read(storage, key) ?? options.initial,
    onChange: (snapshot) => {
      try {
        storage?.setItem(key, JSON.stringify(snapshot))
      } catch {
        // Quota or privacy settings: keep going in memory.
      }
    },
  })
}
