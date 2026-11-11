'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth';

export type Mode = 'attendee' | 'organiser';
const KEY = 'gather-mode';

interface ModeState { mode: Mode; setMode: (m: Mode) => void; canOrganise: boolean }
const Ctx = createContext<ModeState>({ mode: 'attendee', setMode: () => {}, canOrganise: false });

/**
 * Which experience the person is in. One account, one identity: organiser mode only takes
 * effect when the database says they're an organiser, and every organiser action is still
 * checked by the security rules, so this is only about what the app shows.
 */
export function ModeProvider({ children }: { children: ReactNode }) {
  const { isOrganiser } = useAuth();
  const [stored, setStored] = useState<Mode>('attendee');
  useEffect(() => { try { if (localStorage.getItem(KEY) === 'organiser') setStored('organiser'); } catch { /* private mode */ } }, []);
  const setMode = useCallback((m: Mode) => {
    setStored(m);
    try { localStorage.setItem(KEY, m); } catch { /* private mode */ }
  }, []);
  return <Ctx.Provider value={{ mode: isOrganiser ? stored : 'attendee', setMode, canOrganise: isOrganiser }}>{children}</Ctx.Provider>;
}
export const useMode = () => useContext(Ctx);
