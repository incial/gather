'use client';

import { useRouter } from 'next/navigation';
import { useMode, type Mode } from '../lib/mode';

const COPY: Record<Mode, string> = {
  attendee: 'Join events, check in, meet people and take part in live polls.',
  organiser: 'Create events, manage your events and organise your activities.',
};

/**
 * "Switch your mode": one account, two ways of using Gather. Switching never signs you out; it
 * changes the dashboard. What you can actually do is checked by the security rules either way.
 */
export function RoleToggle({ compact, onSwitched }: { compact?: boolean; onSwitched?: () => void }) {
  const { mode, setMode, canOrganise } = useMode();
  const nav = useRouter();
  if (!canOrganise) return null;
  const go = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    onSwitched?.();
    nav.push(m === 'organiser' ? '/admin' : '/');
  };
  return (
    <div className={`role-toggle${compact ? ' compact' : ''}`}>
      <span className="role-toggle-label">Switch your mode</span>
      <div className="seg role-seg" role="radiogroup" aria-label="Mode">
        {(['attendee', 'organiser'] as Mode[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => go(m)}>
            {m === 'attendee' ? 'Attendee' : 'Organiser'}
          </button>
        ))}
      </div>
      <small className="muted">{COPY[mode]}</small>
    </div>
  );
}
