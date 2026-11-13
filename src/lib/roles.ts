'use client';

import { useAuth } from './auth';
import { useCol } from './live';
import { useMode } from './mode';
import type { SpeakingDoc } from './types';

/**
 * What this person can do with Gather Pulse. Organisers can run sessions anywhere; verified
 * speakers can run them for the events they speak at. Everyone else takes part through Activity.
 * The security rules enforce the same thing.
 */
export function usePulseRole() {
  const { user } = useAuth();
  const { mode } = useMode();
  const speaking = useCol<SpeakingDoc>(user ? `users/${user.uid}/speaking` : null);
  const speakerEvents = speaking.data.filter((s) => s.pulse);
  // Anyone can organise; Pulse management shows in organiser mode (or for speakers).
  const organiser = mode === 'organiser';
  return { loading: speaking.loading, organiser, speakerEvents, speaker: speaking.data.length > 0, canManage: organiser || speakerEvents.length > 0 };
}
