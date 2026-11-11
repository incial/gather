import 'server-only';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/**
 * Server side of WhatsApp alerts for Meet Pings. Everything secret stays here (Vercel environment
 * variables); nothing is ever sent to browsers.
 *
 * Needed configuration:
 *   FIREBASE_SERVICE_ACCOUNT   JSON key of a Firebase service account (to verify callers and read opt-ins)
 *   WHATSAPP_TOKEN             WhatsApp Business Cloud API access token
 *   WHATSAPP_PHONE_NUMBER_ID   The sending phone number's ID
 *   WHATSAPP_TEMPLATE          Approved template name, with three body variables:
 *                              {{1}} recipient name, {{2}} sender name, {{3}} event name
 *   WHATSAPP_TEMPLATE_LANG     Template language code (default en)
 *   WHATSAPP_APP_SECRET        App secret, to check delivery-status webhooks really come from Meta
 *   WHATSAPP_VERIFY_TOKEN      Any secret string, entered in Meta when setting up the webhook
 */
export function missingConfig(): string[] {
  return ['FIREBASE_SERVICE_ACCOUNT', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE'].filter((k) => !process.env[k]);
}

function admin(): App {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)) });
}
export const db = () => getFirestore(admin());

export async function callerUid(authHeader: string | null): Promise<string | null> {
  const token = authHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try { return (await getAuth(admin()).verifyIdToken(token)).uid; } catch { return null; }
}

type Result = { status: 'sent' | 'skipped' | 'failed'; reason?: string; messageId?: string };

/** Sends (at most once) the WhatsApp alert for one Meet Ping, and records the outcome on the ping. */
export async function alertForPing(pingId: string, caller: string): Promise<Result> {
  const firestore = db();
  const ref = firestore.doc(`pings/${pingId}`);
  // A transaction claims the ping first, so two calls can never send two messages.
  const claim = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: 'not-found' as const };
    const p = snap.data()!;
    if (p.fromUid !== caller) return { error: 'forbidden' as const };
    if (p.wa) return { error: 'done' as const, wa: p.wa };
    tx.update(ref, { wa: { status: 'sending', at: FieldValue.serverTimestamp() } });
    return { p };
  });
  if ('error' in claim) {
    if (claim.error === 'done') return { status: claim.wa.status, reason: 'already handled' };
    return { status: 'failed', reason: claim.error };
  }
  const p = claim.p;
  const record = (r: Result) => ref.update({ wa: { ...r, at: FieldValue.serverTimestamp() } }).then(() => r);

  const prefs = (await firestore.doc(`users/${p.toUid}/profile/me`).get()).data() ?? {};
  if (!prefs.whatsappOptIn) return record({ status: 'skipped', reason: 'not opted in' });
  const to = String(prefs.whatsappPhone || prefs.phone || '').replace(/[^0-9]/g, '');
  if (to.length < 8) return record({ status: 'skipped', reason: 'no valid number' });

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        template: {
          name: process.env.WHATSAPP_TEMPLATE, language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [{ type: 'body', parameters: [p.toName || 'there', p.fromName || 'Someone', p.eventTitle || 'your event'].map((text: string) => ({ type: 'text', text: String(text).slice(0, 60) })) }],
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return record({ status: 'failed', reason: String(body?.error?.message ?? res.status).slice(0, 200) });
    const messageId = body?.messages?.[0]?.id as string | undefined;
    if (messageId) await firestore.doc(`waMessages/${messageId}`).set({ pingId, at: FieldValue.serverTimestamp() });
    return record({ status: 'sent', messageId });
  } catch (e) {
    return record({ status: 'failed', reason: String((e as Error).message).slice(0, 200) });
  }
}

/** Delivery updates from Meta's webhook: sent → delivered → read, or failed. */
export async function recordStatus(messageId: string, status: string) {
  const map = await db().doc(`waMessages/${messageId}`).get();
  const pingId = map.data()?.pingId;
  if (!pingId || !['delivered', 'read', 'failed'].includes(status)) return;
  await db().doc(`pings/${pingId}`).update({ 'wa.status': status, 'wa.at': FieldValue.serverTimestamp() });
}
