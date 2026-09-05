// Serializes one user's read/modify/write operations without blocking other users.
// Locks are process-local; the file-backed service must run as a single writer.
export function createKeyedLock() {
  const tails = new Map();

  async function acquire(key) {
    const previous = tails.get(key) || Promise.resolve();
    let unlock;
    const current = new Promise((resolve) => { unlock = resolve; });
    tails.set(key, current);
    await previous;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (tails.get(key) === current) tails.delete(key);
      unlock();
    };
  }

  async function run(key, action) {
    const release = await acquire(key);
    try {
      return await action();
    } finally {
      release();
    }
  }

  return { acquire, run, get size() { return tails.size; } };
}
