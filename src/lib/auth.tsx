'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { backend } from './backend';
import { resetLive } from './live';
import { forgetSummaries } from './summaries';
import { ensureProfile } from './profile';
import type { AppUser } from './types';

/** The Master Admin: full control of the platform. Also built into the security rules. */
export const MASTER_ADMIN = 'toincial@gmail.com';

const SYNC_KEY = (uid: string) => `gather-synced-${uid}`;
const fingerprint = (u: AppUser) => `${u.name}|${u.photo ?? ''}|${new Date().toISOString().slice(0, 10)}`;
function needsSync(u: AppUser) { try { return localStorage.getItem(SYNC_KEY(u.uid)) !== fingerprint(u); } catch { return true; } }
function markSynced(u: AppUser) { try { localStorage.setItem(SYNC_KEY(u.uid), fingerprint(u)); } catch { /* private mode */ } }

/** Remembered on this device so the next visit doesn't wait on a database lookup before showing anything.
 * The security rules decide what a super admin can really do; this only picks which screens to show. */
const SUPER_KEY = (email: string) => `gather-super-${email}`;
function cachedSuper(email: string) { try { return localStorage.getItem(SUPER_KEY(email)) === '1'; } catch { return false; } }
function rememberSuper(email: string, v: boolean) { try { if (v) localStorage.setItem(SUPER_KEY(email), '1'); else localStorage.removeItem(SUPER_KEY(email)); } catch { /* private mode */ } }
/** A hint read by a tiny script in the page head, so a signed-in visitor sees a loader instead of the website. */
export const AUTH_HINT = 'gather-signed-in';
function setHint(on: boolean) {
  try { if (on) localStorage.setItem(AUTH_HINT, '1'); else localStorage.removeItem(AUTH_HINT); } catch { /* private mode */ }
  document.documentElement.toggleAttribute('data-auth', on);
}

/** `user` is a Google-signed-in person. `guest` is set instead for a no-account Pulse session. */
interface AuthState { user: AppUser | null; guest: AppUser | null; loading: boolean; isOrganiser: boolean; /** Super admin: sees every event, user and activity (God view). */ isSuper: boolean }
const Ctx = createContext<AuthState>({ user: null, guest: null, loading: true, isOrganiser: false, isSuper: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, guest: null, loading: true, isOrganiser: false, isSuper: false });
  useEffect(() => {
    let lastUid: string | null | undefined;
    return backend.onAuth(async (who) => {
    // A different person (or signing out): drop every live listener and cached result from before.
    const uid = who?.uid ?? null;
    if (lastUid !== undefined && uid !== lastUid) { resetLive(); forgetSummaries(); }
    lastUid = uid;
    if (who?.guest) { setHint(false); setState({ user: null, guest: who, loading: false, isOrganiser: false, isSuper: false }); return; }
    const user = who;
    // Anyone with a verified Google account can organise (open registration); what they can touch is
    // limited to their own events by the security rules. The Master Admin is built in.
    let isOrganiser = false;
    let isSuper = false;
    const email = user?.email?.toLowerCase() ?? '';
    if (email && user!.emailVerified) {
      isOrganiser = true;
      isSuper = email === MASTER_ADMIN || cachedSuper(email);
    }
    setHint(!!user);
    // Show the app straight away; the super-admin list is checked in the background.
    setState({ user, guest: null, loading: false, isOrganiser, isSuper });
    if (isOrganiser && email !== MASTER_ADMIN) {
      backend.getDoc(`superAdmins/${email}`).then((d) => {
        const s = !!d;
        rememberSuper(email, s);
        if (s !== isSuper && lastUid === user!.uid) setState((p) => (p.user?.uid === user!.uid ? { ...p, isSuper: s } : p));
      }).catch(() => { /* keep what we had */ });
    }
    // Each person's profile: name, email and Google photo, refreshed on every sign-in.
    if (user && needsSync(user)) {
      // Saves the profile at most once a day per device, or straight away if the Google name or photo changed.
      Promise.all([
        backend.write([{ type: 'set', path: `users/${user.uid}`, merge: true, data: {
          name: user.name, email: user.email, photo: user.photo ?? '', lastSignIn: backend.now(),
        } }]),
        ensureProfile(user),
      ]).then(() => markSynced(user)).catch(() => { /* not critical: tried again next visit */ });
    }
    });
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
