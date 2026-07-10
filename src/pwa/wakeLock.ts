let lock: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator && !lock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        lock = null;
      });
    }
  } catch {
    /* wake lock not available */
  }
}

export function releaseWakeLock(): void {
  void lock?.release();
  lock = null;
}
