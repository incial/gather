import type { AppUser } from './types';
import { createFirebaseBackend, firebaseConfig } from './firebaseBackend';
import { createDemoBackend } from './demoBackend';

export type Unsub = () => void;
export type Where = [field: string, value: unknown][];
/** Optional query shaping. orderBy + after give cursor paging; limit caps the documents read. */
/** `after` is [value of orderBy field, document id] of the last row, so equal values never skip rows. */
export interface QueryOpts { orderBy?: string; limit?: number; after?: [string, string]; /** Newest first. Not combined with `after`. */ desc?: boolean }

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

export const backend: Backend = typeof window === 'undefined'
  ? serverStub
  : mode === 'firebase' ? createFirebaseBackend() : createDemoBackend();
export const isDemo = mode === 'demo';
