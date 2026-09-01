import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistence port. The app depends on this interface, never on AsyncStorage
 * directly, so storage can be swapped or faked in tests.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const asyncStorageAdapter: KeyValueStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

/**
 * A typed JSON slot on top of a KeyValueStore.
 *
 * `decode` is responsible for turning arbitrary stored JSON into a valid value:
 * persisted data outlives the schema that wrote it, so a slot from an older
 * build must degrade to defaults rather than crash the app on launch.
 */
export function jsonSlot<T>(
  store: KeyValueStore,
  key: string,
  decode: (raw: unknown) => T,
) {
  async function clear(): Promise<void> {
    try {
      await store.remove(key);
    } catch {
      // Same rationale as save().
    }
  }

  /**
   * A read that failed and a value that will not parse are two different
   * problems, and collapsing them into one catch was wrong in both directions.
   *
   * The store can be unhappy for reasons that say nothing about what is in it —
   * a full disk, a database mid-recovery, no native module at all — and
   * dropping the key on one of those turns a bad morning into permanently lost
   * settings. A value that does not parse will not parse on the next launch
   * either, so that one is removed: leaving it meant a device that had been
   * interrupted mid-write once fell back to defaults on every boot from then
   * on, with no way out short of reinstalling.
   */
  async function load(): Promise<T> {
    let raw: string | null;
    try {
      raw = await store.get(key);
    } catch {
      return decode(undefined);
    }

    if (raw === null) return decode(undefined);

    try {
      return decode(JSON.parse(raw));
    } catch {
      // Awaited, not left running: the removal must not land after the first
      // save of the fresh defaults and take that with it.
      await clear();
      return decode(undefined);
    }
  }

  async function save(value: T): Promise<void> {
    try {
      await store.set(key, JSON.stringify(value));
    } catch {
      // Persistence is best-effort; a failed write must not break the UI.
    }
  }

  return { load, save, clear };
}
