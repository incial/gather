import { backend, type WriteOp } from './backend';
import { deletePulse } from './pulse/api';
import { newRegId, sortSpeakers } from './speakers';
import { swipe, unsave } from './saved';
import { dueEvery, TIDY_EVERY_MS } from './once';
import type { PulseDoc } from './pulse/types';
import { FDP_EVENT, FDP_SESSIONS, FDP_SPEAKERS } from './programme';
import { DEFAULT_QUESTIONS } from './questions';
import { normName, splitSpeaker } from './scheduleParse';
import type {
  AppUser, AttendeeDoc, ConnectionDoc, EventDoc, EventInfoDoc, FeedbackDoc, MembershipDoc, PreregDoc, SessionKind,
  RoleDoc, SessionDoc, SpeakerDoc, SwipeDoc,
} from './types';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I, easier to read aloud
export function randomCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const strip = <T extends { id: string }>({ id: _id, ...rest }: T) => rest as unknown as Record<string, unknown>;

/* ---------- Joining ---------- */

export const findEventByCode = async (code: string) =>
  (await backend.getCol<EventDoc>('events', [['joinCode', code.trim()], ['published', true]])).find((e) => !isDeletedEvent(e)) ?? null;

/** Six digits, never starting with 0 so spreadsheets and phones keep all six. */
function randomJoinCode() {
  return String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
}

export const getPrereg = (eventId: string, email: string) =>
  backend.getDoc<PreregDoc>(`events/${eventId}/preregistered/${email.trim().toLowerCase()}`);

const profilePath = (uid: string) => `users/${uid}/profile/me`;
export type SavedProfile = Profile & { id: string; listed: boolean };

/** Details from the last event someone joined, so the next join can be one tap. */
export const getMyProfile = (uid: string) => backend.getDoc<SavedProfile>(profilePath(uid));

/**
 * Joins without a form when we already know the person's details and the
 * event is open. Returns false when the form is still needed.
 */
export async function quickJoin(eventId: string, user: AppUser): Promise<{ joined: boolean; event: EventDoc | null }> {
  // Both reads at once: the event and this person's saved details don't depend on each other.
  const [event, saved] = await Promise.all([backend.getDoc<EventDoc>(`events/${eventId}`), getMyProfile(user.uid)]);
  if (!event) return { joined: false, event: null };
  if (!saved?.name || !saved.phone || event.registration !== 'open') return { joined: false, event };
  const { id: _id, listed, ...profile } = saved;
  await joinEvent(event, user, profile, 'app', listed);
  return { joined: true, event };
}

/* ---------- Explore ---------- */

/** Saving and skipping live in saved.ts so every page shares one implementation. */
export async function swipeEvent(ev: EventDoc, user: AppUser, choice: SwipeDoc['choice']) { await swipe(ev, user, choice); }
export const unsaveEvent = async (eventId: string, uid: string) => { await unsave(eventId, uid); };

/** Brings skipped events back into Explore. */
export const clearSkipped = (uid: string, ids: string[]) =>
  backend.write(ids.map((id) => ({ type: 'delete' as const, path: `users/${uid}/swipes/${id}` })));

export type Profile = Pick<AttendeeDoc, 'name' | 'phone' | 'institution' | 'department' | 'designation'> & { shareContact?: boolean };

/** The People entry: deliberately only these fields. Email and phone only when the person chose to share them. */
function directoryOp(eventId: string, uid: string, p: Profile, listed: boolean, photo: string | undefined, email: string): WriteOp {
  const path = `events/${eventId}/directory/${uid}`;
  if (!listed) return { type: 'delete', path };
  return { type: 'set', path, data: {
    uid, name: p.name, institution: p.institution, department: p.department, designation: p.designation, photo: photo ?? '',
    ...(p.shareContact ? { email, phone: p.phone } : {}),
  } };
}

export async function joinEvent(ev: EventDoc, user: AppUser, profile: Profile, source: AttendeeDoc['source'], listed: boolean) {
  const membership: Omit<MembershipDoc, 'id'> = { title: ev.title, startsAt: ev.startsAt, endsAt: ev.endsAt, venue: ev.venue, color: ev.color };
  try {
    await writeJoin(ev, user, profile, source, listed, membership);
  } catch (e) {
    // With a capacity set, the rules refuse the join once the counter reaches it.
    if ((ev.capacity ?? 0) > 0 && /permission/i.test(String(e))) throw new Error('Sorry, this event is full. Registration has reached its limit.');
    throw e;
  }
}

