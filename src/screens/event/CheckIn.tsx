'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { confetti, Empty, Spinner } from '../../components/ui';
import { checkIn, type CheckInResult } from '../../lib/api';
import { friendlyError } from '../../lib/format';
import { useEventCtx } from './context';

/** Landing spot for a session QR: /e/:id/c/:sessionId?k=KEY */
export function CheckIn() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const params = useSearchParams();
  const { event, me, sessions } = useEventCtx();
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [err, setErr] = useState('');
  const ran = useRef(false);
  const session = sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    checkIn(event.id, sessionId, me, params.get('k') ?? '')
      .then((r) => { setResult(r); if (r === 'ok') confetti(); })
      .catch((x) => setErr(friendlyError(x)));
  }, [event.id, me, params, sessionId]);

  if (err) return <Empty title="Check-in didn’t go through">{err}</Empty>;
  if (!result) return <div className="center"><Spinner label="Checking you in" /></div>;
  if (result === 'expired') {
    return (
      <div className="thanks">
        <h1>That code has changed</h1>
        <p className="muted">Check-in codes refresh every 30 seconds, and only work while check-in is open. Scan the screen again.</p>
        <Link href={`/e/${event.id}/scan`} className="btn btn-primary">Scan again</Link>
      </div>
    );
  }
  return (
    <div className="thanks">
      <div className="big-stamp">{result === 'ok' ? <>YOU’RE<br />IN</> : <>ALREADY<br />IN</>}</div>
      <h1>{session?.title ?? 'Checked in'}</h1>
      <p className="muted">{result === 'ok' ? `Nice to see you, ${me.name}. A new stamp is in your passport.` : 'You’re already checked in to this session.'}</p>
      <Link href={`/e/${event.id}/pass`} className="btn btn-primary">See my passport</Link>
    </div>
  );
}
