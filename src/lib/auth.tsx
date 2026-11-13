'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { backend } from './backend';
import { resetLive } from './live';
import { ensureProfile } from './profile';
import type { AppUser } from './types';

/** The Master Admin: full control of the platform. Also built into the security rules. */
export const MASTER_ADMIN = 'toincial@gmail.com';

const SYNC_KEY = (uid: string) => `gather-synced-${uid}`;
const fingerprint = (u: AppUser) => `${u.name}|${u.photo ?? ''}|${new Date().toISOString().slice(0, 10)}`;
function needsSync(u: AppUser) { try { return localStorage.getItem(SYNC_KEY(u.uid)) !== fingerprint(u); } catch { return true; } }
function markSynced(u: AppUser) { try { localStorage.setItem(SYNC_KEY(u.uid), fingerprint(u)); } catch { /* private mode */ } }

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
    if (lastUid !== undefined && uid !== lastUid) resetLive();
    lastUid = uid;
    if (who?.guest) { setState({ user: null, guest: who, loading: false, isOrganiser: false, isSuper: false }); return; }
    const user = who;
    // Anyone with a verified Google account can organise (open registration); what they can touch is
    // limited to their own events by the security rules. The Master Admin is built in.
    let isOrganiser = false;
    let isSuper = false;
    if (user?.email && user.emailVerified) {
      isOrganiser = true;
      const email = user.email.toLowerCase();
      isSuper = email === MASTER_ADMIN || !!(await backend.getDoc(`superAdmins/${email}`).catch(() => null));
    }
    setState({ user, guest: null, loading: false, isOrganiser, isSuper });
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
