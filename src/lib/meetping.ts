import { backend, type WriteOp } from './backend';

export const DEFAULT_PING = 'I’d love to connect with you and meet you at this event!';
export const MAX_PING = 300;

export type PingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

/** One Meet Ping, in pings/{eventId}_{fromUid}_{toUid}. The ID itself prevents duplicate requests. */
export interface PingDoc {
  /** Phone numbers each person chose to share after connecting ('' = not shared). */
  fromPhone?: string;
  toPhone?: string;
  id: string;
  eventId: string;
  eventTitle: string;
  fromUid: string;
  fromName: string;
  fromPhoto: string;
  toUid: string;
  toName: string;
  toPhoto: string;
  /** Each person's role at the event when the ping was sent: Speaker or Attendee. */
  fromRole?: string;
  toRole?: string;
  message: string;
  status: PingStatus;
  createdAt?: string;
  updatedAt?: string;
  /** WhatsApp delivery, written only by the server route. */
  wa?: { status: 'sent' | 'delivered' | 'read' | 'failed' | 'skipped'; reason?: string; at?: string };
}

/** In-app notification, in users/{uid}/notifications/{id}. Only the recipient can read it. */
export interface NotificationDoc {
  id: string;
  type: 'ping' | 'accepted';
  pingId: string;
  eventId: string;
  eventTitle: string;
  fromUid: string;
  fromName: string;
  fromPhoto: string;
  message: string;
  read: boolean;
  at?: string;
}

export interface PingPerson { uid: string; name: string; photo?: string; role?: string }

export const pingId = (eventId: string, from: string, to: string) => `${eventId}_${from}_${to}`;
/** Only web photos travel with pings (no large embedded images in every notification). */
const webPhoto = (p?: string) => (p && /^https?:/.test(p) ? p : '');

/**
 * Sends a Meet Ping: the request and the recipient's notification are written together, so a
 * notification exists exactly when a valid request does. WhatsApp (if set up) is tried afterwards
 * and can never undo the in-app request.
 */
export async function sendPing(event: { id: string; title: string }, from: PingPerson, to: PingPerson, message: string) {
  const text = message.trim().slice(0, MAX_PING) || DEFAULT_PING;
  if (from.uid === to.uid) throw new Error('You can’t send a Meet Ping to yourself.');
  const id = pingId(event.id, from.uid, to.uid);
  const ping = {
    eventId: event.id, eventTitle: event.title.slice(0, 120),
    fromUid: from.uid, fromName: from.name.slice(0, 80), fromPhoto: webPhoto(from.photo),
    toUid: to.uid, toName: to.name.slice(0, 80), toPhoto: webPhoto(to.photo),
    fromRole: (from.role || 'Attendee').slice(0, 20), toRole: (to.role || 'Attendee').slice(0, 20),
    message: text, status: 'pending', createdAt: backend.now(), updatedAt: backend.now(),
  };
  const note = {
    type: 'ping', pingId: id, eventId: event.id, eventTitle: ping.eventTitle,
    fromUid: from.uid, fromName: ping.fromName, fromPhoto: ping.fromPhoto, message: text, read: false, at: backend.now(),
  };
  try {
    await backend.write([
      { type: 'set', path: `pings/${id}`, data: ping },
      { type: 'set', path: `users/${to.uid}/notifications/${id}`, data: note },
    ]);
  } catch (e) {
    if (/permission/i.test(String(e))) throw new Error('This Meet Ping couldn’t be sent. You may have already sent one to this person for this event.');
    throw e;
  }
  notifyWhatsApp(id);
  return id;
}

