import { NextResponse } from 'next/server';
import { alertForPing, callerUid, missingConfig } from '@/lib/server/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { pingId } with the sender's Firebase sign-in token. Sends the WhatsApp alert for that
 * Meet Ping if the recipient opted in and WhatsApp is configured. The in-app ping already exists;
 * nothing here can undo it.
 */
export async function POST(req: Request) {
  const missing = missingConfig();
  if (missing.length) return NextResponse.json({ configured: false, missing }, { status: 501 });
  const uid = await callerUid(req.headers.get('authorization'));
  if (!uid) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  const { pingId } = await req.json().catch(() => ({ pingId: '' }));
  if (typeof pingId !== 'string' || !/^[\w-]+_[\w-]+_[\w-]+$/.test(pingId)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const result = await alertForPing(pingId, uid);
  const code = result.reason === 'forbidden' ? 403 : result.reason === 'not-found' ? 404 : 200;
  return NextResponse.json(result, { status: code });
}
