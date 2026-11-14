import type { QueryOpts } from './backend';

/** Sorting, cursor and limit like a Firestore query: order by a field, then by document id. */
export function shapeRows<T extends { id: string }>(rows: T[], opts?: QueryOpts): T[] {
  if (!opts) return rows;
  let out = rows;
  if (opts.orderBy) {
    const f = opts.orderBy;
    const k = (r: T) => [String((r as Record<string, unknown>)[f] ?? ''), r.id] as const;
    const cmp = (a: readonly [string, string], b: readonly [string, string]) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
    // Like Firestore, a range on a field leaves out rows that don't have it.
    if (opts.from !== undefined) out = out.filter((r) => { const v = (r as Record<string, unknown>)[f]; return v != null && String(v) >= opts.from!; });
    out = [...out].sort((a, b) => (opts.desc ? -1 : 1) * cmp(k(a), k(b)));
    if (opts.after) out = out.filter((r) => cmp(k(r), opts.after!) > 0);
  }
  return opts.limit ? out.slice(0, opts.limit) : out;
}