const writeJoin = (ev: EventDoc, user: AppUser, profile: Profile, source: AttendeeDoc['source'], listed: boolean, membership: Omit<MembershipDoc, 'id'>) =>
  backend.write([
    { type: 'set', path: `events/${ev.id}/attendees/${user.uid}`, data: { ...profile, shareContact: !!profile.shareContact, uid: user.uid, email: user.email, photo: user.photo ?? '', source, listed, joinedAt: backend.now(), regId: newRegId() } },
    ...((ev.capacity ?? 0) > 0 ? [{ type: 'set' as const, path: `events/${ev.id}/counters/attendees`, merge: true, data: { n: backend.inc(1) } }] : []),
    { type: 'set', path: `users/${user.uid}/events/${ev.id}`, data: membership },
    { type: 'set', path: profilePath(user.uid), data: { ...profile, listed } },
    ...(listed ? [directoryOp(ev.id, user.uid, profile, true, user.photo, user.email)] : []),
  ]);

export const updateProfileFor = (eventId: string, a: AttendeeDoc, profile: Profile, listed: boolean) =>
  backend.write([
    { type: 'set', path: `events/${eventId}/attendees/${a.uid}`, data: { ...profile, shareContact: !!profile.shareContact, listed }, merge: true },
    { type: 'set', path: profilePath(a.uid), data: { ...profile, listed } },
    directoryOp(eventId, a.uid, profile, listed, a.photo, a.email),
  ]);

/* ---------- Check-in ---------- */

export type CheckInResult = 'ok' | 'already' | 'expired';

/**
 * Session check-in by the attendee: with the room code (scanned or typed), or, when the organiser has switched on
 * self check-in for that session, by marking themselves present (no code; recorded as "self").
 */
export async function checkIn(eventId: string, sessionId: string, me: AttendeeDoc, key: string | null): Promise<CheckInResult> {
  const id = `${sessionId}_${me.uid}`;
  const path = `events/${eventId}/attendance/${id}`;
  // Both reads at once (this runs on every scan at the door of a session).
  const [existing, fresh] = await Promise.all([
    backend.getDoc(path),
    backend.getDoc<AttendeeDoc>(`events/${eventId}/attendees/${me.uid}`).catch(() => null),
  ]);
  if (existing) return 'already';
  const session: WriteOp = { type: 'set', path, data: key === null
    ? { uid: me.uid, sessionId, name: me.name, email: me.email, method: 'self', at: backend.now() }
    : { uid: me.uid, sessionId, name: me.name, email: me.email, method: 'qr', key: key.trim().toUpperCase(), at: backend.now() } };
  // The first scan of the event also marks you present at the event (same record your pass and the organiser use).
  const present: WriteOp[] = fresh && !fresh.checkedIn ? [
    { type: 'set', path: `events/${eventId}/attendees/${me.uid}`, merge: true, data: { checkedIn: true, checkedInAt: backend.now(), checkInMethod: 'self', checkedInBy: me.uid, checkInSession: sessionId } },
    { type: 'set', path: `events/${eventId}/checkinLog/${backend.newId()}`, data: { uid: me.uid, name: me.name, action: 'in', method: 'self', by: me.uid, byName: me.name, at: backend.now() } },
  ] : [];
  try {
    await backend.write([session, ...present]);
    return 'ok';
  } catch (e) {
    if ((e as { code?: string }).code !== 'permission-denied') throw e;
    if (!present.length) return 'expired';
    // If marking event attendance was refused, still record the session check-in on its own.
    try { await backend.write([session]); return 'ok'; }
    catch (e2) { if ((e2 as { code?: string }).code === 'permission-denied') return 'expired'; throw e2; }
  }
}

/** Opens or closes self check-in for one session (organisers). */
export const setSelfCheckIn = (eventId: string, sessionId: string, on: boolean) =>
  backend.write([{ type: 'set', path: `events/${eventId}/sessions/${sessionId}`, merge: true, data: { selfCheckIn: on } }]);

