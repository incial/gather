import { backend } from './backend';
import type { PublicProfile } from './profile';
import type { AppUser } from './types';

/**
 * Public usernames (@handle). Each one is a document `usernames/{handle}` holding the owner's
 * account ID, so two people can never hold the same one: whoever saves first gets it, and the
 * security rules refuse the second. The account ID never changes when the username does.
 */
export const USERNAME_RE = /^[a-z0-9][a-z0-9_.]{2,19}$/;
export const cleanUsername = (raw: string) => raw.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);

export function usernameProblem(h: string): string {
  if (h.length < 3) return 'At least 3 characters.';
  if (!/^[a-z0-9]/.test(h)) return 'Start with a letter or number.';
  if (!USERNAME_RE.test(h)) return 'Use letters, numbers, dots and underscores.';
  return '';
}

/** A starting point from a name: "Dr. Abidh Habeeb" → "abidhhabeeb". */
export function baseFromName(name: string) {
  const s = name.toLowerCase().replace(/^(dr|prof|mr|ms|mrs)\.?\s+/, '').normalize('NFKD').replace(/[^a-z0-9]/g, '').slice(0, 16);
  return s.length >= 3 ? s : `user${s}`.slice(0, 16).padEnd(4, '0');
}

export async function isFree(h: string, uid?: string) {
  const d = await backend.getDoc<{ uid: string }>(`usernames/${h}`);
  return !d || (!!uid && d.uid === uid);
}

/** Up to `n` free alternatives close to what was asked for. */
export async function suggestions(want: string, n = 3): Promise<string[]> {
  const base = (cleanUsername(want) || 'user').slice(0, 16).replace(/[._]+$/, '') || 'user';
  const year = String(new Date().getFullYear()).slice(2);
  const tries = [`${base}${year}`, `${base}_`, `${base}.in`, ...Array.from({ length: 6 }, () => `${base}${10 + Math.floor(Math.random() * 990)}`)]
    .map((t) => t.slice(0, 20)).filter((t, i, a) => USERNAME_RE.test(t) && a.indexOf(t) === i);
  const out: string[] = [];
  for (const t of tries) {
    if (out.length >= n) break;
    if (await isFree(t).catch(() => false)) out.push(t);
  }
  return out;
}

/** Claims a username and releases the old one, in one step. Fails if someone else just took it. */
export async function claimUsername(uid: string, next: string, previous?: string) {
  if (next === previous) return;
  await backend.write([
    { type: 'set', path: `usernames/${next}`, data: { uid, at: backend.now() } },
    { type: 'set', path: `profiles/${uid}`, merge: true, data: { username: next } },
    ...(previous ? [{ type: 'delete' as const, path: `usernames/${previous}` }] : []),
  ]);
}

/** Gives a profile without a username one, based on the name, trying a few if taken. */
export async function ensureUsername(user: AppUser, p: Pick<PublicProfile, 'name' | 'username'>) {
  if (p.username) return p.username;
  const base = baseFromName(p.name || user.name || user.email.split('@')[0]);
  const options = [base, ...(await suggestions(base, 4))];
  for (const h of options) {
    if (!(await isFree(h).catch(() => false))) continue;
    try { await claimUsername(user.uid, h); return h; } catch { /* taken a moment ago: try the next */ }
  }
  return '';
}
