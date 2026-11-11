'use client';

import { useEffect, useState } from 'react';
import type { SessionDoc } from '../../lib/types';
import { useEventCtx } from './context';
import { RateModal } from './RateModal';

const WINDOW_MS = 6 * 60 * 60 * 1000; // ask for sessions that ended in the last 6 hours
const key = (eventId: string) => `gather-feedback-asked-${eventId}`;

function readAsked(eventId: string): string[] {
  try { return JSON.parse(localStorage.getItem(key(eventId)) ?? '[]'); } catch { return []; }
}

/** Pops up a rating card once for each session that just finished. "Not now" means it won't ask again for that session. */
export function FeedbackPrompt() {
  const { event, sessions, sessionFeedback } = useEventCtx();
  const [now, setNow] = useState(() => Date.now());
  const [showing, setShowing] = useState<SessionDoc | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (showing) return;
    const asked = new Set(readAsked(event.id));
    const rated = new Set(sessionFeedback.map((f) => f.sessionId));
    const due = sessions
      .filter((s) => s.feedbackOn !== false && (s.kind ?? 'talk') !== 'break')
      .filter((s) => { const end = Date.parse(s.endsAt); return end <= now && now - end < WINDOW_MS; })
      .filter((s) => !rated.has(s.id) && !asked.has(s.id))
      .sort((a, b) => b.endsAt.localeCompare(a.endsAt))[0];
    if (due) setShowing(due);
  }, [now, sessions, sessionFeedback, event.id, showing]);

  if (!showing) return null;
  const close = () => {
    try { localStorage.setItem(key(event.id), JSON.stringify([...readAsked(event.id), showing.id])); } catch { /* private mode */ }
    setShowing(null);
  };
  return <RateModal session={showing} onClose={close} prompt />;
}
