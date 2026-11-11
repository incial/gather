'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Scanner } from '../components/Scanner';
import { DemoBanner, ErrorNote, GlobalNav, Icon, Spinner } from '../components/ui';
import { findEventByCode } from '../lib/api';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/format';
import { routeFromScan } from '../lib/qr';

/** Join by typing the event's 6-digit number or scanning the organiser's QR code. */
export function JoinEvent() {
  const { user, loading } = useAuth();
  const nav = useRouter();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  useEffect(() => { if (!loading && !user) nav.replace('/login?next=/join'); }, [loading, user, nav]);
  if (loading || !user) return <div className="center"><Spinner /></div>;

  async function go(e: FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const ev = await findEventByCode(code);
      if (ev) nav.push(`/e/${ev.id}`); else setErr('No event with that number. Check the 6 digits and try again.');
    } catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }
  const onScan = (text: string) => {
    const route = routeFromScan(text, window.location.origin);
    if (route) nav.push(route);
    else setErr('That QR code isn’t a Gather event code.');
  };

  return (
    <div className="dash">
      <DemoBanner />
      <main className="dash-main narrow-main">
        <h1 className="hello">Join an event</h1>
        <section className="tile tile-blue join-tile">
          <h2>Enter the event number</h2>
          <p>The organiser shares a 6-digit number.</p>
          <form className="code-form" onSubmit={go}>
            <label className="sr" htmlFor="join-code">6-digit event number</label>
            <input id="join-code" className="code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" inputMode="numeric" autoComplete="off" autoFocus />
            <button className="btn btn-white" disabled={busy || code.length !== 6}>{busy ? '…' : 'Join'}</button>
          </form>
        </section>
        <div className="or-line"><span>or</span></div>
        {scanning ? (
          <section className="stack">
            <Scanner onResult={onScan} />
            <button className="btn btn-ghost btn-block" onClick={() => setScanning(false)}>Stop scanning</button>
          </section>
        ) : (
          <button className="btn btn-ink btn-block join-scan" onClick={() => { setErr(''); setScanning(true); }}>
            <Icon name="scan" size={22} /> Scan the event QR code
          </button>
        )}
        <ErrorNote text={err} />
      </main>
      <GlobalNav />
    </div>
  );
}
