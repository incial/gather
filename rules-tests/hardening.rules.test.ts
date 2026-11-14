import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Security hardening: every record a person writes is tied to their own account ID, can't carry
 * extra fields or someone else's identity, and can't be made huge. Each test first shows the write
 * exactly as the app makes it still works, then that the abuse is refused.
 */
let env: RulesTestEnvironment;
const E = 'events/e1';
const asha = () => env.authenticatedContext('asha', { email: 'asha@x.test', email_verified: true }).firestore();
const ben = () => env.authenticatedContext('ben', { email: 'ben@x.test', email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const big = (n: number) => 'x'.repeat(n);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-hardening',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, E), { ownerUid: 'org', published: true, registration: 'open', feedbackOpen: true, title: 'E' });
    await setDoc(doc(db, `${E}/attendees/asha`), { uid: 'asha', email: 'asha@x.test', joinedAt: 't', source: 'app', name: 'Asha', phone: '1', checkedIn: false, regId: 'ABCD-EF23' });
    await setDoc(doc(db, `${E}/attendees/ben`), { uid: 'ben', email: 'ben@x.test', joinedAt: 't', source: 'app', name: 'Ben', phone: '2', checkedIn: false });
    await setDoc(doc(db, `${E}/sessions/s1`), { title: 'S1', feedbackOn: true, selfCheckIn: true });
    await setDoc(doc(db, `${E}/sessionKeys/s1`), { key: 'ABC123', prev: 'ZZZ999', open: true, expiresAt: Timestamp.fromMillis(Date.now() + 600_000) });
    await setDoc(doc(db, `${E}/speakers/sp1`), { name: 'Speaker' });
    await setDoc(doc(db, 'rateLimits/wa-sender_asha'), { hits: [1, 2, 3] });
  });
});

describe('joining (attendee record)', () => {
  const join = (extra = {}) => ({ uid: 'carl', email: 'carl@x.test', name: 'Carl', phone: '9', institution: 'X', department: '', designation: '', photo: '', source: 'app', listed: false, shareContact: false, joinedAt: serverTimestamp(), regId: 'WXYZ-2345', ...extra });
  const carl = () => env.authenticatedContext('carl', { email: 'carl@x.test', email_verified: true }).firestore();
  it('the app’s join works', async () => {
    await assertSucceeds(setDoc(doc(carl(), `${E}/attendees/carl`), join()));
  });
  it('can’t register under another account’s ID or email', async () => {
    await assertFails(setDoc(doc(carl(), `${E}/attendees/dan`), join({ uid: 'dan' })));
    await assertFails(setDoc(doc(carl(), `${E}/attendees/carl`), join({ email: 'asha@x.test' })));
  });
  it('a pass ID must have the app’s shape (no copying odd values onto a pass)', async () => {
    await assertFails(setDoc(doc(carl(), `${E}/attendees/carl`), join({ regId: 'whatever I like' })));
  });
  it('oversized details are refused', async () => {
    await assertFails(setDoc(doc(carl(), `${E}/attendees/carl`), join({ name: big(500) })));
    await assertFails(setDoc(doc(carl(), `${E}/attendees/carl`), join({ institution: big(5000) })));
  });
});

describe('editing your own attendee record', () => {
  it('profile edits work, the pass ID never changes', async () => {
    await assertSucceeds(setDoc(doc(asha(), `${E}/attendees/asha`), { name: 'Asha K', institution: 'AJCE' }, { merge: true }));
    await assertFails(setDoc(doc(asha(), `${E}/attendees/asha`), { regId: 'ZZZZ-2222' }, { merge: true }));
  });
  it('a pass ID can be added once, in the right shape', async () => {
    await assertSucceeds(setDoc(doc(ben(), `${E}/attendees/ben`), { regId: 'BBBB-2345' }, { merge: true }));
  });
  it('a badly shaped first pass ID is refused', async () => {
    await assertFails(setDoc(doc(ben(), `${E}/attendees/ben`), { regId: 'ABCD-EF23-and-more' }, { merge: true }));
  });
  it('no one edits someone else’s record', async () => {
    await assertFails(setDoc(doc(ben(), `${E}/attendees/asha`), { name: 'Hacked' }, { merge: true }));
  });
});

