'use client';

import { useEffect, useState } from 'react';
import { cleanUsername, isFree, suggestions, usernameProblem } from '../lib/username';

export type UsernameState = { value: string; ok: boolean };

/**
 * Username input with a live availability check. When the name is taken it offers free
 * alternatives to tap. `ok` is true only for a valid name that's free (or already yours).
 */
export function UsernameField({ uid, current, onChange }: { uid: string; current: string; onChange: (s: UsernameState) => void }) {
  const [v, setV] = useState(current);
  const [status, setStatus] = useState<'same' | 'checking' | 'free' | 'taken' | 'bad' | 'error'>('same');
  const [msg, setMsg] = useState('');
  const [alts, setAlts] = useState<string[]>([]);

  useEffect(() => {
    const h = v;
    if (h === current) { setStatus('same'); setMsg(''); setAlts([]); onChange({ value: h, ok: true }); return; }
    const problem = usernameProblem(h);
    if (problem) { setStatus('bad'); setMsg(problem); setAlts([]); onChange({ value: h, ok: false }); return; }
    setStatus('checking'); setMsg('Checking…'); onChange({ value: h, ok: false });
    let live = true;
    const t = setTimeout(async () => {
      try {
        const free = await isFree(h, uid);
        if (!live) return;
        if (free) { setStatus('free'); setMsg(`@${h} is available`); setAlts([]); onChange({ value: h, ok: true }); }
        else {
          setStatus('taken'); setMsg(`@${h} is taken.`);
          const s = await suggestions(h);
          if (live) setAlts(s);
        }
      } catch { if (live) { setStatus('error'); setMsg('Couldn’t check right now. Try again in a moment.'); } }
    }, 400);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, current, uid]);

  return (
    <div className="field">
      <label className="field-label" htmlFor="uname">Username</label>
      <div className={`uname uname-${status}`}>
        <span aria-hidden="true">@</span>
        <input id="uname" value={v} maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="yourname"
          aria-describedby="uname-msg" onChange={(e) => setV(cleanUsername(e.target.value))} />
      </div>
      <span id="uname-msg" className={`field-hint uname-msg ${status}`} role="status">
        {msg || 'Your public ID on Gather. Letters, numbers, dots and underscores.'}
      </span>
      {status === 'taken' && alts.length > 0 && (
        <div className="uname-alts"><small className="muted">Try:</small>{alts.map((a) => <button type="button" key={a} className="chip" onClick={() => setV(a)}>@{a}</button>)}</div>
      )}
    </div>
  );
}
