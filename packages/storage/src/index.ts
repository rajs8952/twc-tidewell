/* Ready-made TrackerStorage adapters. The Supabase one is on its own subpath, '@rajs8952/storage/supabase'. */
export { createLocalStorage, type LocalStorageOptions } from './local'
export { createMemoryStorage, DEFAULT_PROFILE, type MemoryStorage, type MemoryStorageOptions, type StorageSnapshot } from './memory'
export { createRestStorage, type RestStorageOptions } from './rest'