describe('session check-in records', () => {
  const qr = (extra = {}) => ({ uid: 'asha', sessionId: 's1', name: 'Asha', email: 'asha@x.test', method: 'qr', key: 'ABC123', at: serverTimestamp(), ...extra });
  it('the app’s room-code check-in works', async () => {
    await assertSucceeds(setDoc(doc(asha(), `${E}/attendance/s1_asha`), qr()));
  });
  it('can’t check in someone else or smuggle extra fields', async () => {
    await assertFails(setDoc(doc(asha(), `${E}/attendance/s1_ben`), qr({ uid: 'ben' })));
    await assertFails(setDoc(doc(asha(), `${E}/attendance/s1_asha`), qr({ method: 'qr', staffApproved: true })));
    await assertFails(setDoc(doc(asha(), `${E}/attendance/s1_asha`), qr({ name: big(1000) })));
  });
  it('self check-in can’t carry an oversized name', async () => {
    await assertSucceeds(setDoc(doc(asha(), `${E}/attendance/s1_asha`), { uid: 'asha', sessionId: 's1', name: 'Asha', email: 'asha@x.test', method: 'self', at: serverTimestamp() }));
    await assertFails(setDoc(doc(ben(), `${E}/attendance/s1_ben`), { uid: 'ben', sessionId: 's1', name: big(1000), email: 'ben@x.test', method: 'self', at: serverTimestamp() }));
  });
  it('people can only read their own check-ins', async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), `${E}/attendance/s1_ben`), qr({ uid: 'ben' })));
    await assertFails(getDoc(doc(asha(), `${E}/attendance/s1_ben`)));
  });
});

describe('feedback', () => {
  const fb = (extra = {}) => ({ uid: 'asha', name: 'Asha', email: 'asha@x.test', answers: { q1: 5 }, speakerRatings: { sp1: 4 }, at: serverTimestamp(), ...extra });
  it('the app’s overall feedback works; extra fields and huge answer sets don’t', async () => {
    await assertSucceeds(setDoc(doc(asha(), `${E}/feedback/asha`), fb()));
    await assertFails(setDoc(doc(asha(), `${E}/feedback/asha`), fb({ adminNote: 'x' })));
    await assertFails(setDoc(doc(asha(), `${E}/feedback/asha`), fb({ answers: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`q${i}`, 1])) })));
    await assertFails(setDoc(doc(asha(), `${E}/feedback/ben`), fb({ uid: 'ben' })));
  });
  const sf = (extra = {}) => ({ uid: 'asha', sessionId: 's1', name: 'Asha', email: 'asha@x.test', rating: 4, comment: 'Good', at: serverTimestamp(), ...extra });
  it('session feedback works; long comments and extra fields don’t', async () => {
    await assertSucceeds(setDoc(doc(asha(), `${E}/sessionFeedback/s1_asha`), sf()));
    await assertFails(setDoc(doc(asha(), `${E}/sessionFeedback/s1_asha`), sf({ comment: big(1001) })));
    await assertFails(setDoc(doc(asha(), `${E}/sessionFeedback/s1_asha`), sf({ featured: true })));
  });
});

describe('speaker connections', () => {
  const c = (extra = {}) => ({ uid: 'asha', speakerId: 'sp1', speakerName: 'Speaker', name: 'Asha', email: 'asha@x.test', method: 'qr', at: serverTimestamp(), ...extra });
  it('the app’s connect works; spoofed owners, extra fields and huge values don’t', async () => {
    await assertSucceeds(setDoc(doc(asha(), `${E}/connections/asha_sp1`), c()));
    await assertFails(setDoc(doc(asha(), `${E}/connections/ben_sp1`), c({ uid: 'ben' })));
    await assertFails(setDoc(doc(asha(), `${E}/connections/asha_sp1`), c({ extra: 1 })));
    await assertFails(setDoc(doc(asha(), `${E}/connections/asha_sp1`), c({ speakerName: big(500) })));
  });
});

describe('the People list (directory)', () => {
  it('your own entry works; oversized fields don’t; you can’t write someone else’s', async () => {
    const d = { uid: 'asha', name: 'Asha', institution: 'X', department: '', designation: '', photo: '' };
    await assertSucceeds(setDoc(doc(asha(), `${E}/directory/asha`), d));
    await assertFails(setDoc(doc(asha(), `${E}/directory/asha`), { ...d, designation: big(1000) }));
    await assertFails(setDoc(doc(asha(), `${E}/directory/ben`), { ...d, uid: 'ben' }));
  });
});

describe('server-only records', () => {
  it('rate-limit records can’t be read or changed by anyone in the app', async () => {
    await assertFails(getDoc(doc(asha(), 'rateLimits/wa-sender_asha')));
    await assertFails(setDoc(doc(asha(), 'rateLimits/wa-sender_asha'), { hits: [] }));
    await assertFails(getDoc(doc(anon(), 'rateLimits/wa-sender_asha')));
  });
  it('private account data stays private', async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'users/ben/profile/me'), { phone: '123', whatsappOptIn: true }));
    await assertFails(getDoc(doc(asha(), 'users/ben/profile/me')));
    await assertFails(getDoc(doc(asha(), `${E}/attendees/ben`)));
  });
});