export const markAttendance = (eventId: string, sessionId: string, a: Pick<AttendeeDoc, 'uid' | 'name' | 'email'>, method: 'staff' | 'manual') =>
  backend.write([{ type: 'set', path: `events/${eventId}/attendance/${sessionId}_${a.uid}`, data: {
    uid: a.uid, sessionId, name: a.name, email: a.email, method, at: backend.now(),
  } }]);

export const unmarkAttendance = (eventId: string, id: string) =>
  backend.write([{ type: 'delete', path: `events/${eventId}/attendance/${id}` }]);

export const KEY_ROTATE_MS = 30_000;

/** Organiser's check-in screen calls this every rotation. The previous key stays valid so a scan mid-rotation still lands. */
export async function publishKey(eventId: string, sessionId: string, key: string, prev: string) {
  await backend.write([{ type: 'set', path: `events/${eventId}/sessionKeys/${sessionId}`, data: {
    key, prev: prev || key, open: true, expiresAt: backend.timestampIn(KEY_ROTATE_MS * 2 + 5000),
  } }]);
}
export const closeKey = (eventId: string, sessionId: string) =>
  backend.write([{ type: 'set', path: `events/${eventId}/sessionKeys/${sessionId}`, data: { open: false }, merge: true }]);

/* ---------- Connections and feedback ---------- */

export async function connect(eventId: string, me: AttendeeDoc, speaker: Pick<SpeakerDoc, 'id' | 'name'>, method: ConnectionDoc['method']) {
  await backend.write([{ type: 'set', path: `events/${eventId}/connections/${me.uid}_${speaker.id}`, data: {
    uid: me.uid, speakerId: speaker.id, speakerName: speaker.name, name: me.name, email: me.email, method, at: backend.now(),
  } }]);
}

export const saveSessionFeedback = (eventId: string, me: AttendeeDoc, sessionId: string, rating: number, comment: string) =>
  backend.write([{ type: 'set', path: `events/${eventId}/sessionFeedback/${sessionId}_${me.uid}`, data: {
    uid: me.uid, sessionId, name: me.name, email: me.email, rating, comment: comment.trim(), at: backend.now(),
  } }]);

export const saveFeedback = (eventId: string, me: AttendeeDoc, answers: FeedbackDoc['answers'], speakerRatings: FeedbackDoc['speakerRatings']) =>
  backend.write([{ type: 'set', path: `events/${eventId}/feedback/${me.uid}`, data: {
    uid: me.uid, name: me.name, email: me.email, answers, speakerRatings, at: backend.now(),
  } }]);

/* ---------- Organiser ---------- */

/** Creates an event owned by `owner`: only they (and the Master Admin) can manage it. */
export async function createEvent(data: Omit<EventDoc, 'id' | 'joinCode' | 'lineup' | 'questions' | 'createdAt' | 'ownerUid'>, owner: AppUser) {
  const id = backend.newId();
  let joinCode = randomJoinCode();
  // Checked against listed events (the ones anyone may look up by number).
  while ((await backend.getCol('events', [['joinCode', joinCode], ['published', true]]).catch(() => [])).length) joinCode = randomJoinCode();
  await backend.write([{ type: 'set', path: `events/${id}`, data: {
    ...data, ownerUid: owner.uid, ownerEmail: owner.email.toLowerCase(), joinCode, lineup: [], questions: DEFAULT_QUESTIONS, createdAt: backend.now(),
  } }]);
  return id;
}

/** Adds the FDP with its full schedule and speakers. Runs only when an organiser clicks the button. */
export async function loadFdpProgramme(owner: AppUser) {
  const eventId = await createEvent({ ...FDP_EVENT, published: false, registration: 'open', feedbackOpen: true }, owner);
  await backend.write([
    ...FDP_SPEAKERS.map((s) => ({ type: 'set' as const, path: `events/${eventId}/speakers/${s.id}`, data: strip(s) })),
    ...FDP_SESSIONS.map((s) => ({ type: 'set' as const, path: `events/${eventId}/sessions/${s.id}`, data: strip(s) })),
    { type: 'set', path: `events/${eventId}`, data: { lineup: lineupOf(FDP_SPEAKERS) }, merge: true },
  ]);
  return eventId;
}

