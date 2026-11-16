import type { AppUser } from './types';
import { firebaseConfig } from './firebaseConfig';

export type Unsub = () => void;
/** Equality filters. A field written as 'name[]' matches documents whose list `name` contains the value. */
export type Where = [field: string, value: unknown][];
/** Optional query shaping. orderBy + after give cursor paging; limit caps the documents read. */
/** `after` is [value of orderBy field, document id] of the last row, so equal values never skip rows. */
export interface QueryOpts {
  orderBy?: string; limit?: number; after?: [string, string]; /** Newest first. Not combined with `after`. */ desc?: boolean;
  /** Only rows whose orderBy field is at least this value (for example events ending after now). With an equality filter on another field it needs a composite index. */
  from?: string;
}

export type WriteOp =
  | { type: 'set'; path: string; data: Record<string, unknown>; merge?: boolean }
  | { type: 'delete'; path: string };

/**
 * The whole app talks to this small document API, so the same screens run on
 * Firestore or on the in-browser demo store.
 */
export interface Backend {
  mode: 'firebase' | 'demo';
  onAuth(cb: (u: AppUser | null) => void): Unsub;
  signInGoogle(role: 'attendee' | 'organiser'): Promise<void>;
  /** A guest session with no account, used to answer public Pulse surveys and polls. */
  signInGuest(): Promise<void>;
  signOut(): Promise<void>;
  /** A short-lived sign-in token for calling the app's own server routes. Empty in demo mode. */
  idToken(): Promise<string>;
  /** Deletes the signed-in Google account itself (asks the person to confirm with Google if needed). */
  deleteAccount(): Promise<void>;
  watchDoc<T>(path: string, cb: (d: T | null) => void, onErr: (e: Error) => void): Unsub;
  watchCol<T>(path: string, where: Where, cb: (d: T[]) => void, onErr: (e: Error) => void, opts?: QueryOpts): Unsub;
  getDoc<T>(path: string): Promise<T | null>;
  getCol<T>(path: string, where?: Where, opts?: QueryOpts): Promise<T[]>;
  /** Number of matching documents without downloading them (billed at 1 read per 1,000). */
  count(path: string, where?: Where): Promise<number>;
  write(ops: WriteOp[]): Promise<void>;
  /** Server time on write. */
  now(): unknown;
  /** A timestamp `ms` from now, in the form the store compares against. */
  timestampIn(ms: number): unknown;
  newId(): string;
  /** Adds n to a number field on the server, so simultaneous votes never overwrite each other. */
  inc(n: number): unknown;
  /** Adds values to a list field on the server without duplicates. */
  union(...values: unknown[]): unknown;
}

const mode: Backend['mode'] = firebaseConfig.apiKey ? 'firebase' : 'demo';

/**
 * Next pre-renders client components on the server, where there is no browser
 * storage. All data access runs inside effects, so a stub that does nothing is enough.
 */
const serverStub = new Proxy({}, {
  get: (_, prop) => (prop === 'mode' ? mode : prop === 'count' || prop === 'getCol' || prop === 'getDoc' || prop === 'signInGuest' || prop === 'deleteAccount' || prop === 'idToken' ? () => new Promise(() => {}) : () => () => {}),
}) as Backend;

/* ---------- The real store, loaded as its own chunk ---------- */
/*
 * The Firebase SDK (or the demo store) is a separate download that starts as soon as the app starts, instead of
 * being part of the first bundle every page waits for, so screens appear and respond while it arrives.
 * Everything the app calls goes through `backend` below, which hands calls to the real store once it's loaded.
 */
let real: Backend | null = null;
const ready: Promise<Backend> | null = typeof window === 'undefined' ? null
  : (mode === 'firebase'
    ? import('./firebaseBackend').then((m) => m.createFirebaseBackend())
    : import('./demoBackend').then((m) => m.createDemoBackend())
  ).then((b) => (real = b));
const load = () => ready!;

/** Values made before the store finished loading (server time, counters…), turned into the real ones on write. */
type Pending = { __pending: 'now' } | { __pending: 'in'; ms: number } | { __pending: 'inc'; n: number } | { __pending: 'union'; v: unknown[] };
const isPending = (v: unknown): v is Pending => !!v && typeof v === 'object' && '__pending' in (v as object);
function resolvePending(b: Backend, v: unknown): unknown {
  if (isPending(v)) {
    if (v.__pending === 'now') return b.now();
    if (v.__pending === 'in') return b.timestampIn(v.ms);
    if (v.__pending === 'inc') return b.inc(v.n);
    return b.union(...v.v);
  }
  if (Array.isArray(v)) return v.map((x) => resolvePending(b, x));
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, resolvePending(b, x)]));
  }
  return v;
}

/** A listener that starts once the store is loaded; stopping it early cancels it. */
function deferred(start: (b: Backend) => Unsub): Unsub {
  if (real) return start(real);
  let stop: Unsub | null = null;
  let cancelled = false;
  load().then((b) => { if (!cancelled) stop = start(b); });
  return () => { cancelled = true; stop?.(); };
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Same shape as a Firestore auto-ID (20 random characters). */
function newIdNow() {
  const r = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(r, (x) => ID_CHARS[x % ID_CHARS.length]).join('');
}

const lazyBackend: Backend = {
  mode,
  onAuth: (cb) => deferred((b) => b.onAuth(cb)),
  // Called straight away when loaded, so Google's sign-in pop-up still opens from the tap itself.
  signInGoogle: (role) => (real ? real.signInGoogle(role) : load().then((b) => b.signInGoogle(role))),
  signInGuest: () => load().then((b) => b.signInGuest()),
  signOut: () => load().then((b) => b.signOut()),
  idToken: () => load().then((b) => b.idToken()),
  deleteAccount: () => load().then((b) => b.deleteAccount()),
  watchDoc: (path, cb, onErr) => deferred((b) => b.watchDoc(path, cb, onErr)),
  watchCol: (path, w, cb, onErr, opts) => deferred((b) => b.watchCol(path, w, cb, onErr, opts)),
  getDoc: (path) => load().then((b) => b.getDoc(path)),
  getCol: (path, w, opts) => load().then((b) => b.getCol(path, w, opts)),
  count: (path, w) => load().then((b) => b.count(path, w)),
  write: (ops) => load().then((b) => b.write(ops.map((op) => (op.type === 'set' ? { ...op, data: resolvePending(b, op.data) as Record<string, unknown> } : op)))),
  now: () => (real ? real.now() : { __pending: 'now' }),
  timestampIn: (ms) => (real ? real.timestampIn(ms) : { __pending: 'in', ms }),
  newId: () => (real ? real.newId() : newIdNow()),
  inc: (n) => (real ? real.inc(n) : { __pending: 'inc', n }),
  union: (...v) => (real ? real.union(...v) : { __pending: 'union', v }),
};

export const backend: Backend = typeof window === 'undefined' ? serverStub : lazyBackend;
export const isDemo = mode === 'demo';
