import 'server-only';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { securityLog, redact } from './log';
import { decide, LIMITS, type Limit } from './rateLimit';

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

/**
 * Durable per-key limit kept in Firestore (`rateLimits/{key}`, closed to every app user by the rules;
 * only this server writes it). True if one more action is allowed, and records it.
 */
export async function durableLimit(firestore: Firestore, key: string, limits: Limit[]): Promise<boolean> {
  const ref = firestore.doc(`rateLimits/${key}`);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = decide((snap.data()?.hits as number[] | undefined) ?? [], Date.now(), limits);
    if (r.ok) tx.set(ref, { hits: r.next, updatedAt: FieldValue.serverTimestamp() });
    return r.ok;
  });
}

/**
 * The ping document is readable by the sender, so what is stored there never says why an alert
 * wasn't sent (that would reveal the recipient's WhatsApp settings or number). The detail goes to
 * the server log instead, without the number.
 */
const ROUTE = '/api/meetping/notify';

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
  const record = (r: Result, detail?: string) => {
    securityLog(`whatsapp.${r.status}`, { route: ROUTE, uid: caller, reason: detail ?? r.reason });
    // Stored on the ping: only the outcome, never the reason detail.
    const stored = { status: r.status, ...(r.messageId ? { messageId: r.messageId } : {}) };
    return ref.update({ wa: { ...stored, at: FieldValue.serverTimestamp() } }).then(() => r);
  };

  // Each alert is a paid message to someone else: at most LIMITS.waPerSender per sender, across all servers.
  if (!(await durableLimit(firestore, `wa-sender_${caller}`, LIMITS.waPerSender))) {
    securityLog('ratelimit.account', { route: ROUTE, uid: caller, limit: 'waPerSender' });
    return record({ status: 'skipped', reason: 'rate limited' });
  }

  const prefs = (await firestore.doc(`users/${p.toUid}/profile/me`).get()).data() ?? {};
  if (!prefs.whatsappOptIn) return record({ status: 'skipped' }, 'recipient not opted in');
  const to = String(prefs.whatsappPhone || prefs.phone || '').replace(/[^0-9]/g, '');
  if (to.length < 8) return record({ status: 'skipped' }, 'recipient has no valid number');

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
    if (!res.ok) return record({ status: 'failed' }, redact(body?.error?.message ?? res.status));
    const messageId = body?.messages?.[0]?.id as string | undefined;
    if (messageId) await firestore.doc(`waMessages/${messageId}`).set({ pingId, at: FieldValue.serverTimestamp() });
    return record({ status: 'sent', messageId });
  } catch (e) {
    return record({ status: 'failed' }, redact((e as Error).message));
  }
}

/** Delivery updates from Meta's webhook: sent → delivered → read, or failed. */
export async function recordStatus(messageId: string, status: string) {
  const map = await db().doc(`waMessages/${messageId}`).get();
  const pingId = map.data()?.pingId;
  if (!pingId || !['delivered', 'read', 'failed'].includes(status)) return;
  await db().doc(`pings/${pingId}`).update({ 'wa.status': status, 'wa.at': FieldValue.serverTimestamp() });
}
