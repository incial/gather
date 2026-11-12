import { backend, isDemo, type WriteOp } from './backend';
import type { AppUser, AttendeeDoc, EventDoc, FeedbackOwnerDoc, MembershipDoc, RoleDoc, SpeakerCategory, SpeakerCodeDoc, SpeakerDoc, SpeakerFeedbackDoc } from './types';

export const CATEGORIES: Record<SpeakerCategory, string> = { featured: 'Featured', keynote: 'Keynote', guest: 'Guest', panelist: 'Panelist', regular: 'Regular' };

/** The organiser's order everywhere: pinned first, then manual order, then name. Never random. */
export function sortSpeakers<T extends Pick<SpeakerDoc, 'name' | 'order' | 'pinned'>>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.order ?? 1e6) - (b.order ?? 1e6) || a.name.localeCompare(b.name));
}

/* ---------- Activation codes ---------- */

// 10 characters from 32 symbols: about 10^15 possibilities, and codes can only be looked up one at a time.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newSpeakerCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
export const showCode = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;
export const cleanCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * One speaker code per event, shared by all the event's speakers. Any attendee who enters it
 * becomes a speaker for that event with their own account. The organiser can change it any time.
 */
export async function createEventSpeakerCode(ev: Pick<EventDoc, 'id' | 'title'>, opts: { days: number; pulse: boolean }, previous?: string) {
  const code = newSpeakerCode();
  const expiresAt = new Date(Date.now() + opts.days * 86_400_000);
  await backend.write([
    ...(previous ? [{ type: 'set' as const, path: `speakerCodes/${previous}`, merge: true, data: { revoked: true } }] : []),
    { type: 'set', path: `speakerCodes/${code}`, data: {
      eventId: ev.id, eventTitle: ev.title, common: true, pulse: opts.pulse, expiresAt,
      speakerId: '', speakerName: '', used: false, usedBy: '', revoked: false, createdAt: backend.now(),
    } },
  ]);
  return code;
}
export const revokeCode = (code: string) => backend.write([{ type: 'set', path: `speakerCodes/${code}`, merge: true, data: { revoked: true } }]);

export type CodeCheck = { ok: true; code: string; c: SpeakerCodeDoc; event: EventDoc } | { ok: false; reason: string };

/** Step 1: is this a working speaker code? Nothing is saved yet. */
export async function checkSpeakerCode(raw: string): Promise<CodeCheck> {
  const code = cleanCode(raw);
  if (code.length !== 10) return { ok: false, reason: 'Speaker codes have 10 letters and numbers, like ABCDE-23456.' };
  const c = await backend.getDoc<SpeakerCodeDoc>(`speakerCodes/${code}`).catch(() => null);
  if (!c) return { ok: false, reason: 'That code isn’t valid. Check it with the organiser.' };
  if (c.revoked) return { ok: false, reason: 'That code has been changed by the organiser. Ask them for the new one.' };
  if (Date.parse(c.expiresAt) < Date.now()) return { ok: false, reason: 'That code has expired. Ask the organiser for a new one.' };
  const event = await backend.getDoc<EventDoc>(`events/${c.eventId}`).catch(() => null);
  if (!event) return { ok: false, reason: 'The event for this code is no longer available.' };
  return { ok: true, code, c, event };
}

/* ---------- Four-digit speaker code (one per event) ---------- */

export interface SpeakerPinDoc { id: string; pin: string; revoked: boolean; expiresAt: string; eventTitle: string; createdAt?: string }
export interface SpeakerTryDoc { id: string; pin: string; n: number; ok: boolean; at?: string }
export const MAX_TRIES = 10;
const WEAK = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '2580', '0123', '9876']);

/** A random four-digit code, never an easy one like 1234 or 0000. */
export function newPin() {
  for (;;) {
    const n = crypto.getRandomValues(new Uint16Array(1))[0] % 10000;
    const pin = String(n).padStart(4, '0');
    if (!WEAK.has(pin)) return pin;
  }
}
export const cleanPin = (raw: string) => raw.replace(/\D/g, '').slice(0, 4);

