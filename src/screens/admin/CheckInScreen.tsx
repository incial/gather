'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Logo, QrImage, Spinner } from '../../components/ui';
import { closeKey, KEY_ROTATE_MS, publishKey, randomCode } from '../../lib/api';
import { fmtTime } from '../../lib/format';
import { useCol, useDoc } from '../../lib/live';
import { checkInUrl } from '../../lib/qr';
import type { AttendanceDoc, EventDoc, SessionDoc } from '../../lib/types';

/** Full-screen display for the room's projector. The code changes every 30 seconds so a forwarded photo soon stops working. */
export function CheckInScreen() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const event = useDoc<EventDoc>(`events/${id}`);
  const session = useDoc<SessionDoc>(`events/${id}/sessions/${sessionId}`);
  const where: [string, unknown][] = useMemo(() => [['sessionId', sessionId]], [sessionId]);
  const att = useCol<AttendanceDoc>(`events/${id}/attendance`, where);
  const [key, setKey] = useState('');
  const [left, setLeft] = useState(30);
  const [running, setRunning] = useState(true);
  const [failed, setFailed] = useState(false);
  const current = useRef('');

  useEffect(() => {
    if (!running) return;
    let until = 0;
    const rotate = () => {
      const next = randomCode();
      publishKey(id, sessionId, next, current.current)
        .then(() => { current.current = next; setKey(next); setFailed(false); })
        .catch(() => setFailed(true)); // the code on screen stays usable; retried next rotation
      until = Date.now() + KEY_ROTATE_MS;
    };
    rotate();
    const clock = setInterval(() => {
      const s = Math.ceil((until - Date.now()) / 1000);
      if (s <= 0) rotate(); else setLeft(s);
    }, 500);
    return () => clearInterval(clock);
  }, [id, sessionId, running]);

  // A sleeping laptop would stop the code rotating, so keep the screen on while check-in runs.
  useEffect(() => {
    if (!running) return;
    let lock: WakeLockSentinel | undefined;
    const acquire = () => { navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release(); };
  }, [running]);

  const stop = () => { setRunning(false); closeKey(id, sessionId).catch(() => {}); };
  useEffect(() => {
    const close = () => { closeKey(id, sessionId).catch(() => {}); };
    window.addEventListener('pagehide', close);
    return () => window.removeEventListener('pagehide', close);
  }, [id, sessionId]);

  if (event.loading || session.loading) return <div className="center"><Spinner /></div>;
  if (!event.data || !session.data) return <div className="center"><Empty title="Session not found" /></div>;
  const recent = [...att.data].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 7);

  return (
    <div className={`projector a-${event.data.color}`}>
      <div className="proj-left">
        <Logo to="/admin" />
        <span className="kicker">{event.data.title} · {fmtTime(session.data.startsAt)}</span>
        <h1>{session.data.title}</h1>
        <div className="proj-count"><b key={att.data.length}>{att.data.length}</b><span>checked in</span></div>
        <ul className="proj-feed" aria-live="polite">
          {recent.map((a) => <li key={a.id}>{a.name}</li>)}
        </ul>
      </div>
      <div className="proj-right">
        {running && key ? <>
          <QrImage text={checkInUrl(id, sessionId, key)} size={420} label="Scan to check in" />
          <div className="proj-code">{key}</div>
          <div className="proj-timer"><i style={{ width: `${(left / 30) * 100}%` }} /></div>
          <p>Scan with your phone camera to check in{failed ? ' · reconnecting…' : ''}</p>
          <button className="btn btn-ghost btn-sm" onClick={stop}>Close check-in</button>
        </> : running ? <Spinner /> : <>
          <h2>Check-in closed</h2>
          <button className="btn btn-primary" onClick={() => setRunning(true)}>Reopen</button>
        </>}
      </div>
    </div>
  );
}
