'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { DemoBanner, Empty, ErrorNote, Field, Spinner } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { backend } from '../../lib/backend';
import { useDoc } from '../../lib/live';
import { lockKey } from '../../lib/pulse/engine';
import type { PulseDoc, Slide } from '../../lib/pulse/types';
import type { AppUser } from '../../lib/types';

export interface Participant { me: AppUser; name: string; slides: Slide[]; k: string; pulse: PulseDoc }

const nameKey = (uid: string) => `pulse-name-${uid}`;
const keyKey = (id: string) => `pulse-key-${id}`;
const read = (k: string) => { try { return sessionStorage.getItem(k) ?? localStorage.getItem(k) ?? ''; } catch { return ''; } };
const write = (k: string, v: string, local = false) => { try { (local ? localStorage : sessionStorage).setItem(k, v); } catch { /* private mode */ } };

/** A small branded page frame for participants. */
export function PulseFrame({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="pl-join-page">
      <DemoBanner />
      <header className="pl-join-top"><Link href="/pulse/join" className="pl-brand"><span className="logo-mark" aria-hidden="true" />gather <b>Pulse</b></Link>{title && <span className="pl-join-title">{title}</span>}</header>
      <main className="pl-join-main">{children}</main>
    </div>
  );
}

/**
 * Everything a participant needs before answering: an identity (Google, or a guest
 * session for public links), access to the questions (password if set) and a name if asked.
 */
export function ParticipantGate({ id, children }: { id: string; children: (p: Participant) => ReactNode }) {
  const { user, guest, loading } = useAuth();
  const me = user ?? guest;
  const pathname = usePathname();
  const pulse = useDoc<PulseDoc>(me ? `pulse/${id}` : null);
  const [guestErr, setGuestErr] = useState('');
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [k, setK] = useState('');
  const [name, setName] = useState('');

  // Public links sign people in as a guest automatically. No account, nothing to fill in.
  useEffect(() => {
    if (loading || me || guestErr) return;
    backend.signInGuest().catch((e: { code?: string }) => setGuestErr(e.code === 'auth/operation-not-allowed' || e.code === 'auth/admin-restricted-operation' ? 'google' : 'error'));
  }, [loading, me, guestErr]);

  useEffect(() => { if (me) setName(user?.name || read(nameKey(me.uid))); }, [me, user]);

  // Questions: straight from the document, or from the password-protected copy.
  useEffect(() => {
    const p = pulse.data;
    if (!p) return;
    if (!p.locked) { setSlides(p.slides); return; }
    const saved = read(keyKey(id));
    if (saved && !slides) {
      backend.getDoc<{ slides: Slide[] }>(`pulse/${id}/vault/${saved}`).then((v) => { if (v) { setSlides(v.slides); setK(saved); } }).catch(() => {});
    }
  }, [pulse.data, id, slides]);

  const signIn = (
    <div className="row-center"><Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in with Google</Link></div>
  );
  if (loading || (!me && !guestErr)) return <PulseFrame><Spinner /></PulseFrame>;
  if (!me) return <PulseFrame><Empty title="Sign in to join">{guestErr === 'google' ? 'Answering without an account isn’t switched on yet.' : 'We couldn’t start a session.'} Sign in with Google to continue.{signIn}</Empty></PulseFrame>;
  if (pulse.loading) return <PulseFrame><Spinner /></PulseFrame>;
  if (!pulse.data) {
    return (
      <PulseFrame>
        <Empty title="Not available">
          {pulse.error && me.guest ? 'This one is only for signed-in people or event attendees.' : pulse.error ? 'You don’t have access. It may be only for attendees of an event you haven’t joined.' : 'This link isn’t active. It may have been deleted.'}
          {me.guest ? signIn : <div className="row-center"><Link className="btn btn-ghost btn-sm" href="/pulse/join">Try another code</Link></div>}
        </Empty>
      </PulseFrame>
    );
  }
  const p = pulse.data;
  if (p.status === 'draft') return <PulseFrame title={p.title}><Empty title="Not started yet">The organiser hasn’t opened this yet. Keep this page open or come back soon.</Empty></PulseFrame>;
  if (p.access === 'signedIn' && me.guest) return <PulseFrame title={p.title}><Empty title="Sign in to answer">This one needs a Google account.{signIn}</Empty></PulseFrame>;
  if (p.locked && !slides) return <PasswordGate p={p} onUnlock={(sl, key) => { setSlides(sl); setK(key); write(keyKey(id), key); }} />;
  if (!p.anonymous && p.askName && !name) return <NameGate title={p.title} onName={(n) => { setName(n); write(nameKey(me.uid), n, true); }} />;
  return <>{children({ me, name: p.anonymous ? '' : name, slides: slides ?? p.slides, k, pulse: p })}</>;
}

function PasswordGate({ p, onUnlock }: { p: PulseDoc; onUnlock: (s: Slide[], k: string) => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const k = await lockKey(p.id, pw);
      const v = await backend.getDoc<{ slides: Slide[] }>(`pulse/${p.id}/vault/${k}`).catch(() => null);
      if (!v) setErr('That password isn’t right.'); else onUnlock(v.slides, k);
    } catch { setErr('Something went wrong. Try again.'); }
    setBusy(false);
  }
  return (
    <PulseFrame title={p.title}>
      <form className="pl-gate card" onSubmit={submit}>
        <Lock size={28} aria-hidden="true" />
        <h1>{p.title}</h1>
        <p className="muted">This is password protected.</p>
        <Field label="Password"><input type="password" autoFocus required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <ErrorNote text={err} />
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
      </form>
    </PulseFrame>
  );
}

function NameGate({ title, onName }: { title: string; onName: (n: string) => void }) {
  const [n, setN] = useState('');
  return (
    <PulseFrame title={title}>
      <form className="pl-gate card" onSubmit={(e) => { e.preventDefault(); if (n.trim()) onName(n.trim().slice(0, 40)); }}>
        <h1>{title}</h1>
        <Field label="Your name" hint="Shown with your answers."><input autoFocus required maxLength={40} value={n} onChange={(e) => setN(e.target.value)} /></Field>
        <button className="btn btn-primary btn-block">Join</button>
      </form>
    </PulseFrame>
  );
}