/** Makes (or changes) the event's speaker code. The old code stops working at once. */
export const setSpeakerPin = (ev: Pick<EventDoc, 'id' | 'title'>, days: number) =>
  backend.write([{ type: 'set', path: `speakerPins/${ev.id}`, data: {
    pin: newPin(), revoked: false, expiresAt: new Date(Date.now() + days * 86_400_000), eventTitle: ev.title, createdAt: backend.now(),
  } }]);
export const switchOffPin = (eventId: string) => backend.write([{ type: 'set', path: `speakerPins/${eventId}`, merge: true, data: { revoked: true } }]);
/** Lets people who used all their tries guess again. */
export const resetTries = (eventId: string, uids: string[]) => backend.write(uids.map((u) => ({ type: 'delete' as const, path: `events/${eventId}/speakerTries/${u}` })));

export type PinResult = { ok: true } | { ok: false; reason: string; left: number };

/**
 * Checks a four-digit code for one event. The guess is saved first (which uses up a try), then
 * marked correct; the security rules only allow that when it matches the event's code.
 */
export async function tryPin(user: AppUser, eventId: string, raw: string): Promise<PinResult> {
  const pin = cleanPin(raw);
  const path = `events/${eventId}/speakerTries/${user.uid}`;
  const prev = await backend.getDoc<SpeakerTryDoc>(path).catch(() => null);
  if (prev?.ok && prev.pin === pin) return { ok: true };
  const n = (prev?.n ?? 0) + 1;
  if (pin.length !== 4) return { ok: false, reason: 'The speaker code is four digits.', left: MAX_TRIES - (prev?.n ?? 0) };
  if (n > MAX_TRIES) return { ok: false, reason: `You’ve used all ${MAX_TRIES} tries for this event. Ask the organiser to reset them.`, left: 0 };
  const left = MAX_TRIES - n;
  const wrong = (): PinResult => ({ ok: false, reason: left ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : `That code isn’t right, and that was your last try. Ask the organiser to reset your tries.`, left });
  await backend.write([{ type: 'set', path, data: { pin, n, ok: false, at: backend.now() } }]);
  if (isDemo) {
    // Demo mode has no security rules, so check here the way the rules would.
    const p = await backend.getDoc<SpeakerPinDoc>(`speakerPins/${eventId}`).catch(() => null);
    if (!p || p.revoked || Date.parse(p.expiresAt) < Date.now() || p.pin !== pin) return wrong();
  }
  try { await backend.write([{ type: 'set', path, merge: true, data: { ok: true } }]); }
  catch { return wrong(); }
  return { ok: true };
}

/** Has this person already entered the right code for this event (and is it still current)? */
export const verifiedTry = (uid: string, eventId: string) =>
  backend.getDoc<SpeakerTryDoc>(`events/${eventId}/speakerTries/${uid}`).then((t) => !!t?.ok).catch(() => false);

/** The speaker profile someone creates from their own details when they aren't on the organiser's list. */
export interface OwnSpeakerProfile { name: string; role: string; organisation: string; topic: string; bio: string; photo: string; linkedin: string; website: string }

/**
 * Step 2: become a speaker. Either link to a speaker the organiser already listed (if nobody has
 * claimed it yet), or create a speaker profile from the person's own details. The same account
 * stays an attendee; the security rules check the code and that the speaker profile is theirs.
 */