export const updateEvent = (id: string, patch: Partial<EventDoc>) =>
  backend.write([{ type: 'set', path: `events/${id}`, data: patch as Record<string, unknown>, merge: true }]);

/** A deleted event (soft delete, or a permanent delete that didn't finish). Only super admins ever see these. */
export const isDeletedEvent = (e: Pick<EventDoc, 'deleted' | 'deleting'> | null | undefined) => !!(e?.deleted || e?.deleting);

/**
 * Soft delete, what an organiser's Delete does. The event and its data stay in the database for super
 * admins, but it disappears for everyone else straight away: each attendee's and speaker's copy in
 * My events, Activity and Explore saves is removed, its certificates leave people's profiles, and the
 * event itself is unpublished and taken off its owner and team, so the security rules let only super
 * admins read it.
 */
export async function deleteEvent(ev: EventDoc, by: AppUser | null, onStep?: (s: string) => void) {
  const id = ev.id;
  onStep?.('Finding who joined or saved it…');
  // People's copies first, while this account still owns the event (the rules check that).
  const [joined, savers, roles, certs] = await Promise.all([
    backend.getCol<{ id: string }>(`events/${id}/attendees`),
    backend.getCol<{ id: string }>(`events/${id}/saved`),
    backend.getCol<{ id: string }>(`events/${id}/roles`).catch(() => []),
    backend.getCol<{ id: string }>('certificates', [['eventId', id]]).catch(() => []),
  ]);
  const ops: WriteOp[] = [];
  for (const uid of new Set([...joined, ...roles].map((a) => a.id))) ops.push({ type: 'delete', path: `users/${uid}/events/${id}` }, { type: 'delete', path: `users/${uid}/speaking/${id}` });
  for (const uid of new Set([...joined, ...savers].map((x) => x.id))) ops.push({ type: 'delete', path: `users/${uid}/swipes/${id}` });
  ops.push(...certs.map((c) => ({ type: 'set' as const, path: `certificates/${c.id}`, merge: true, data: { eventDeleted: true } })));
  onStep?.('Removing it for everyone…');
  if (ops.length) await backend.write(ops);
  await backend.write([{ type: 'set', path: `events/${id}`, merge: true, data: {
    deleted: true, deletedAt: new Date().toISOString(), deletedByEmail: by?.email ?? '',
    deletedFrom: { ownerUid: ev.ownerUid ?? '', teamEmails: ev.teamEmails ?? [], published: !!ev.published, linkAccess: !!ev.linkAccess },
    ownerUid: '', teamEmails: [], published: false, linkAccess: false,
  } }]);
}

/**
 * Permanent delete, for super admins only: the event, everything under it, its certificates and Pulse
 * activities, and each attendee's copy in My events and Explore saves.
 */
