'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DemoBanner, ErrorNote, Icon, Logo } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useMode } from '../lib/mode';
import { backend, isDemo } from '../lib/backend';
import { friendlyError } from '../lib/format';

const COPY = {
  attendee: { title: 'Attendee login', text: 'See your events, join with a code or QR, and get everything for the day in one place.', home: '/', other: ['/organiser/login', 'Running an event? Organiser login'] },
  organiser: { title: 'Organiser login', text: 'Create events, run check-in, and download attendance and feedback.', home: '/admin', other: ['/login', 'Attending an event? Attendee login'] },
} as const;

export function Login({ role }: { role: keyof typeof COPY }) {
  const c = COPY[role];
  const params = useSearchParams();
  const raw = params.get('next') ?? c.home;
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : c.home; // stay inside the app
  const nav = useRouter();
  const { user } = useAuth();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const { setMode } = useMode();
  useEffect(() => {
    if (!user) return;
    setMode(role); // remembered, so a reload keeps the same experience
    nav.replace(next);
  }, [user, next, nav, role, setMode]);

  async function go() {
    setErr(''); setBusy(true);
    try { await backend.signInGoogle(role); } catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }

  return (
    <div className={`bleed-page ${role === 'attendee' ? 'bleed-blue' : 'bleed-lime'}`}>
      <DemoBanner />
      <header className="top"><Logo /></header>
      <main className="login">
        <div className="login-copy">
          <span className="login-icon"><Icon name={role === 'attendee' ? 'ticket' : 'shield'} size={24} /></span>
          <h1>{c.title}</h1>
          <p>{c.text}</p>
        </div>
        <div className="login-actions">
          <button className="btn btn-white btn-block" disabled={busy} onClick={go}>
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.9 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.9c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 7.1-10.3 7.1-17.7z" /><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.2C6.5 42.6 14.6 48 24 48z" /></svg>
            {isDemo ? `Continue as demo ${role}` : 'Continue with Google'}
          </button>
          <ErrorNote text={err} />
          {role === 'attendee' ? (
            <div className="org-switch">
              <span>Running an event?</span>
              <Link className="btn btn-glass btn-block" href="/organiser/login"><Icon name="shield" size={18} /> Log in as an event organiser</Link>
            </div>
          ) : (
            <Link className="btn btn-glass btn-block" href="/login">Attending an event? Attendee login</Link>
          )}
        </div>
      </main>
    </div>
  );
}
