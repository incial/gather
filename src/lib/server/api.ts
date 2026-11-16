import { NextResponse } from 'next/server';
import { FsError } from './firestore';
import { securityLog } from './log';
import { burst, clientIp, LIMITS } from './rateLimit';

/** IDs in URLs: Firestore auto-IDs and the app's own IDs (letters, digits, - and _). */
const ID = /^[A-Za-z0-9_-]{1,128}$/;
export const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);

/** A comma-separated list of IDs from the query string, checked and capped (bad input is refused, not trimmed). */
export function idList(url: URL, name: string, max = 200): string[] {
  const raw = url.searchParams.get(name);
  if (!raw) return [];
  const ids = [...new Set(raw.split(','))];
  if (ids.length > max || !ids.every(isId)) throw new BadRequest(`bad ${name}`);
  return ids;
}

export class BadRequest extends Error {}

export interface ApiCtx { token: string; url: URL; ip: string; req: Request }

/**
 * Runs one dashboard API: per-IP rate limit, the caller's Firebase sign-in token (every Firestore read is made
 * with it, so the security rules decide what comes back), and errors turned into plain HTTP statuses.
 * Responses are never cached (see next.config headers for /api).
 */
export async function api(req: Request, route: string, fn: (c: ApiCtx) => Promise<unknown>) {
  const ip = clientIp(req.headers);
  const b = burst(`api:${ip}`, LIMITS.apiPerIp);
  if (!b.ok) {
    securityLog('ratelimit.ip', { route, ip, status: 429 });
    return NextResponse.json({ error: 'too many requests' }, { status: 429, headers: { 'retry-after': String(Math.ceil(b.retryAfterMs / 1000)) } });
  }
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || token.length > 4096) {
    securityLog('auth.missing', { route, ip, status: 401 });
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }
  try {
    return NextResponse.json(await fn({ token, url: new URL(req.url), ip, req }));
  } catch (e) {
    if (e instanceof BadRequest) { securityLog('request.bad', { route, ip, status: 400 }); return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
    if (e instanceof FsError) {
      if (e.status === 401) { securityLog('auth.invalid', { route, ip, status: 401 }); return NextResponse.json({ error: 'sign in required' }, { status: 401 }); }
      if (e.status === 403) { securityLog('request.forbidden', { route, ip, status: 403 }); return NextResponse.json({ error: 'forbidden' }, { status: 403 }); }
      if (e.status === 404) return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    console.error(JSON.stringify({ level: 'error', kind: 'api', route, message: String((e as Error)?.message ?? e).slice(0, 300) }));
    return NextResponse.json({ error: 'server error' }, { status: 502 });
  }
}
