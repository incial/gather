'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Scanner } from '../../components/Scanner';
import { ErrorNote } from '../../components/ui';
import { routeFromScan } from '../../lib/qr';

export function Scan() {
  const nav = useRouter();
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
        <p className="muted">Point at the session screen to check in, or a speaker’s card to connect.</p>
      </div>
      <Scanner onResult={handle} />
      <ErrorNote text={err} />
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