export async function purgeEvent(id: string, onStep?: (s: string) => void) {
  const subs = ['sessions', 'speakers', 'sessionKeys', 'preregistered', 'attendees', 'directory', 'private', 'attendance', 'feedback', 'connections', 'saved', 'sessionFeedback', 'assets', 'assetFiles', 'certIndex', 'media', 'roles', 'speakerFeedback', 'speakerFeedbackOwners', 'counters', 'announcements', 'checkinLog', 'speakerTries'];
  const ops: WriteOp[] = [];
  // Marks the event as being deleted, which also lets its check-in history be removed.
  onStep?.('Starting…');
  await backend.write([{ type: 'set', path: `events/${id}`, merge: true, data: { deleting: true } }]);
  onStep?.('Finding everything in this event…');
  ops.push({ type: 'delete', path: `speakerPins/${id}` });
  // Every lookup at once (they don't depend on each other), instead of ~30 reads one after another.
  const [joined, savers, codes, pulses, pings, certs, subDocs] = await Promise.all([
    backend.getCol<{ id: string }>(`events/${id}/attendees`),
    backend.getCol<{ id: string }>(`events/${id}/saved`),
    // Speaker codes for this event (top-level, so they're found by event).
    backend.getCol<{ id: string }>('speakerCodes', [['eventId', id]]).catch(() => []),
    backend.getCol<PulseDoc>('pulse', [['eventId', id]]).catch(() => []),
    // Meet Pings made at this event.
    backend.getCol<{ id: string; fromUid: string; toUid: string }>('pings', [['eventId', id]]).catch(() => []),
    // Certificates live in a top-level collection, linked by eventId.
    backend.getCol<{ id: string }>('certificates', [['eventId', id]]),
    Promise.all(subs.map((sub) => backend.getCol<{ id: string }>(`events/${id}/${sub}`))),
  ]);
  // People's own copies first (in the same batches as the rest, in this order).
  for (const a of joined) ops.push({ type: 'delete', path: `users/${a.id}/events/${id}` }, { type: 'delete', path: `users/${a.id}/speaking/${id}` });
  ops.push(...codes.map((c) => ({ type: 'delete' as const, path: `speakerCodes/${c.id}` })));
  for (const s of new Set([...joined.map((a) => a.id), ...savers.map((x) => x.id)])) ops.push({ type: 'delete', path: `users/${s}/swipes/${id}` });
  ops.push(...pings.map((p) => ({ type: 'delete' as const, path: `pings/${p.id}` })));
  // …and the notifications they sent (the request to the recipient, the acceptance to the sender).
  for (const p of pings) ops.push({ type: 'delete', path: `users/${p.toUid}/notifications/${p.id}` }, { type: 'delete', path: `users/${p.fromUid}/notifications/${p.id}_ok` });
  if (pulses.length) onStep?.('Removing Pulse sessions…');
  await Promise.all(pulses.map((p) => deletePulse(p)));
  subs.forEach((sub, i) => ops.push(...subDocs[i].map((d) => ({ type: 'delete' as const, path: `events/${id}/${sub}/${d.id}` }))));
  ops.push(...certs.map((c) => ({ type: 'delete' as const, path: `certificates/${c.id}` })));
  ops.push({ type: 'delete', path: `events/${id}` });
  onStep?.(`Deleting ${ops.length} records…`);
  await backend.write(ops);
}

export function saveSession(eventId: string, s: SessionDoc) {
  const id = s.id || backend.newId();
  return backend.write([{ type: 'set', path: `events/${eventId}/sessions/${id}`, data: strip(s) }]);
}
export const deleteSession = (eventId: string, id: string) =>
  backend.write([{ type: 'delete', path: `events/${eventId}/sessions/${id}` }]);

const lineupOf = (speakers: SpeakerDoc[]) =>
  // The lineup sits on the event record that everyone reads, so embedded photo data (data: URLs) stays off it.
  speakers.map(({ id, name, role, photo }) => ({ id, name, role, ...(photo && /^https?:/.test(photo) ? { photo } : {}) }));

/** Saves a speaker and refreshes the short public lineup on the event, which has no contact details. */
export async function saveSpeaker(eventId: string, s: SpeakerDoc, all: SpeakerDoc[]) {
  const id = s.id || backend.newId();
  const saved = { ...s, id };
  const next = s.id ? all.map((x) => (x.id === id ? saved : x)) : [...all, saved];
  await backend.write([
    // emailLower lets the speaker's own verified account find and claim this entry.
    { type: 'set', path: `events/${eventId}/speakers/${id}`, data: { ...strip(s), emailLower: (s.email ?? '').trim().toLowerCase() } },
    { type: 'set', path: `events/${eventId}`, data: { lineup: lineupOf(sortSpeakers(next)) }, merge: true },
  ]);
}
/**
 * Organiser assignment: makes an attendee a speaker at this event, on their existing account.
 * It is the third way to become a speaker, beside the pre-registered email and the four-digit code, and
 * shares the same records: if a speaker entry is already linked to them, or listed with their email and not
 * linked to anyone, that entry is used (never a duplicate); otherwise one is made from their attendee details.
 * The speaker role is given (or re-activated, if an organiser removed it before), so access is immediate.
 * Their attendee registration is left exactly as it is.
 */
