'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { backend } from '../lib/backend';
import { useMode } from '../lib/mode';
import { Avatar, Icon } from './ui';
import { NotificationBell } from './NotificationBell';
import { RoleToggle } from './RoleToggle';

/** Profile menu with the Organiser / Attendee switch. Shown on every signed-in screen. */
export function AccountMenu({ photo }: { photo?: string }) {
  const { user, isSuper } = useAuth();
  const { mode, canOrganise } = useMode();
  const nav = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!user) return null;

  return (
    <div className="acct" ref={box}>
      {/* Attendees have Alerts in the menu bar; organisers keep the bell here. */}
      {mode === 'organiser' && <NotificationBell />}
      <button className="acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen(!open)}>
        <Avatar id={user.uid} name={user.name || user.email} photo={photo ?? user.photo} size={40} />
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-who">
            <b>{user.name || 'Your account'}</b>
            <small>{user.email}</small>
            {canOrganise && <span className={`mode-pill mode-${mode}`}>{mode === 'organiser' ? 'Organiser mode' : 'Attendee mode'}</span>}
          </div>
          <Link role="menuitem" href="/profile" onClick={() => setOpen(false)}><Icon name="speakers" size={18} /> My profile</Link>
          <Link role="menuitem" href="/profile/edit" onClick={() => setOpen(false)}><Icon name="feedback" size={18} /> Edit profile</Link>
          <Link role="menuitem" href="/pulse" onClick={() => setOpen(false)}><Icon name="sparkle" size={18} /> Gather Pulse</Link>
          <Link role="menuitem" href="/speaker" onClick={() => setOpen(false)}><Icon name="mic" size={18} /> Speaker area</Link>
          <Link role="menuitem" href="/inbox" onClick={() => setOpen(false)}><Icon name="people" size={18} /> Meet Pings</Link>
          {isSuper && <Link role="menuitem" href="/god" onClick={() => setOpen(false)}><Icon name="verified" size={18} /> God view</Link>}
          <div className="acct-toggle"><RoleToggle compact onSwitched={() => setOpen(false)} /></div>
          <button role="menuitem" className="acct-out" onClick={() => { setOpen(false); backend.signOut().then(() => nav.replace('/')); }}><Icon name="back" size={18} /> Sign out</button>
        </div>
      )}
    </div>
  );
}
