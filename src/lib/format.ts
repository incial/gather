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

// Both take `string | null | undefined`: some records (older ones, or people who never set a name) have no
// name or id, and an avatar must never crash the whole screen because of that.
export const initials = (name?: string | null) =>
  String(name ?? '').trim().replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export function hue(id?: string | null) {
  const colors = ['blue', 'amber', 'violet', 'lime', 'rose'] as const;
  let h = 0;
  for (const c of String(id ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
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
    'auth/cancelled-popup-request': 'Sign-in is already open in another window. Finish it there, or close it and try again.',
    'auth/unauthorized-domain': 'Sign-in isn’t allowed from this web address. Open the app at gatherapp-ten.vercel.app.',
    'auth/web-storage-unsupported': 'Your browser is blocking the storage sign-in needs (private mode or blocked cookies). Try a normal Chrome or Safari window.',
    'auth/operation-not-supported-in-this-environment': 'Sign-in doesn’t work inside this app’s browser. Open the link in Chrome or Safari.',
    'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
    'auth/user-disabled': 'This account has been turned off. Contact the organiser.',
    'auth/internal-error': 'Google sign-in didn’t finish. Try again, or open the app in Chrome or Safari.',
    'auth/timeout': 'Sign-in took too long. Check your connection and try again.',
    'permission-denied': 'You don’t have access to do that.',
    'unavailable': 'No connection. Check your internet and try again.',
  };
  return map[code] ?? (e as Error)?.message ?? 'Something went wrong.';
}
