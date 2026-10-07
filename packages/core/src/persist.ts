/**
 * Browser-storage key prefix. Deliberately still "tidewell:": renaming it
 * would silently drop existing users' saved settings (weight unit, a
 * pending profile photo awaiting email confirmation, timezone sync).
 */
export const STORAGE_PREFIX = 'tidewell:'
export const storageKey = (name: string) => `${STORAGE_PREFIX}${name}`
