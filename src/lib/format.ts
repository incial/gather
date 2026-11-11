const LOCALE = 'en-IN';
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, o);

const valid = (iso?: string) => !!iso && !Number.isNaN(Date.parse(iso));
export const fmtDate = (iso?: string) => valid(iso) ? fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso!)) : '';
export const fmtDay = (iso?: string) => valid(iso) ? fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso!)) : '';
export const fmtTime = (iso?: string) => valid(iso) ? fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso!)) : '';
export const fmtDateTime = (iso?: string) => valid(iso) ? fmt({ day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso!)) : '';

export function fmtRange(a?: string, b?: string) {
  if (!valid(a)) return '';
  if (!valid(b) || new Date(a!).toDateString() === new Date(b!).toDateString()) return fmtDate(a);
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

/** ISO string to the value a datetime-local input expects, in local time. */
export function toLocalInput(iso?: string) {
  if (!valid(iso)) return '';
  const d = new Date(iso!);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');

export const initials = (name: string) =>
  name.replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

export function hue(id: string) {
  const colors = ['blue', 'amber', 'violet', 'lime', 'rose'] as const;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

export function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'That email and password don’t match.',
    'auth/wrong-password': 'That email and password don’t match.',
    'auth/user-not-found': 'No account with that email yet.',
    'auth/email-already-in-use': 'You already have an account. Sign in instead.',
    'auth/weak-password': 'Use at least 6 characters for your password.',
    'auth/invalid-email': 'That email doesn’t look right.',
    'auth/popup-closed-by-user': 'Sign-in was closed before it finished.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups and try again.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'permission-denied': 'You don’t have access to do that.',
    'unavailable': 'No connection. Check your internet and try again.',
  };
  return map[code] ?? (e as Error)?.message ?? 'Something went wrong.';
}