/** Accept or decline. Only the recipient can, and only while it is pending. Accepting tells the sender. */
export async function answerPing(p: PingDoc, accept: boolean, me: PingPerson) {
  const ops: WriteOp[] = [
    { type: 'set', path: `pings/${p.id}`, merge: true, data: { status: accept ? 'accepted' : 'declined', updatedAt: backend.now() } },
    { type: 'set', path: `users/${me.uid}/notifications/${p.id}`, merge: true, data: { read: true } },
  ];
  if (accept) ops.push({ type: 'set', path: `users/${p.fromUid}/notifications/${p.id}_ok`, data: {
    type: 'accepted', pingId: p.id, eventId: p.eventId, eventTitle: p.eventTitle,
    fromUid: me.uid, fromName: me.name.slice(0, 80), fromPhoto: webPhoto(me.photo), message: '', read: false, at: backend.now(),
  } });
  await backend.write(ops);
}

/**
 * The sender cancels an unanswered request. It leaves the recipient's pending list, but stays in
 * the sender's history as Cancelled (the record isn't deleted).
 */
export const withdrawPing = (p: PingDoc) =>
  backend.write([{ type: 'set', path: `pings/${p.id}`, merge: true, data: { status: 'cancelled', updatedAt: backend.now() } }]);

/** Send a cancelled request again (with a new message). The recipient is notified again. */
export async function resendPing(p: PingDoc, message: string) {
  const text = message.trim().slice(0, MAX_PING) || DEFAULT_PING;
  await backend.write([
    { type: 'set', path: `pings/${p.id}`, merge: true, data: { status: 'pending', message: text, updatedAt: backend.now() } },
    { type: 'set', path: `users/${p.toUid}/notifications/${p.id}`, merge: true, data: { read: false, message: text, at: backend.now() } },
  ]);
  notifyWhatsApp(p.id);
}

export const markRead = (uid: string, ids: string[]) =>
  ids.length ? backend.write(ids.map((id) => ({ type: 'set' as const, path: `users/${uid}/notifications/${id}`, merge: true, data: { read: true } }))) : Promise.resolve();

/** WhatsApp opt-in, kept with the person's private details (never on the public profile). */
export const saveWhatsAppPrefs = (uid: string, optIn: boolean, phone: string) =>
  backend.write([{ type: 'set', path: `users/${uid}/profile/me`, merge: true, data: { whatsappOptIn: optIn, whatsappPhone: phone } }]);

/**
 * Asks the server to send a WhatsApp alert for a ping. Fire-and-forget: the server checks the
 * sender, the recipient's opt-in and its own configuration, and records the result on the ping.
 */
function notifyWhatsApp(id: string) {
  if (backend.mode !== 'firebase') return;
  backend.idToken().then((token) => {
    if (!token) return;
    fetch('/api/meetping/notify', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ pingId: id }) }).catch(() => {});
  }).catch(() => {});
}

/** Status between me and someone else at one event, from both directions. */
export function relation(myUid: string, otherUid: string, pings: PingDoc[]) {
  const out = pings.find((p) => p.fromUid === myUid && p.toUid === otherUid);
  const inc = pings.find((p) => p.fromUid === otherUid && p.toUid === myUid);
  if (out?.status === 'accepted' || inc?.status === 'accepted') return { kind: 'connected' as const, ping: out?.status === 'accepted' ? out : inc };
  if (inc?.status === 'pending') return { kind: 'incoming' as const, ping: inc };
  if (out?.status === 'pending') return { kind: 'sent' as const, ping: out };
  if (out?.status === 'declined') return { kind: 'declined' as const, ping: out };
  if (out?.status === 'cancelled') return { kind: 'cancelled' as const, ping: out };
  return { kind: 'none' as const, ping: inc };
}

/** After connecting, share (or stop sharing) your own phone number with the other person. */
export const sharePhone = (p: Pick<PingDoc, 'id' | 'fromUid'>, myUid: string, phone: string) =>
  backend.write([{ type: 'set', path: `pings/${p.id}`, merge: true, data: { [p.fromUid === myUid ? 'fromPhone' : 'toPhone']: phone.trim().slice(0, 20), updatedAt: backend.now() } }]);
