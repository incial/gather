'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Empty, Spinner } from '../components/ui';
import { findEventByCode } from '../lib/api';

/** Target of the event's join QR: /join/CODE */
export function JoinCode() {
  const { code } = useParams<{ code: string }>();
  const nav = useRouter();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    findEventByCode(code).then((ev) => {
      if (ev) nav.replace(`/e/${ev.id}`); else setMissing(true);
    }).catch(() => setMissing(true));
  }, [code, nav]);
  if (!missing) return <div className="center"><Spinner /></div>;
  return <div className="center"><Empty title="We couldn’t find that event"><Link href="/">Back to home</Link></Empty></div>;
}
