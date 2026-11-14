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

/**
 * Attendee / Organiser switch in the top bar of every signed-in screen. One account, two ways of
 * using Gather: switching never signs you out, it changes what the app shows. What you can actually
 * do is still checked by the security rules.
 */
export function ModeSwitch() {
  const { mode, setMode, canOrganise } = useMode();
  const nav = useRouter();
  const pathname = usePathname();
  if (!canOrganise) return null;
  const go = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    nav.push(switchTarget(m, pathname));
  };
  return (
    <div className={`mode-switch is-${mode}`} role="radiogroup" aria-label="Mode">
      {(['attendee', 'organiser'] as Mode[]).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => go(m)}
          title={m === 'attendee' ? 'Attendee mode: events you’re going to' : 'Organiser mode: events you run'}>
          <Icon name={m === 'attendee' ? 'ticket' : 'calendar'} size={16} />
          <span>{m === 'attendee' ? 'Attendee' : 'Organiser'}</span>
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