export type SpeakerGrant = { event: EventDoc; code: string; pulse: boolean };
export async function becomeSpeaker(user: AppUser, chk: SpeakerGrant | Extract<CodeCheck, { ok: true }>, choice: { speakerId: string; name: string } | { own: OwnSpeakerProfile }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { code, event: ev } = chk;
  const pulse = 'c' in chk ? chk.c.pulse : chk.pulse;
  const speakerId = 'own' in choice ? user.uid : choice.speakerId;
  const speakerName = 'own' in choice ? choice.own.name : choice.name;
  const already = await backend.getDoc<AttendeeDoc>(`events/${ev.id}/attendees/${user.uid}`).catch(() => null);
  const ops: WriteOp[] = [];
  if ('own' in choice) {
    const o = choice.own;
    ops.push({ type: 'set', path: `events/${ev.id}/speakers/${user.uid}`, data: {
      uid: user.uid, name: o.name.trim().slice(0, 80), role: o.role.trim().slice(0, 80), organisation: o.organisation.trim().slice(0, 120),
      topic: o.topic.trim().slice(0, 160), expertise: '', bio: o.bio.trim().slice(0, 1500), photo: o.photo, email: '', phone: '',
      linkedin: o.linkedin.trim().slice(0, 200), website: o.website.trim().slice(0, 200), links: [], category: 'regular', order: 2_000_000,
    } });
  } else {
    ops.push({ type: 'set', path: `events/${ev.id}/speakers/${choice.speakerId}`, merge: true, data: { uid: user.uid } });
  }
  ops.push(
    { type: 'set', path: `events/${ev.id}/roles/${user.uid}`, data: {
      uid: user.uid, name: user.name, email: user.email, roles: ['speaker'], speakerId, status: 'verified', active: true, pulse, code, at: backend.now(),
    } },
    { type: 'set', path: `users/${user.uid}/speaking/${ev.id}`, data: {
      eventId: ev.id, speakerId, speakerName, eventTitle: ev.title, startsAt: ev.startsAt, pulse,
    } },
  );
  // A speaker is an attendee too: join them if they haven't joined (works for invite-only and full events).
  if (!already) {
    const membership: Omit<MembershipDoc, 'id'> = { title: ev.title, startsAt: ev.startsAt, endsAt: ev.endsAt, venue: ev.venue, color: ev.color };
    ops.push(
      { type: 'set', path: `events/${ev.id}/attendees/${user.uid}`, data: { name: user.name, phone: '', institution: 'own' in choice ? choice.own.organisation : '', department: '', designation: 'Speaker', uid: user.uid, email: user.email, photo: user.photo ?? '', source: 'app', listed: false, joinedAt: backend.now(), regId: newRegId() } },
      { type: 'set', path: `users/${user.uid}/events/${ev.id}`, data: membership },
    );
  }
  try { await backend.write(ops); }
  catch { return { ok: false, reason: 'own' in choice ? 'That didn’t work. The organiser may have just changed the speaker code: enter the new one.' : 'That speaker entry is already linked to another account, or it’s reserved for a different email address. Sign in with the email the organiser has for you, or ask the organiser.' }; }
  return { ok: true };
}

/* ---------- Matching organiser-listed speakers to accounts by verified email ---------- */

/**
 * The speaker entry the organiser created with this person's email, if any and not claimed by
 * someone else. Only works with a verified email, and never by name.
 */
export async function findMyAssignment(user: AppUser, eventId: string): Promise<SpeakerDoc | null> {
  if (!user.emailVerified || !user.email) return null;
  const list = await backend.getCol<SpeakerDoc>(`events/${eventId}/speakers`, [['emailLower', user.email.toLowerCase()]]).catch(() => []);
  return list.find((s) => !s.uid || s.uid === user.uid) ?? null;
}

/** Links that entry to this account and gives the event's speaker role (joining the event if needed). One account, no new identity. */
export async function claimByEmail(user: AppUser, ev: EventDoc, sp: SpeakerDoc) {
  return becomeSpeaker(user, { event: ev, code: 'EMAIL', pulse: true }, { speakerId: sp.id, name: sp.name });
}

