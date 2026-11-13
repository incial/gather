import { backend, type WriteOp } from './backend';
import { deletePulse } from './pulse/api';
import { newRegId, sortSpeakers } from './speakers';
import { swipe, unsave } from './saved';
import type { PulseDoc } from './pulse/types';
import { FDP_EVENT, FDP_SESSIONS, FDP_SPEAKERS } from './programme';
import { DEFAULT_QUESTIONS } from './questions';
import { normName, splitSpeaker } from './scheduleParse';
import type {
  AppUser, AttendeeDoc, ConnectionDoc, EventDoc, EventInfoDoc, FeedbackDoc, MembershipDoc, PreregDoc, SessionKind,
  SessionDoc, SpeakerDoc, SwipeDoc,
} from './types';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I, easier to read aloud
export function randomCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const strip = <T extends { id: string }>({ id: _id, ...rest }: T) => rest as unknown as Record<string, unknown>;

/* ---------- Joining ---------- */

export const findEventByCode = async (code: string) =>
  (await backend.getCol<EventDoc>('events', [['joinCode', code.trim()], ['published', true]]))[0] ?? null;

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
  const event = await backend.getDoc<EventDoc>(`events/${eventId}`);
  if (!event) return { joined: false, event: null };
  const saved = await getMyProfile(user.uid);
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
  if (await backend.getDoc(path)) return 'already';
  const session: WriteOp = { type: 'set', path, data: key === null
    ? { uid: me.uid, sessionId, name: me.name, email: me.email, method: 'self', at: backend.now() }
    : { uid: me.uid, sessionId, name: me.name, email: me.email, method: 'qr', key: key.trim().toUpperCase(), at: backend.now() } };
  // The first scan of the event also marks you present at the event (same record your pass and the organiser use).
  const fresh = await backend.getDoc<AttendeeDoc>(`events/${eventId}/attendees/${me.uid}`).catch(() => null);
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

/**
 * Hard delete: the event, everything under it, its certificates and Pulse activities, and each
 * attendee's copy in My events and Explore saves, so it disappears for everyone straight away.
 */
export async function deleteEvent(id: string, onStep?: (s: string) => void) {
  const subs = ['sessions', 'speakers', 'sessionKeys', 'preregistered', 'attendees', 'directory', 'private', 'attendance', 'feedback', 'connections', 'saved', 'sessionFeedback', 'assets', 'assetFiles', 'certIndex', 'media', 'roles', 'speakerFeedback', 'speakerFeedbackOwners', 'counters', 'announcements', 'checkinLog', 'speakerTries'];
  const ops: WriteOp[] = [];
  // Marks the event as being deleted, which also lets its check-in history be removed.
  onStep?.('Starting…');
  await backend.write([{ type: 'set', path: `events/${id}`, merge: true, data: { deleting: true } }]);
  onStep?.('Finding everything in this event…');
  ops.push({ type: 'delete', path: `speakerPins/${id}` });
  // People's own copies first, while the attendee and saved lists still exist.
  const [joined, savers] = await Promise.all([
    backend.getCol<{ id: string }>(`events/${id}/attendees`),
    backend.getCol<{ id: string }>(`events/${id}/saved`),
  ]);
  for (const a of joined) ops.push({ type: 'delete', path: `users/${a.id}/events/${id}` }, { type: 'delete', path: `users/${a.id}/speaking/${id}` });
  // Speaker codes for this event (top-level, so they're found by event).
  const codes = await backend.getCol<{ id: string }>('speakerCodes', [['eventId', id]]).catch(() => []);
  ops.push(...codes.map((c) => ({ type: 'delete' as const, path: `speakerCodes/${c.id}` })));
  for (const s of new Set([...joined.map((a) => a.id), ...savers.map((x) => x.id)])) ops.push({ type: 'delete', path: `users/${s}/swipes/${id}` });
  const pulses = await backend.getCol<PulseDoc>('pulse', [['eventId', id]]).catch(() => []);
  // Meet Pings made at this event.
  const pings = await backend.getCol<{ id: string; fromUid: string; toUid: string }>('pings', [['eventId', id]]).catch(() => []);
  ops.push(...pings.map((p) => ({ type: 'delete' as const, path: `pings/${p.id}` })));
  // …and the notifications they sent (the request to the recipient, the acceptance to the sender).
  for (const p of pings) ops.push({ type: 'delete', path: `users/${p.toUid}/notifications/${p.id}` }, { type: 'delete', path: `users/${p.fromUid}/notifications/${p.id}_ok` });
  if (pulses.length) onStep?.('Removing Pulse sessions…');
  for (const p of pulses) await deletePulse(p);
  for (const sub of subs) {
    const docs = await backend.getCol<{ id: string }>(`events/${id}/${sub}`);
    ops.push(...docs.map((d) => ({ type: 'delete' as const, path: `events/${id}/${sub}/${d.id}` })));
  }
  // Certificates live in a top-level collection, linked by eventId.
  const certs = await backend.getCol<{ id: string }>('certificates', [['eventId', id]]);
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
 * existed, or while they were offline). Runs at most once per session per person.
 */
export async function forgetDeletedEvents(uid: string, ids: string[], scope = 'events'): Promise<string[]> {
  const key = `gather-healed-${scope}-${uid}`;
  try { if (sessionStorage.getItem(key)) return []; sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
  const gone: string[] = [];
  await Promise.all(ids.map(async (id) => {
    try { if (!(await backend.getDoc(`events/${id}`))) gone.push(id); } catch { /* not readable is not proof it is gone */ }
  }));
  if (gone.length) {
    await Promise.all(gone.flatMap((id) => [
      backend.write([{ type: 'delete', path: `users/${uid}/events/${id}` }]).catch(() => {}),
      backend.write([{ type: 'delete', path: `users/${uid}/swipes/${id}` }]).catch(() => {}),
    ]));
  }
  return gone;
}
