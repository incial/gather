import { useEffect, useState, useSyncExternalStore } from 'react';
import { backend, type QueryOpts, type Where } from './backend';

export interface Live<T> { data: T; loading: boolean; error: Error | null }

/**
 * One shared Firestore listener per path and query, however many components use it.
 * When the last screen using it closes, the listener stays open for a few seconds so
 * moving between tabs doesn't re-read the same documents, then it stops.
 */
interface Entry { subs: Set<(v: { data: unknown; error: Error | null }) => void>; last?: { data: unknown; error: Error | null }; stop: () => void; timer?: ReturnType<typeof setTimeout>; retry?: ReturnType<typeof setTimeout>; tries: number }
const registry = new Map<string, Entry>();
const LINGER_MS = 15_000;

/**
 * Stops every shared listener and forgets cached results. Called when the signed-in person
 * changes, so nobody sees the previous account's data or a listener that died on sign-out.
 */
let generation = 0;
const genListeners = new Set<() => void>();
const useGeneration = () => useSyncExternalStore((f) => { genListeners.add(f); return () => { genListeners.delete(f); }; }, () => generation, () => 0);

export function resetLive() {
  generation++;
  queueMicrotask(() => genListeners.forEach((f) => f()));
  for (const e of registry.values()) { e.stop(); clearTimeout(e.timer); clearTimeout(e.retry); }
  const keys = [...registry.keys()];
  registry.clear();
  counts.clear();
  return keys.length;
}

function subscribe(key: string, start: (emit: (v: { data: unknown; error: Error | null }) => void) => () => void, cb: Entry['subs'] extends Set<infer F> ? F : never) {
  let e = registry.get(key);
  if (!e) {
    const entry: Entry = { subs: new Set(), stop: () => {}, tries: 0 };
    registry.set(key, entry);
    const begin = () => {
      entry.stop = start((v) => {
        entry.last = v;
        entry.subs.forEach((s) => s(v));
        if (!v.error) { entry.tries = 0; return; }
        // Firestore ends a listener after an error (for example a permission error while
        // signing out). Start it again with a growing delay instead of keeping a dead one.
        entry.stop();
        if (entry.tries++ < 6 && entry.subs.size) entry.retry = setTimeout(begin, Math.min(30_000, 1000 * 2 ** entry.tries));
        else if (registry.get(key) === entry) registry.delete(key);
      });
    };
    begin();
    e = entry;
  }
  if (e.timer) { clearTimeout(e.timer); e.timer = undefined; }
  e.subs.add(cb);
  if (e.last) cb(e.last);
  const entry = e;
  return () => {
    entry.subs.delete(cb);
    if (entry.subs.size === 0) {
      entry.timer = setTimeout(() => { entry.stop(); clearTimeout(entry.retry); if (registry.get(key) === entry) registry.delete(key); }, LINGER_MS);
    }
  };
}

export function useDoc<T>(path: string | null): Live<T | null> {
  const gen = useGeneration();
  const [s, set] = useState<Live<T | null>>({ data: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) { set({ data: null, loading: false, error: null }); return; }
    set((p) => ({ ...p, loading: true }));
    return subscribe(`doc:${path}`,
      (emit) => backend.watchDoc<T>(path, (data) => emit({ data, error: null }), (error) => emit({ data: null, error })),
      (v) => set({ data: v.data as T | null, loading: false, error: v.error }));
  }, [path, gen]);
  return s;
}

export function useCol<T>(path: string | null, where: Where = [], opts?: QueryOpts): Live<T[]> {
  const gen = useGeneration();
  const [s, set] = useState<Live<T[]>>({ data: [], loading: !!path, error: null });
  const key = JSON.stringify([where, opts ?? null]);
  useEffect(() => {
    if (!path) { set({ data: [], loading: false, error: null }); return; }
    set((p) => ({ ...p, loading: true }));
    const [w, o] = JSON.parse(key) as [Where, QueryOpts | null];
    return subscribe(`col:${path}:${key}`,
      (emit) => backend.watchCol<T>(path, w, (data) => emit({ data, error: null }), (error) => emit({ data: [], error }), o ?? undefined),
      (v) => set({ data: v.data as T[], loading: false, error: v.error }));
  }, [path, key, gen]);
  return s;
}

/**
 * Recent counts, so a row that unmounts and mounts again (filtering a table, switching tabs) shows the
 * number it already had instead of asking the server again. Two screens asking for the same count at
 * once share one request. refresh() always asks the server.
 */
const COUNT_TTL_MS = 60_000;
const counts = new Map<string, { n: number; at: number; gen: number }>();
const pendingCounts = new Map<string, Promise<number>>();
function countOnce(path: string, where: Where, key: string, fresh: boolean): Promise<number> {
  const hit = counts.get(key);
  if (!fresh && hit && hit.gen === generation && Date.now() - hit.at < COUNT_TTL_MS) return Promise.resolve(hit.n);
  const inFlight = pendingCounts.get(key);
  if (inFlight) return inFlight;
  const g = generation;
  const p = backend.count(path, where)
    .then((n) => { if (g === generation) counts.set(key, { n, at: Date.now(), gen: g }); return n; })
    .finally(() => { pendingCounts.delete(key); });
  pendingCounts.set(key, p);
  return p;
}

/** Records a count the screen already knows (for example the length of a live list), so useCount shows it without a read. */
export function primeCount(path: string, where: Where, n: number) {
  counts.set(`${path}:${JSON.stringify(where)}`, { n, at: Date.now(), gen: generation });
}

/** A one-time count (no listener). Call refresh() to update it. */
export function useCount(path: string | null, where: Where = []): { n: number | null; error: boolean; refresh: () => void } {
  const gen = useGeneration();
  const wkey = JSON.stringify(where);
  const ckey = `${path}:${wkey}`;
  const [n, setN] = useState<number | null>(() => {
    const hit = path ? counts.get(ckey) : undefined;
    return hit && hit.gen === generation ? hit.n : null;
  });
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    countOnce(path, JSON.parse(wkey), ckey, tick > 0).then((c) => { if (live) { setN(c); setError(false); } }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [path, wkey, ckey, tick, gen]);
  return { n, error, refresh: () => setTick((t) => t + 1) };
}
