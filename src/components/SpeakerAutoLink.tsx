'use client';

import { useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { backend } from '../lib/backend';
import { dueEvery } from '../lib/once';
import { claimByEmail, findMyAssignment, fillAccountPhoto } from '../lib/speakers';
import type { SpeakingDoc } from '../lib/types';
import { getUpcomingEvents } from '../lib/upcoming';
import { useToast } from './ui';

/** How often one device re-checks the speaker lists after sign-in (each check reads the upcoming events once). */
const CHECK_EVERY_MS = 3 * 3600_000;

/**
 * Right after a person signs in, finds the upcoming events whose organiser listed them as a speaker with this
 * verified email, and links those entries to the account with the existing claim flow (speaker role, Speaker
 * area, and registration at the event). Before, this only happened once they opened that event's page.
 * It also fills a linked speaker's missing photo with their account photo. Renders nothing.
 */
export function SpeakerAutoLink() {
  const { user } = useAuth();
  const toast = useToast();
  useEffect(() => {
    if (!user?.email || !user.emailVerified) return;
    if (!dueEvery(`gather-speaker-check-${user.uid}`, CHECK_EVERY_MS)) return;
    let live = true;
    (async () => {
      const [events, speaking] = await Promise.all([
        getUpcomingEvents(20),
        backend.getCol<SpeakingDoc>(`users/${user.uid}/speaking`).catch(() => [] as SpeakingDoc[]),
      ]);
      const already = new Set(speaking.map((s) => s.eventId));
      for (const ev of events) {
        if (!live) return;
        if (already.has(ev.id)) continue;
        const sp = await findMyAssignment(user, ev.id);
        if (!sp || sp.uid) continue; // not listed, or already linked to this account
        const r = await claimByEmail(user, ev, sp);
        if (r.ok && live) toast(`You’re a speaker at ${ev.title}. It’s in your Speaker area.`);
      }
      // Speakers linked earlier without a photo: use the account photo, so every speaker card shows it.
      for (const s of speaking) { if (!live) return; await fillAccountPhoto(user, s.eventId, s.speakerId); }
    })().catch(() => { /* not critical: tried again on the next check */ });
    return () => { live = false; };
    // Runs once per signed-in account (and at most every few hours on a device).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);
  return null;
}