export async function promoteToSpeaker(ev: Pick<EventDoc, 'id'>, a: AttendeeDoc, all: SpeakerDoc[], role: RoleDoc | null) {
  if (role?.active) return;
  const email = (a.email ?? '').trim().toLowerCase();
  const existing = all.find((s) => s.uid === a.uid)
    ?? all.find((s) => !s.uid && !!email && (s.emailLower || (s.email ?? '').toLowerCase()) === email);
  const id = existing?.id ?? backend.newId();
  const photo = a.photo && /^https:\/\//.test(a.photo) ? a.photo : '';
  const speaker: SpeakerDoc = existing ? { ...existing, uid: a.uid } : {
    id, name: a.name, role: a.designation || '', organisation: a.institution || '', topic: '', expertise: '', bio: '',
    // Contact details stay private (shared only by the speaker); the email is kept only so they can be recognised.
    email: '', phone: '', linkedin: '', website: '', links: [], photo, uid: a.uid, category: 'regular', order: 1_000_000 + all.length,
  };
  const next = existing ? all.map((s) => (s.id === id ? speaker : s)) : [...all, speaker];
  await backend.write([
    existing
      ? { type: 'set', path: `events/${ev.id}/speakers/${id}`, merge: true, data: { uid: a.uid } }
      : { type: 'set', path: `events/${ev.id}/speakers/${id}`, data: { ...strip(speaker), emailLower: email } },
    { type: 'set', path: `events/${ev.id}/roles/${a.uid}`, data: {
      uid: a.uid, name: a.name.slice(0, 80), email, roles: ['speaker'], speakerId: id, status: 'verified', active: true, pulse: true, code: 'ORGANISER', at: backend.now(),
    } },
    { type: 'set', path: `events/${ev.id}`, data: { lineup: lineupOf(sortSpeakers(next)) }, merge: true },
  ]);
}

export async function deleteSpeaker(eventId: string, id: string, all: SpeakerDoc[]) {
  await backend.write([
    { type: 'delete', path: `events/${eventId}/speakers/${id}` },
    { type: 'set', path: `events/${eventId}`, data: { lineup: lineupOf(sortSpeakers(all.filter((x) => x.id !== id))) }, merge: true },
  ]);
}

export const importPrereg = (eventId: string, people: PreregDoc[]) =>
  backend.write(people.map((p) => ({ type: 'set' as const, path: `events/${eventId}/preregistered/${p.id}`, data: strip(p) })));
export const deletePrereg = (eventId: string, id: string) =>
  backend.write([{ type: 'delete', path: `events/${eventId}/preregistered/${id}` }]);
export async function removeAttendee(eventId: string, uid: string) {
  await backend.write([
    { type: 'delete', path: `events/${eventId}/attendees/${uid}` },
    { type: 'delete', path: `events/${eventId}/directory/${uid}` },
    { type: 'delete', path: `users/${uid}/events/${eventId}` },
  ]);
  await syncCapacityCounter(eventId);
}

/**
 * Keeps the registration counter equal to the real number of attendees. Runs when the organiser
 * sets a capacity or removes someone; joins add one on the server as they happen.
 */
export async function syncCapacityCounter(eventId: string) {
  const ev = await backend.getDoc<EventDoc>(`events/${eventId}`);
  if (!ev || !(ev.capacity ?? 0)) return;
  const n = await backend.count(`events/${eventId}/attendees`);
  await backend.write([{ type: 'set', path: `events/${eventId}/counters/attendees`, data: { n } }]);
}

/**
 * Organiser check-in at the door, by pass QR or by hand ("Mark as present"). One record per attendee
 * per event (their attendee record), which their pass reads too. Each change is added to the history.
 */
export async function checkInAttendee(eventId: string, a: Pick<AttendeeDoc, 'uid' | 'name'>, method: 'pass' | 'manual', by: AppUser) {
  await backend.write([
    { type: 'set', path: `events/${eventId}/attendees/${a.uid}`, merge: true, data: { checkedIn: true, checkedInAt: backend.now(), checkInMethod: method, checkedInBy: by.uid } },
    { type: 'set', path: `events/${eventId}/checkinLog/${backend.newId()}`, data: { uid: a.uid, name: a.name, action: 'in', method, by: by.uid, byName: by.name || by.email, at: backend.now() } },
  ]);
}
export const undoCheckIn = (eventId: string, a: Pick<AttendeeDoc, 'uid' | 'name'>, by: AppUser) => backend.write([
  { type: 'set', path: `events/${eventId}/attendees/${a.uid}`, merge: true, data: { checkedIn: false, checkedInAt: null, checkInMethod: null, checkedInBy: null, checkInSession: null } },
  { type: 'set', path: `events/${eventId}/checkinLog/${backend.newId()}`, data: { uid: a.uid, name: a.name, action: 'undo', method: '', by: by.uid, byName: by.name || by.email, at: backend.now() } },
]);

