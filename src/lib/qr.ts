/** Every scannable code is a normal link, so a phone's own camera opens the app too. */
const origin = () => window.location.origin;

export const joinUrl = (code: string) => `${origin()}/join/${code}`;
/** The event's own link. Event IDs are long and random, so this works as a private invite link. */
export const eventUrl = (eventId: string) => `${origin()}/e/${eventId}`;
export const speakerUrl = (eventId: string, speakerId: string) => `${origin()}/e/${eventId}/connect/${speakerId}`;
export const checkInUrl = (eventId: string, sessionId: string, key: string) => `${origin()}/e/${eventId}/c/${sessionId}?k=${key}`;
/** Old pass format (account ID). Still accepted when scanning. */
export const passCode = (eventId: string, uid: string) => `GATHER-PASS:${eventId}:${uid}`;
/** Current pass format: a random registration ID, so the QR holds no personal details. */
export const passCodeFor = (eventId: string, regId: string) => `GATHER-PASS:${eventId}:R:${regId}`;

/**
 * Turns scanned text into an in-app route. Only this app's own routes are
 * accepted, so a stray QR code can't send anyone to another website.
 */
export function routeFromScan(text: string, appOrigin: string): string | null {
  let url: URL;
  try { url = new URL(text.trim()); } catch { return null; }
  if (url.origin !== appOrigin) return null;
  const ok = /^\/join\/[\w-]+$/.test(url.pathname)
    || /^\/e\/[\w-]+\/connect\/[\w-]+$/.test(url.pathname)
    || /^\/e\/[\w-]+\/c\/[\w-]+$/.test(url.pathname);
  return ok ? url.pathname + url.search : null;
}

export function parsePass(text: string, eventId: string): string | null {
  const m = /^GATHER-PASS:([^:]+):(.+)$/.exec(text.trim());
  return m && m[1] === eventId && !m[2].startsWith('R:') ? m[2] : null;
}

/** Reads any Gather pass: which event, and either the registration ID (new) or account ID (old). */
export function readPass(text: string): { eventId: string; regId?: string; uid?: string } | null {
  const m = /^GATHER-PASS:([\w-]+):(?:R:([A-Z0-9]{4}-[A-Z0-9]{4})|([\w-]+))$/.exec(text.trim());
  if (!m) return null;
  return m[2] ? { eventId: m[1], regId: m[2] } : { eventId: m[1], uid: m[3] };
}
