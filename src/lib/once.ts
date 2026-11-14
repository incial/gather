/** True at most once per `ms` for this key on this device (and always when storage is unavailable). */
export function dueEvery(key: string, ms: number) {
  try {
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < ms) return false;
    localStorage.setItem(key, String(Date.now()));
  } catch { /* private mode */ }
  return true;
}

/** How often the "tidy away copies of deleted events" checks run (each one reads every listed event once). */
export const TIDY_EVERY_MS = 24 * 3600_000;
