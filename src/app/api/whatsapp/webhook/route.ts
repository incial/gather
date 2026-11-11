import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { recordStatus } from '@/lib/server/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Meta's one-time webhook check: echo the challenge if the verify token matches. */
export function GET(req: Request) {
  const u = new URL(req.url);
  const ok = process.env.WHATSAPP_VERIFY_TOKEN && u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN;
  return ok ? new NextResponse(u.searchParams.get('hub.challenge') ?? '') : NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

/** Delivery status updates. Only accepted when signed with the app secret. */
export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !process.env.FIREBASE_SERVICE_ACCOUNT) return NextResponse.json({ configured: false }, { status: 501 });
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256') ?? '';
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  const body = JSON.parse(raw || '{}');
  const statuses: { id: string; status: string }[] = body?.entry?.flatMap((e: { changes?: { value?: { statuses?: { id: string; status: string }[] } }[] }) => e.changes?.flatMap((c) => c.value?.statuses ?? []) ?? []) ?? [];
  await Promise.all(statuses.map((s) => recordStatus(s.id, s.status).catch(() => {})));
  return NextResponse.json({ ok: true });
}
