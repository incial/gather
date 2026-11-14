'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DemoBanner, ErrorNote, Icon, Logo } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useMode } from '../lib/mode';
import { backend, isDemo } from '../lib/backend';
import { friendlyError } from '../lib/format';

/** Apps whose built-in browser Google refuses to sign in from ("disallowed_useragent"). */
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|Snapchat|WhatsApp|Twitter|MicroMessenger|; wv\)|GSA\//i;

function InAppHelp() {
  const [inApp, setInApp] = useState(false);
  const [android, setAndroid] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setInApp(IN_APP.test(navigator.userAgent)); setAndroid(/Android/i.test(navigator.userAgent)); }, []);
  if (!inApp) return null;
  const url = window.location.href;
  // On Android this opens the same page in Chrome.
  const chrome = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
  return (
    <div className="inapp-help" role="alert">
      <b>Open this page in your browser to sign in</b>
      <p>Google doesn’t allow signing in inside {/Instagram/i.test(navigator.userAgent) ? 'Instagram' : /WhatsApp/i.test(navigator.userAgent) ? 'WhatsApp' : 'this app'}. {android ? 'Tap below to open it in Chrome.' : 'Tap ··· or the share button and choose “Open in Safari” (or Chrome).'}</p>
      <div className="row">
        {android && <a className="btn btn-white btn-sm" href={chrome}>Open in Chrome</a>}
        <button className="btn btn-glass btn-sm" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Link copied' : 'Copy link'}</button>
      </div>
    </div>
  );
}

/** Where a sign-in returns to: ?next= when it stays inside the app, otherwise home. Read only when needed, so the page can be pre-rendered. */
function nextPath() {
  const raw = new URLSearchParams(window.location.search).get('next') ?? '/';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

/**
 * The one sign-in for everyone. One account does both: people start in attendee mode and switch
 * to organiser mode from the top bar. A link back into the organiser screens (?next=/admin/…)
 * opens in organiser mode, since that's where it was going.
 */
export function Login() {
  const nav = useRouter();
  const { user } = useAuth();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const { setMode } = useMode();
  useEffect(() => {
    if (!user) return;
    const next = nextPath();
    setMode(next.startsWith('/admin') ? 'organiser' : 'attendee'); // remembered, so a reload keeps the same experience
    nav.replace(next);
  }, [user, nav, setMode]);

  async function go() {
    setErr(''); setBusy(true);
    try { await backend.signInGoogle(nextPath().startsWith('/admin') ? 'organiser' : 'attendee'); } catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }

  return (
    <div className="bleed-page bleed-blue">
      <DemoBanner />
      <header className="top"><Logo /></header>
      <main className="login">
        <div className="login-copy">
          <span className="login-icon"><Icon name="ticket" size={24} /></span>
          <h1>Log in to Gather</h1>
          <p>One account for everything: join events, check in and meet people, or switch to organiser mode to run your own.</p>
        </div>
        <div className="login-actions">
          <InAppHelp />
          <button className="btn btn-white btn-block" disabled={busy} onClick={go} aria-busy={busy}>
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.9 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.9c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 7.1-10.3 7.1-17.7z" /><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.2C6.5 42.6 14.6 48 24 48z" /></svg>
            {busy ? 'Opening Google…' : isDemo ? 'Continue with the demo account' : 'Continue with Google'}
          </button>
          <ErrorNote text={err} />
        </div>
      </main>
    </div>
  );
}
