/**
 * Rate limits for the app's own server routes.
 *
 * Two layers:
 * - `burst()`: an in-memory sliding window per key (usually the caller's IP), checked before any
 *   expensive work such as verifying a sign-in token. It is per server instance, so on Vercel each
 *   instance counts on its own; it stops floods, not a slow, spread-out abuser.
 * - `decide()`: the pure rule behind the durable per-account limit kept in Firestore
 *   (`rateLimits/{key}`, see whatsapp.ts), which holds across instances and restarts.
 *
 * No Firebase or Next imports here, so it can be unit tested.
 */

export interface Limit { max: number; windowMs: number }

/** Whether one more hit is allowed given earlier hit times (ms), and the list to store if so. */
export function decide(hits: number[], now: number, limits: Limit[]): { ok: boolean; retryAfterMs: number; next: number[] } {
  const longest = Math.max(...limits.map((l) => l.windowMs));
  const recent = hits.filter((t) => typeof t === 'number' && t > now - longest && t <= now).sort((a, b) => a - b);
  let retryAfterMs = 0;
  for (const l of limits) {
    const inWindow = recent.filter((t) => t > now - l.windowMs);
    if (inWindow.length >= l.max) retryAfterMs = Math.max(retryAfterMs, inWindow[inWindow.length - l.max] + l.windowMs - now);
  }
  if (retryAfterMs > 0) return { ok: false, retryAfterMs, next: recent };
  // Keep only as many entries as the largest limit needs, so the stored list stays small.
  const keep = Math.max(...limits.map((l) => l.max));
  return { ok: true, retryAfterMs: 0, next: [...recent, now].slice(-keep) };
}

const windows = new Map<string, number[]>();
let lastSweep = 0;

/** In-memory limit: true if this hit is allowed. Old keys are swept so memory stays bounded. */
export function burst(key: string, limit: Limit, now = Date.now()): { ok: boolean; retryAfterMs: number } {
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, v] of windows) if (!v.length || v[v.length - 1] <= now - 10 * 60_000) windows.delete(k);
    // Hard cap in case of a flood of distinct keys.
    if (windows.size > 50_000) windows.clear();
  }
  const r = decide(windows.get(key) ?? [], now, [limit]);
  windows.set(key, r.next);
  return { ok: r.ok, retryAfterMs: r.retryAfterMs };
}

/** Test helper. */
export function resetBursts() { windows.clear(); lastSweep = 0; }

/** The caller's IP as the hosting platform reports it (first entry of x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return (headers.get('x-forwarded-for')?.split(',')[0] ?? headers.get('x-real-ip') ?? '').trim() || 'unknown';
}

/** Limits used by the routes, in one place. */
export const LIMITS = {
  /** /api/meetping/notify per IP: generous for a shared hall Wi-Fi, still stops floods. */
  notifyPerIp: { max: 60, windowMs: 60_000 },
  /** WhatsApp alerts one account can trigger (each one is a paid message to another person). */
  waPerSender: [{ max: 10, windowMs: 3600_000 }, { max: 40, windowMs: 24 * 3600_000 }],
  /** /api/whatsapp/webhook per IP (Meta sends status updates in bursts). */
  webhookPerIp: { max: 600, windowMs: 60_000 },
} satisfies Record<string, Limit | Limit[]>;
