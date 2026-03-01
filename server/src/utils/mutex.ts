/**
 * Directory-level async mutex.
 *
 * Uses a Map<string, Promise<void>> where the key is the canonical
 * (resolved) directory path. Each acquire() chains a new promise onto
 * the existing one, guaranteeing serial execution per directory.
 *
 * Node.js is single-threaded, so the Map lookup + insert is inherently
 * atomic — no CAS or kernel lock needed.
 */

const locks = new Map<string, Promise<void>>();

/**
 * Acquire an exclusive lock for the given directory path.
 * Returns an unlock() function that MUST be called when done.
 *
 * @param canonicalPath - Already resolved via fs.realpath (caller's responsibility)
 * @returns A release function
 */
export async function acquireDirectoryLock(canonicalPath: string): Promise<() => void> {
  const key = canonicalPath.toLowerCase();

  let resolveCurrent!: () => void;
  const currentPromise = new Promise<void>((resolve) => {
    resolveCurrent = resolve;
  });

  const previous = locks.get(key) ?? Promise.resolve();
  locks.set(key, currentPromise);

  await previous;

  return () => {
    resolveCurrent();
    if (locks.get(key) === currentPromise) {
      locks.delete(key);
    }
  };
}

/** Test helper: clear all locks. */
export function _resetLocksForTest(): void {
  locks.clear();
}
