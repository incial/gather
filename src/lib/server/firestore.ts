/**
 * Firestore over its REST API, called with the signed-in person's own Firebase token. Firestore checks that
 * token against the security rules exactly as it does for the app, so the server can only read what the caller
 * could read anyway: no service-account key, nothing new to configure, and the rules stay the single authority.
 *
 * Counting, summing and averaging run inside Firestore (aggregation queries, about 1 read per 1,000 entries),
 * so the summaries the dashboards show never require downloading the underlying records.
 */

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '';
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
/** The local Firestore emulator when testing (FIRESTORE_EMULATOR_HOST=host:port), otherwise Google. */
const base = () => (process.env.FIRESTORE_EMULATOR_HOST ? `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/${ROOT}` : `https://firestore.googleapis.com/v1/${ROOT}`);

/** A failed Firestore call, with the HTTP status to pass on (401/403 when the rules refuse, 404 when missing). */
export class FsError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type Value = string | number | boolean | null;
/** Filters: [field path, value], or [field path, value, '>'] for "greater than". */
export type Filter = [field: string, value: Value, op?: '==' | '>'];
export type Doc = { id: string } & Record<string, unknown>;
export type Agg = { count: true } | { sum: string } | { avg: string };

/** A field path for Firestore: plain names as they are, anything else (map keys with dashes etc.) in backticks. */
export function fieldPath(path: string) {
  return path.split('.').map((p) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p) ? p : `\`${p.replace(/`/g, '\\`')}\``)).join('.');
}

function encode(v: Value): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: v };
}

export function decode(v: unknown): unknown {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if ('stringValue' in o) return o.stringValue;
  if ('integerValue' in o) return Number(o.integerValue);
  if ('doubleValue' in o) return Number(o.doubleValue);
  if ('booleanValue' in o) return o.booleanValue;
  if ('timestampValue' in o) return new Date(String(o.timestampValue)).toISOString();
  if ('nullValue' in o) return null;
  if ('referenceValue' in o) return o.referenceValue;
  if ('arrayValue' in o) return ((o.arrayValue as { values?: unknown[] }).values ?? []).map(decode);
  if ('mapValue' in o) return decodeFields((o.mapValue as { fields?: Record<string, unknown> }).fields);
  return null;
}
const decodeFields = (f?: Record<string, unknown>) => Object.fromEntries(Object.entries(f ?? {}).map(([k, v]) => [k, decode(v)]));
const toDoc = (d: { name: string; fields?: Record<string, unknown> }): Doc => ({ id: d.name.split('/').pop()!, ...decodeFields(d.fields) });

function where(filters: Filter[]) {
  if (!filters.length) return {};
  const parts = filters.map(([field, value, op]) => ({ fieldFilter: { field: { fieldPath: fieldPath(field) }, op: op === '>' ? 'GREATER_THAN' : 'EQUAL', value: encode(value) } }));
  return { where: parts.length === 1 ? parts[0] : { compositeFilter: { op: 'AND', filters: parts } } };
}

async function call(token: string, url: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(url, {
    method: init?.method ?? 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 300);
    throw new FsError(res.status === 401 || res.status === 403 || res.status === 404 ? res.status : 502, text || res.statusText);
  }
  return res.json();
}

const parentUrl = (parent: string, op: string) => `${base()}${parent ? `/${parent}` : ''}:${op}`;

/**
 * Counts, sums or averages the documents of `collectionId` under `parent` ('' for a top-level collection) that
 * match the filters, computed by Firestore. Up to five aggregations per call. Missing averages come back as null.
 */
export async function aggregate(token: string, parent: string, collectionId: string, filters: Filter[], aggs: Record<string, Agg>): Promise<Record<string, number | null>> {
  const aggregations = Object.entries(aggs).map(([alias, a]) => ({
    alias,
    ...('count' in a ? { count: {} } : 'sum' in a ? { sum: { field: { fieldPath: fieldPath(a.sum) } } } : { avg: { field: { fieldPath: fieldPath(a.avg) } } }),
  }));
  const rows = await call(token, parentUrl(parent, 'runAggregationQuery'), {
    body: { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId }], ...where(filters) }, aggregations } },
  }) as { result?: { aggregateFields?: Record<string, unknown> } }[];
  const fields = rows.find((r) => r.result)?.result?.aggregateFields ?? {};
  return Object.fromEntries(Object.keys(aggs).map((k) => [k, fields[k] === undefined ? null : (decode(fields[k]) as number | null)]));
}

/** Number of matching documents (1 read per 1,000). */
export const count = (token: string, parent: string, collectionId: string, filters: Filter[] = []) =>
  aggregate(token, parent, collectionId, filters, { n: { count: true } }).then((r) => r.n ?? 0);

/** Matching documents, optionally only some fields and at most `limit` of them. */
export async function query(token: string, parent: string, collectionId: string, opts: { filters?: Filter[]; select?: string[]; limit?: number } = {}): Promise<Doc[]> {
  const rows = await call(token, parentUrl(parent, 'runQuery'), {
    body: {
      structuredQuery: {
        from: [{ collectionId }],
        ...where(opts.filters ?? []),
        ...(opts.select ? { select: { fields: opts.select.map((f) => ({ fieldPath: fieldPath(f) })) } } : {}),
        ...(opts.limit ? { limit: opts.limit } : {}),
      },
    },
  }) as { document?: { name: string; fields?: Record<string, unknown> } }[];
  return rows.filter((r) => r.document).map((r) => toDoc(r.document!));
}

/** One document, or null if it doesn't exist. */
export async function getDoc(token: string, path: string): Promise<Doc | null> {
  try { return toDoc(await call(token, `${base()}/${path}`, { method: 'GET' })); }
  catch (e) { if (e instanceof FsError && e.status === 404) return null; throw e; }
}

/**
 * Many documents in one request. Returns each path's document, null when it doesn't exist, or 'denied' when the
 * caller may not read it (so "can't read" is never mistaken for "deleted").
 */
export async function getMany(token: string, paths: string[]): Promise<Map<string, Doc | null | 'denied'>> {
  const out = new Map<string, Doc | null | 'denied'>();
  if (!paths.length) return out;
  try {
    const rows = await call(token, `${base()}:batchGet`, { body: { documents: paths.map((p) => `${ROOT}/${p}`) } }) as { found?: { name: string; fields?: Record<string, unknown> }; missing?: string }[];
    for (const r of rows) {
      if (r.found) out.set(r.found.name.slice(ROOT.length + 1), toDoc(r.found));
      else if (r.missing) out.set(r.missing.slice(ROOT.length + 1), null);
    }
  } catch (e) {
    if (!(e instanceof FsError) || (e.status !== 403 && e.status !== 401)) throw e;
    // One unreadable document fails the whole batch: fall back to reading them one at a time.
    await Promise.all(paths.map(async (p) => {
      try { out.set(p, await getDoc(token, p)); } catch (x) { if (x instanceof FsError && (x.status === 403 || x.status === 401)) out.set(p, 'denied'); else throw x; }
    }));
  }
  return out;
}
