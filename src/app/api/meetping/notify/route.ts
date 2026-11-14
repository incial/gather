import { NextResponse } from 'next/server';
import { securityLog } from '@/lib/server/log';
import { burst, clientIp, LIMITS } from '@/lib/server/rateLimit';
import { alertForPing, callerUid, missingConfig } from '@/lib/server/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/meetping/notify';
/** The body is just { pingId }: anything bigger is refused before it is read. */
const MAX_BODY = 2048;

const tooMany = (retryAfterMs: number) =>
  NextResponse.json({ error: 'too many requests' }, { status: 429, headers: { 'retry-after': String(Math.ceil(retryAfterMs / 1000)) } });

/**
 * POST { pingId } with the sender's Firebase sign-in token. Sends the WhatsApp alert for that
 * Meet Ping if the recipient opted in and WhatsApp is configured. The in-app ping already exists;
 * nothing here can undo it.
 *
 * Checks, cheapest first: per-IP burst limit, body size, sign-in token, request shape; then in
 * alertForPing: only the ping's sender, at most once per ping, and a per-account limit on alerts.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const b = burst(`notify:${ip}`, LIMITS.notifyPerIp);
  if (!b.ok) { securityLog('ratelimit.ip', { route: ROUTE, ip, status: 429 }); return tooMany(b.retryAfterMs); }

  const missing = missingConfig();
  // Which settings are missing stays in the server log; callers only learn it isn't set up.
  if (missing.length) { console.warn(JSON.stringify({ level: 'warn', kind: 'config', route: ROUTE, missing })); return NextResponse.json({ configured: false }, { status: 501 }); }

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) {
    securityLog('request.too_large', { route: ROUTE, ip, status: 413 });
    return NextResponse.json({ error: 'request too large' }, { status: 413 });
  }
  const auth = req.headers.get('authorization');
  if (!auth) { securityLog('auth.missing', { route: ROUTE, ip, status: 401 }); return NextResponse.json({ error: 'sign in required' }, { status: 401 }); }
  const uid = await callerUid(auth);
  if (!uid) { securityLog('auth.invalid', { route: ROUTE, ip, status: 401 }); return NextResponse.json({ error: 'sign in required' }, { status: 401 }); }

  const raw = await req.text();
  if (raw.length > MAX_BODY) { securityLog('request.too_large', { route: ROUTE, ip, uid, status: 413 }); return NextResponse.json({ error: 'request too large' }, { status: 413 }); }
  let pingId: unknown = '';
  try { pingId = (JSON.parse(raw) as { pingId?: unknown })?.pingId; } catch { /* handled below */ }
  if (typeof pingId !== 'string' || pingId.length > 200 || !/^[\w-]+_[\w-]+_[\w-]+$/.test(pingId)) {
    securityLog('request.bad', { route: ROUTE, ip, uid, status: 400 });
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  // A ping is only ever sent by its own sender, so the caller's ID must be the middle part.
  if (!pingId.includes(`_${uid}_`)) {
    securityLog('request.forbidden', { route: ROUTE, ip, uid, status: 403 });
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const result = await alertForPing(pingId, uid);
  const code = result.reason === 'forbidden' ? 403 : result.reason === 'not-found' ? 404 : 200;
  if (code !== 200) securityLog(code === 403 ? 'request.forbidden' : 'request.not_found', { route: ROUTE, ip, uid, status: code });
  return NextResponse.json(result, { status: code });
}