/** A speaker updates their own public speaker details. */
export const saveMySpeakerProfile = (eventId: string, speakerId: string, p: Pick<SpeakerDoc, 'bio' | 'topic' | 'linkedin' | 'website' | 'role' | 'organisation'>) =>
  backend.write([{ type: 'set', path: `events/${eventId}/speakers/${speakerId}`, merge: true, data: {
    bio: p.bio.trim().slice(0, 1500), topic: p.topic.trim().slice(0, 160), linkedin: p.linkedin.trim().slice(0, 200), website: p.website.trim().slice(0, 200),
    role: p.role.trim().slice(0, 80), organisation: p.organisation.trim().slice(0, 120),
  } }]);

/** Removes someone's speaker access for one event. Their attendee registration stays. */
export const revokeSpeaker = (eventId: string, r: Pick<RoleDoc, 'uid' | 'speakerId'>) => backend.write([
  { type: 'set', path: `events/${eventId}/roles/${r.uid}`, merge: true, data: { active: false } },
  { type: 'delete', path: `users/${r.uid}/speaking/${eventId}` },
  // Free the speaker profile so the right person can link it later.
  { type: 'set', path: `events/${eventId}/speakers/${r.speakerId}`, merge: true, data: { uid: '' } },
]);

/** Saves the organiser's order (and the short public lineup in the same order). */
export async function saveSpeakerOrder(eventId: string, ordered: SpeakerDoc[]) {
  await backend.write([
    ...ordered.map((s, i) => ({ type: 'set' as const, path: `events/${eventId}/speakers/${s.id}`, merge: true, data: { order: i } })),
    { type: 'set', path: `events/${eventId}`, merge: true, data: { lineup: ordered.map(({ id, name, role, photo }) => ({ id, name, role, ...(photo && /^https?:/.test(photo) ? { photo } : {}) })) } },
  ]);
}

/* ---------- Registration IDs ---------- */

export function newRegId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/* ---------- Speaker feedback (attendee → speaker) ---------- */

/**
 * Anonymous feedback is written without any name, photo or account ID, so a speaker can never
 * learn who wrote it, even by reading the raw data. A separate record that only organisers and
 * the writer can read links the writer to it and allows one feedback per speaker per person.
 */
export async function sendSpeakerFeedback(eventId: string, me: Pick<AppUser, 'uid' | 'name' | 'photo'>, speakerId: string, rating: number, text: string, anonymous: boolean) {
  const fid = backend.newId();
  await backend.write([
    { type: 'set', path: `events/${eventId}/speakerFeedback/${fid}`, data: {
      speakerId, rating, text: text.trim().slice(0, 1000), anonymous,
      uid: anonymous ? '' : me.uid, name: anonymous ? '' : me.name.slice(0, 80), photo: anonymous ? '' : (me.photo && /^https?:/.test(me.photo) ? me.photo : ''),
      status: 'visible', at: backend.now(),
    } },
    { type: 'set', path: `events/${eventId}/speakerFeedbackOwners/${speakerId}_${me.uid}`, data: { uid: me.uid, speakerId, fid, at: backend.now() } },
  ]);
}

export const setFeedbackStatus = (eventId: string, fid: string, status: SpeakerFeedbackDoc['status']) =>
  backend.write([{ type: 'set', path: `events/${eventId}/speakerFeedback/${fid}`, merge: true, data: { status } }]);

/** Organiser moderation only: who wrote an anonymous feedback. */
export async function feedbackWriter(eventId: string, fid: string) {
  const owners = await backend.getCol<FeedbackOwnerDoc>(`events/${eventId}/speakerFeedbackOwners`, [['fid', fid]]);
  if (!owners[0]) return null;
  return backend.getDoc<AttendeeDoc>(`events/${eventId}/attendees/${owners[0].uid}`);
}

export function feedbackStats(list: Pick<SpeakerFeedbackDoc, 'rating'>[]) {
  const n = list.length;
  return { n, average: n ? Math.round((list.reduce((a, f) => a + f.rating, 0) / n) * 10) / 10 : null };
}
