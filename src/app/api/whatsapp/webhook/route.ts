import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { securityLog } from '@/lib/server/log';
import { burst, clientIp, LIMITS } from '@/lib/server/rateLimit';
import { recordStatus } from '@/lib/server/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/whatsapp/webhook';
/** Meta's status updates are a few KB; anything far larger is refused unread. */
const MAX_BODY = 256 * 1024;
/** At most this many status updates are processed from one delivery. */
const MAX_STATUSES = 100;

/** Constant-time string comparison, so a wrong token can't be found character by character. */
function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const tooMany = (retryAfterMs: number) =>
  NextResponse.json({ error: 'too many requests' }, { status: 429, headers: { 'retry-after': String(Math.ceil(retryAfterMs / 1000)) } });

/** Meta's one-time webhook check: echo the challenge if the verify token matches. */
export function GET(req: Request) {
  const ip = clientIp(req.headers);
  const b = burst(`webhook:${ip}`, LIMITS.webhookPerIp);
  if (!b.ok) { securityLog('ratelimit.ip', { route: ROUTE, ip, status: 429 }); return tooMany(b.retryAfterMs); }
  const u = new URL(req.url);
  const want = process.env.WHATSAPP_VERIFY_TOKEN;
  const ok = !!want && u.searchParams.get('hub.mode') === 'subscribe' && same(u.searchParams.get('hub.verify_token') ?? '', want);
  if (!ok) { securityLog('webhook.verify_failed', { route: ROUTE, ip, status: 403 }); return NextResponse.json({ error: 'forbidden' }, { status: 403 }); }
  // Only the challenge goes back, as plain text, capped in length.
  return new NextResponse((u.searchParams.get('hub.challenge') ?? '').slice(0, 200), { headers: { 'content-type': 'text/plain' } });
}

/** Delivery status updates. Only accepted when signed with the app secret. */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const b = burst(`webhook:${ip}`, LIMITS.webhookPerIp);
  if (!b.ok) { securityLog('ratelimit.ip', { route: ROUTE, ip, status: 429 }); return tooMany(b.retryAfterMs); }
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !process.env.FIREBASE_SERVICE_ACCOUNT) return NextResponse.json({ configured: false }, { status: 501 });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) { securityLog('request.too_large', { route: ROUTE, ip, status: 413 }); return NextResponse.json({ error: 'request too large' }, { status: 413 }); }
  const raw = await req.text();
  if (raw.length > MAX_BODY) { securityLog('request.too_large', { route: ROUTE, ip, status: 413 }); return NextResponse.json({ error: 'request too large' }, { status: 413 }); }
  const sig = req.headers.get('x-hub-signature-256') ?? '';
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  if (!same(sig, expected)) { securityLog('webhook.bad_signature', { route: ROUTE, ip, status: 401 }); return NextResponse.json({ error: 'bad signature' }, { status: 401 }); }
  let body: { entry?: { changes?: { value?: { statuses?: { id: string; status: string }[] } }[] }[] } = {};
  try { body = JSON.parse(raw || '{}'); } catch { securityLog('request.bad', { route: ROUTE, ip, status: 400 }); return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const statuses = (body?.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.statuses ?? []) ?? []) ?? [])
    .filter((s) => typeof s?.id === 'string' && s.id.length <= 200 && !s.id.includes('/') && typeof s.status === 'string')
    .slice(0, MAX_STATUSES);
  await Promise.all(statuses.map((s) => recordStatus(s.id, s.status).catch(() => {})));
  securityLog('webhook.ok', { route: ROUTE, ip, count: statuses.length });
  return NextResponse.json({ ok: true });
}
