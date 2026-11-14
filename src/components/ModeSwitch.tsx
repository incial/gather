'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMode, type Mode } from '../lib/mode';
import { Icon } from './ui';

/** Where switching mode lands: the same event's other side when there is one, otherwise that mode's home. */
export function switchTarget(to: Mode, pathname: string): string {
  const ev = /^\/admin\/e\/([^/]+)/.exec(pathname)?.[1];
  if (to === 'attendee') return ev ? `/e/${ev}` : '/';
  return '/admin';
}

/** Fired when "Create Event" is pressed while the organiser home is already open, so it opens the form in place. */
export const CREATE_EVENT = 'gather:create-event';

const LABEL: Record<Mode, { text: string; icon: 'ticket' | 'plus'; hint: string }> = {
  attendee: { text: 'Events', icon: 'ticket', hint: 'Events: the events you’re going to (attendee mode)' },
  organiser: { text: 'Create Event', icon: 'plus', hint: 'Create Event: create and run your own events (organiser mode)' },
};

/**
 * Events / Create Event switch in the top bar of every signed-in screen: attendee and organiser mode
 * of one account. "Events" shows the events you're going to; "Create Event" switches to organiser
 * mode and opens the new-event form. Switching never signs you out, and what you can actually do
 * is still checked by the security rules.
 */
export function ModeSwitch() {
  const { mode, setMode, canOrganise } = useMode();
  const nav = useRouter();
  const pathname = usePathname();
  if (!canOrganise) return null;
  const go = (m: Mode) => {
    if (m === 'organiser') {
      setMode(m);
      if (pathname === '/admin') window.dispatchEvent(new Event(CREATE_EVENT));
      else nav.push('/admin?create=1');
      return;
    }
    if (m === mode) return;
    setMode(m);
    nav.push(switchTarget(m, pathname));
  };
  return (
    <div className={`mode-switch is-${mode}`} role="radiogroup" aria-label="Mode">
      {(['attendee', 'organiser'] as Mode[]).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => go(m)} title={LABEL[m].hint}>
          <Icon name={LABEL[m].icon} size={16} />
          <span>{LABEL[m].text}</span>
        </button>
      ))}
    </div>
  );
}

/** The viewer's local time with its offset ("1:52 PM GMT+5:30"), so event times have a reference. Desktop only. */
export function LocalTime() {
  const [now, setNow] = useState('');
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'shortOffset' });
    const tick = () => setNow(fmt.format(new Date()));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return <span className="local-time" aria-label={`Your local time ${now}`}>{now}</span>;
}