/** Gives older registrations a pass ID the first time their pass is opened. */
export const ensureRegId = (eventId: string, uid: string) =>
  backend.write([{ type: 'set', path: `events/${eventId}/attendees/${uid}`, merge: true, data: { regId: newRegId() } }]);

export const saveEventInfo = (eventId: string, info: Omit<EventInfoDoc, 'id'>) =>
  backend.write([{ type: 'set', path: `events/${eventId}/private/info`, data: { ...info } }]);

/** Adds reviewed sessions from an uploaded schedule, creating any speakers that don't exist yet. */
export async function importSchedule(eventId: string, rows: ImportRow[], existing: SpeakerDoc[]) {
  const byName = new Map(existing.map((s) => [normName(s.name), s.id]));
  const created: SpeakerDoc[] = [];
  const ops: WriteOp[] = [];
  for (const r of rows) {
    const speakerIds: string[] = [];
    for (const entry of r.speakers) {
      const { name, organisation } = splitSpeaker(entry);
      if (!name) continue;
      let id = byName.get(normName(name));
      if (!id) {
        id = backend.newId();
        byName.set(normName(name), id);
        const sp: SpeakerDoc = { id, name, role: 'Resource person', organisation, topic: r.title, expertise: '', bio: '', email: '', phone: '', linkedin: '', website: '', links: [] };
        created.push(sp);
        ops.push({ type: 'set', path: `events/${eventId}/speakers/${id}`, data: strip(sp) });
      }
      if (!speakerIds.includes(id)) speakerIds.push(id);
    }
    const session: Omit<SessionDoc, 'id'> = {
      title: r.title.trim(), description: '', room: '', startsAt: r.startsAt, endsAt: r.endsAt, speakerIds, kind: r.kind, feedbackOn: r.feedbackOn,
    };
    ops.push({ type: 'set', path: `events/${eventId}/sessions/${backend.newId()}`, data: session as unknown as Record<string, unknown> });
  }
  ops.push({ type: 'set', path: `events/${eventId}`, data: { lineup: lineupOf([...existing, ...created]) }, merge: true });
  await backend.write(ops);
  return { sessions: rows.length, speakers: created.length };
}
export interface ImportRow { title: string; startsAt: string; endsAt: string; speakers: string[]; kind: SessionKind; feedbackOn: boolean }

export const addOrganiser = (email: string) =>
  backend.write([{ type: 'set', path: `organisers/${email.trim().toLowerCase()}`, data: { addedAt: backend.now() } }]);
export const removeOrganiser = (email: string) =>
  backend.write([{ type: 'delete', path: `organisers/${email}` }]);

/**
 * Removes a person's copies of events that no longer exist (deleted before hard delete
 * existed, or while they were offline). Each copy costs one read to check, so this runs at
 * most once a day per person on each device (it used to run every session).
 */
export async function forgetDeletedEvents(uid: string, ids: string[], scope = 'events'): Promise<string[]> {
  if (!dueEvery(`gather-healed-${scope}-${uid}`, TIDY_EVERY_MS)) return [];
  const gone: string[] = [];
  await Promise.all(ids.map(async (id) => {
    try { if (!(await backend.getDoc(`events/${id}`))) gone.push(id); } catch { /* not readable is not proof it is gone */ }
  }));
  // One batch for all the removals instead of two writes per event.
  if (gone.length) await backend.write(gone.flatMap((id) => [
    { type: 'delete' as const, path: `users/${uid}/events/${id}` },
    { type: 'delete' as const, path: `users/${uid}/swipes/${id}` },
  ])).catch(() => {});
  return gone;
}
