import { createHash } from 'node:crypto';

/**
 * Security logging for the server routes: one JSON line per event (auth failures, refused requests,
 * rate-limit hits, bad webhook signatures, send outcomes), collected by the host's logs (Vercel).
 *
 * Never logs sign-in tokens, phone numbers, emails, message text or request bodies. Account IDs and
 * IPs are logged as short salted hashes, enough to see that the same caller keeps failing without
 * storing who they are. Set LOG_SALT in the environment to keep hashes stable but private.
 */
export type SecurityEvent =
  | 'auth.missing' | 'auth.invalid' | 'request.bad' | 'request.too_large' | 'request.forbidden' | 'request.not_found'
  | 'ratelimit.ip' | 'ratelimit.account' | 'webhook.bad_signature' | 'webhook.verify_failed' | 'webhook.ok'
  | 'whatsapp.sent' | 'whatsapp.skipped' | 'whatsapp.failed';

export const hashId = (v: string | null | undefined) =>
  v ? createHash('sha256').update(`${process.env.LOG_SALT ?? 'gather'}:${v}`).digest('hex').slice(0, 12) : '';

/** Removes anything that looks like a phone number, email or token from free text before it is logged or stored. */
export function redact(text: unknown, max = 200): string {
  return String(text ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s()-]{5,}\d/g, '[number]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
    .slice(0, max);
}

export function securityLog(event: SecurityEvent, fields: { route: string; uid?: string | null; ip?: string; reason?: string; status?: number; [k: string]: unknown }) {
  const { uid, ip, reason, ...rest } = fields;
  const line = {
    level: event.startsWith('whatsapp.sent') || event === 'webhook.ok' ? 'info' : 'warn',
    kind: 'security', event, at: new Date().toISOString(), ...rest,
    ...(uid ? { uid: hashId(uid) } : {}), ...(ip ? { ip: hashId(ip) } : {}), ...(reason ? { reason: redact(reason) } : {}),
  };
  (line.level === 'info' ? console.info : console.warn)(JSON.stringify(line));
}
