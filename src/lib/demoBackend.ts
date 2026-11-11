import type { Backend, Where, WriteOp } from './backend';
import type { AppUser } from './types';
import { seedDemo } from './seed';
import { shapeRows } from './queryShape';

const KEY = 'gather-demo-v5';
const AUTH_KEY = 'gather-demo-user-v5';
type Store = Record<string, Record<string, unknown>>;

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* falls through to a fresh seed */ }
  const fresh = seedDemo();
  try { localStorage.setItem(KEY, JSON.stringify(fresh)); } catch { /* private mode */ }
  return fresh;
}

/**
 * Demo-only usage meter, shaped like Firestore billing: a listener costs one read per document
 * when it starts (later updates aren't counted here), a get costs one read per document, and each
 * write operation costs one write. Read it from the console as window.__gatherUsage.
 */
export interface Usage { reads: number; writes: number; listenersOpened: number; listenersActive: number; byPath: Record<string, number> }
const usage: Usage = { reads: 0, writes: 0, listenersOpened: 0, listenersActive: 0, byPath: {} };
const countReads = (path: string, n: number) => {
  usage.reads += n;
  const key = path.replace(/^events\/[^/]+/, 'events/*').replace(/^users\/[^/]+/, 'users/*').replace(/^profiles\/.+/, 'profiles/*');
  usage.byPath[key] = (usage.byPath[key] ?? 0) + n;
};
if (typeof window !== 'undefined') (window as unknown as { __gatherUsage: Usage }).__gatherUsage = usage;

export const DEMO_ORGANISER: AppUser = { uid: 'demo-organiser', email: 'organiser@gather.demo', name: 'Demo Organiser', emailVerified: true };

const DEMO_ATTENDEE: AppUser = { uid: 'demo-attendee', email: 'attendee@gather.demo', name: 'Demo Attendee', emailVerified: true };

/** A stand-in for Firestore that lives in localStorage and syncs across tabs. */
export function createDemoBackend(): Backend {
  let store = load();
  let user: AppUser | null = null;
  try { user = JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null'); } catch { /* signed out */ }
  const listeners = new Set<() => void>();
  const authListeners = new Set<(u: AppUser | null) => void>();
  const notify = () => listeners.forEach((l) => l());
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota */ }
    notify();
  };
  const setUser = (u: AppUser | null) => {
    user = u;
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(u)); } catch { /* private mode */ }
    authListeners.forEach((l) => l(u));
  };
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { store = load(); notify(); }
    if (e.key === AUTH_KEY) {
      user = e.newValue ? JSON.parse(e.newValue) : null;
      authListeners.forEach((l) => l(user));
    }
  });

  const readCol = (path: string, w: Where) => {
    const prefix = path + '/';
    return Object.entries(store)
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map(([p, d]) => ({ id: p.slice(prefix.length), ...d }))
      .filter((d) => w.every(([f, v]) => (d as Record<string, unknown>)[f] === v));
  };

  const shape = shapeRows;

  /** Mirrors the one Firestore rule attendees can run into during check-in. */
  const checkAttendance = (op: Extract<WriteOp, { type: 'set' }>) => {
    if (!/\/attendance\//.test(op.path) || op.data.method !== 'qr') return;
    const eventPath = op.path.split('/attendance/')[0];
    const k = store[`${eventPath}/sessionKeys/${op.data.sessionId}`];
    const live = k && k.open && Date.parse(String(k.expiresAt)) > Date.now()
      && String(op.data.key).length === 6 && (op.data.key === k.key || op.data.key === k.prev);
    if (!live) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  };

  return {
    mode: 'demo',
    onAuth(cb) {
      authListeners.add(cb);
      queueMicrotask(() => cb(user));
      return () => { authListeners.delete(cb); };
    },
    async signInGoogle(role) { setUser(role === 'organiser' ? DEMO_ORGANISER : DEMO_ATTENDEE); },
    async signInGuest() { setUser({ uid: `guest-${Math.random().toString(36).slice(2, 10)}`, email: '', name: '', emailVerified: false, guest: true }); },
    async signOut() { setUser(null); },
    idToken: async () => '',
    async deleteAccount() { setUser(null); },
    watchDoc(path, cb) {
      let first = true;
      const fn = () => {
        const d = store[path];
        if (first) { first = false; countReads(path, 1); }
        cb(d ? ({ id: path.split('/').pop(), ...d } as never) : null);
      };
      usage.listenersOpened++; usage.listenersActive++;
      listeners.add(fn); queueMicrotask(fn);
      return () => { listeners.delete(fn); usage.listenersActive--; };
    },
    watchCol(path, w, cb, _onErr, opts) {
      let first = true;
      const fn = () => {
        const rows = shape(readCol(path, w), opts);
        if (first) { first = false; countReads(path, Math.max(1, rows.length)); }
        cb(rows as never);
      };
      usage.listenersOpened++; usage.listenersActive++;
      listeners.add(fn); queueMicrotask(fn);
      return () => { listeners.delete(fn); usage.listenersActive--; };
    },
    async getDoc(path) {
      countReads(path, 1);
      const d = store[path];
      return d ? ({ id: path.split('/').pop(), ...d } as never) : null;
    },
    async getCol(path, w = [], opts) {
      const rows = shape(readCol(path, w), opts);
      countReads(path, Math.max(1, rows.length));
      return rows as never;
    },
    async count(path, w = []) {
      const n = readCol(path, w).length;
      countReads(path, Math.max(1, Math.ceil(n / 1000))); // Firestore bills 1 read per 1,000 counted
      return n;
    },
    async write(ops) {
      usage.writes += ops.length;
      for (const op of ops) {
        if (op.type === 'delete') { delete store[op.path]; continue; }
        checkAttendance(op);
        const prev = store[op.path] ?? {};
        // Resolve inc() and union() the way Firestore does on the server.
        const data = Object.fromEntries(Object.entries(op.data).map(([k, v]) => {
          const s = v as { __op?: string; n?: number; v?: unknown[] } | null;
          if (s && s.__op === 'inc') return [k, (Number(prev[k]) || 0) + (s.n ?? 0)];
          if (s && s.__op === 'union') { const old = Array.isArray(prev[k]) ? prev[k] as unknown[] : []; return [k, [...old, ...(s.v ?? []).filter((x) => !old.includes(x))]]; }
          return [k, v];
        }));
        store[op.path] = op.merge ? { ...prev, ...data } : data;
      }
      persist();
    },
    now: () => new Date().toISOString(),
    timestampIn: (ms) => new Date(Date.now() + ms).toISOString(),
    newId: () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36),
    inc: (n) => ({ __op: 'inc', n }),
    union: (...v) => ({ __op: 'union', v }),
  };
}
