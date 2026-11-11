'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Empty, Spinner } from '../../components/ui';
import { connect } from '../../lib/api';
import { friendlyError } from '../../lib/format';
import { useEventCtx } from './context';

/** Landing spot for a speaker QR: /e/:id/connect/:speakerId */
export function Connect() {
  const { sid } = useParams<{ sid: string }>();
  const { event, me, speakers } = useEventCtx();
  const nav = useRouter();
  const [err, setErr] = useState('');
  const ran = useRef(false);
  const speaker = speakers.find((s) => s.id === sid);

  useEffect(() => {
    if (!speaker || ran.current) return;
    ran.current = true;
    connect(event.id, me, speaker, 'scan')
      .then(() => nav.replace(`/e/${event.id}/speakers/${speaker.id}?new=1`))
      .catch((x) => setErr(friendlyError(x)));
  }, [speaker, event.id, me, nav]);

  if (err) return <Empty title="Couldn’t connect">{err}</Empty>;
  return <div className="center"><Spinner label="Connecting" /></div>;
}
