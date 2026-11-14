import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, documentId, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The narrower queries the app now runs instead of downloading whole collections:
 * upcoming events on the home page and Explore, and the newest notifications in Inbox and Activity.
 * They must work for the people who use them and must not open anything else up.
 */
let env: RulesTestEnvironment;
const anon = () => env.unauthenticatedContext().firestore();
const asha = () => env.authenticatedContext('asha', { email: 'asha@x.test', email_verified: true }).firestore();
type Db = ReturnType<typeof anon>;

const past = '2020-01-01T00:00:00.000Z';
const soon = '2099-01-01T00:00:00.000Z';
const later = '2099-06-01T00:00:00.000Z';
const NOW = '2026-11-14T00:00:00.000Z';

// Same shape as getUpcomingEvents() → firebaseBackend buildQuery.
const upcoming = (db: Db, n = 30) => query(collection(db, 'events'), where('published', '==', true), where('endsAt', '>=', NOW),
  orderBy('endsAt'), orderBy(documentId()), limit(n));
const recentNotes = (db: Db, uid: string) => query(collection(db, `users/${uid}/notifications`), orderBy('at', 'desc'), orderBy(documentId(), 'desc'), limit(30));

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-queries',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'events/old'), { ownerUid: 'org', published: true, title: 'Old', startsAt: past, endsAt: past });
    await setDoc(doc(db, 'events/next'), { ownerUid: 'org', published: true, title: 'Next', startsAt: soon, endsAt: soon });
    await setDoc(doc(db, 'events/after'), { ownerUid: 'org', published: true, title: 'After', startsAt: later, endsAt: later });
    await setDoc(doc(db, 'events/draft'), { ownerUid: 'org', published: false, title: 'Draft', startsAt: soon, endsAt: soon });
    // A soft-deleted event: unpublished, no owner or team.
    await setDoc(doc(db, 'events/gone'), { ownerUid: '', teamEmails: [], published: false, deleted: true, title: 'Gone', startsAt: soon, endsAt: soon });
    await setDoc(doc(db, 'users/asha/notifications/n1'), { type: 'ping', read: false, at: '2026-11-01T00:00:00.000Z' });
    await setDoc(doc(db, 'users/asha/notifications/n2'), { type: 'ping', read: true, at: '2026-11-02T00:00:00.000Z' });
    await setDoc(doc(db, 'users/ben/notifications/n3'), { type: 'ping', read: false, at: '2026-11-03T00:00:00.000Z' });
  });
});

describe('upcoming events query (home page and Explore)', () => {
  it('works signed out and returns only published events that have not ended, soonest first', async () => {
    const snap = await assertSucceeds(getDocs(upcoming(anon())));
    expect(snap.docs.map((d) => d.id)).toEqual(['next', 'after']);
  });

  it('respects the limit', async () => {
    const snap = await assertSucceeds(getDocs(upcoming(anon(), 1)));
    expect(snap.docs.map((d) => d.id)).toEqual(['next']);
  });

  it('can’t be widened to unpublished or soft-deleted events', async () => {
    const db = anon();
    await assertFails(getDocs(query(collection(db, 'events'), where('endsAt', '>=', NOW), orderBy('endsAt'), limit(30))));
    await assertFails(getDocs(query(collection(db, 'events'), where('published', '==', false), where('endsAt', '>=', NOW), orderBy('endsAt'), limit(30))));
    await assertFails(getDocs(query(collection(asha(), 'events'), where('deleted', '==', true), orderBy('endsAt'), limit(30))));
  });
});

describe('newest notifications query (Inbox and Activity)', () => {
  it('a person reads their own newest notifications, newest first', async () => {
    const snap = await assertSucceeds(getDocs(recentNotes(asha(), 'asha')));
    expect(snap.docs.map((d) => d.id)).toEqual(['n2', 'n1']);
  });

  it('a person can’t read someone else’s, and signed-out visitors can’t read any', async () => {
    await assertFails(getDocs(recentNotes(asha(), 'ben')));
    await assertFails(getDocs(recentNotes(anon(), 'asha')));
  });

  it('the unread query used to mark them read works for the owner only', async () => {
    await assertSucceeds(getDocs(query(collection(asha(), 'users/asha/notifications'), where('read', '==', false))));
    await assertFails(getDocs(query(collection(asha(), 'users/ben/notifications'), where('read', '==', false))));
  });
});
