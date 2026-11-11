'use client';

import { Bookmark } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/format';
import { swipe, unsave, useSwipes } from '../lib/saved';
import type { EventDoc } from '../lib/types';
import { useToast } from './ui';

/**
 * Save / Saved toggle for an event. Shows the new state at once, blocks repeated taps while
 * saving, and returns to the true state from the database if the write fails.
 */
export function SaveEventButton({ event, compact }: { event: EventDoc; compact?: boolean }) {
  const { user } = useAuth();
  const swipes = useSwipes(user?.uid);
  const toast = useToast();
  const [pending, setPending] = useState<boolean | null>(null);
  if (!user) return null;
  const saved = pending ?? swipes.isSaved(event.id);
  async function toggle() {
    if (pending !== null) return;
    const next = !saved;
    setPending(next);
    try {
      await (next ? swipe(event, user!, 'save') : unsave(event.id, user!.uid));
      toast(next ? 'Saved. Find it in your profile under Saved events.' : 'Removed from saved');
    } catch (x) {
      toast(friendlyError(x), 'err');
    }
    // The live list now holds the real state, whether the write worked or not.
    setPending(null);
  }
  return (
    <button className={`${compact ? 'chip' : 'btn btn-ghost btn-sm'} save-btn${saved ? ' on' : ''}`} aria-pressed={saved} disabled={pending !== null || swipes.loading} onClick={toggle}>
      <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" /> {saved ? 'Saved' : 'Save'}
    </button>
  );
}
