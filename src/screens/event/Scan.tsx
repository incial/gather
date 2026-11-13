'use client';

import { useContext, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BadgeCheck, Hand, Keyboard } from 'lucide-react';
import { Scanner } from '../../components/Scanner';
import { confetti, ErrorNote, useToast } from '../../components/ui';
import { checkIn } from '../../lib/api';
import { fmtTime, friendlyError } from '../../lib/format';
import { routeFromScan } from '../../lib/qr';
import { EventCtx, type EventCtxValue } from './context';

/**
 * Check in without scanning: type the code shown on the session screen (same rotating code as the QR), or, when
 * the organiser has opened self check-in for that session, mark yourself present.
 */
function CantScan({ ctx }: { ctx: EventCtxValue }) {
  const { event, me, sessions, attendance } = ctx;
  const toast = useToast();
  const params = useSearchParams();
  const [now] = useState(() => Date.now());
  const real = useMemo(() => sessions.filter((s) => s.kind !== 'break'), [sessions]);
  // Sessions on now (or about to start / just finished) first; otherwise every session.
  const near = useMemo(() => real.filter((s) => Date.parse(s.startsAt) - 30 * 60_000 <= now && Date.parse(s.endsAt) + 60 * 60_000 >= now), [real, now]);
  const list = near.length ? near : real;
  const [sid, setSid] = useState(() => params.get('session') ?? '');
  useEffect(() => { if (!sid && list[0]) setSid(list[0].id); }, [sid, list]);
  const s = sessions.find((x) => x.id === sid);
  const done = attendance.some((a) => a.sessionId === sid);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go(key: string | null) {
    if (!s) return;
    setErr(''); setBusy(true);
    try {
      const r = await checkIn(event.id, s.id, me, key);
      if (r === 'ok') { confetti(); toast(`You’re checked in to “${s.title}”`); setCode(''); }
      else if (r === 'already') toast('You’re already checked in to this session');
      else setErr(key === null
        ? 'Self check-in isn’t open for this session. Ask the organiser to switch it on, or type the code on the screen.'
        : 'That code didn’t match. It changes every 30 seconds, so type the one on the screen right now. Check-in also has to be open.');
    } catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }

  if (!real.length) return null;
  return (
    <section className="cant-scan card" id="cant-scan">
      <h2>Can’t scan?</h2>
      <label className="field">
        <span>Session</span>
        <select value={sid} onChange={(e) => { setSid(e.target.value); setErr(''); }}>
          {list.map((x) => <option key={x.id} value={x.id}>{fmtTime(x.startsAt)} · {x.title}</option>)}
        </select>
      </label>
      {done ? (
        <p className="cant-done"><BadgeCheck size={18} aria-hidden="true" /> You’re checked in to this session.</p>
      ) : (
        <>
          <form className="code-row" onSubmit={(e: FormEvent) => { e.preventDefault(); if (code.trim().length === 6) go(code); }}>
            <label className="grow">
              <span className="sr-only">Code on the screen</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="Code on the screen" autoCapitalize="characters" autoComplete="off" inputMode="text" aria-label="Code on the session screen" />
            </label>
            <button className="btn btn-primary" disabled={busy || code.length !== 6}><Keyboard size={16} /> Check in</button>
          </form>
          <p className="muted small">The 6-character code under the QR on the session screen works the same as scanning.</p>
          {s?.selfCheckIn ? (
            <button className="btn btn-ink btn-block" disabled={busy} onClick={() => go(null)}><Hand size={17} /> Mark me present</button>
          ) : (
            <p className="muted small">Missed the code? Ask the organiser to open self check-in for this session, and a “Mark me present” button will appear here.</p>
          )}
        </>
      )}
      <ErrorNote text={err} />
    </section>
  );
}

export function Scan() {
  const nav = useRouter();
  // Inside an event, offer checking in without scanning. The general /scan page (outside any event) doesn't.
  const ctx = useContext(EventCtx);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const handle = (value: string) => {
    const route = routeFromScan(value, window.location.origin);
    if (route) nav.push(route);
    else setErr('That isn’t a Gather code. Try the code on the session screen or on a speaker’s card.');
  };
  return (
    <div className="stack-lg">
      <div>
        <h1>Scan</h1>
        <p className="muted">Point at the session screen to check in, or a speaker’s card to connect. {ctx && <a href="#cant-scan">Can’t scan?</a>}</p>
      </div>
      <Scanner onResult={handle} />
      <ErrorNote text={err} />
      {ctx && <CantScan ctx={ctx} />}
      <details className="manual">
        <summary>Paste a link instead</summary>
        <form className="inline-form" onSubmit={(e: FormEvent) => { e.preventDefault(); handle(text); }}>
          <input aria-label="Gather link" value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…" />
          <button className="btn btn-primary btn-sm" disabled={!text}>Go</button>
        </form>
      </details>
    </div>
  );
}
