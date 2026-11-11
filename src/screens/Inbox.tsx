'use client';

import { Bell, Check, MessageCircle, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountMenu } from '../components/AccountMenu';
import { MyPeople } from '../components/MyPeople';
import { Avatar, DemoBanner, ErrorNote, GlobalNav, Logo, Spinner, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import { fmtDateTime, friendlyError } from '../lib/format';
import { phoneError, normPhone } from '../lib/helpdesk';
import { useCol, useDoc } from '../lib/live';
import { answerPing, markRead, saveWhatsAppPrefs, type NotificationDoc, type PingDoc } from '../lib/meetping';


/** /inbox: notifications and every Meet Ping, sorted into incoming, outgoing, connections and declined. */
export function Inbox() {
  const { user, loading } = useAuth();
  const nav = useRouter();
  useEffect(() => { if (!loading && !user) nav.replace('/login?next=/inbox'); }, [loading, user, nav]);
  const uid = user?.uid;
  const notes = useCol<NotificationDoc>(uid ? `users/${uid}/notifications` : null);
  const inc = useCol<PingDoc>(uid ? 'pings' : null, useMemo<[string, unknown][]>(() => [['toUid', uid]], [uid]));
  const out = useCol<PingDoc>(uid ? 'pings' : null, useMemo<[string, unknown][]>(() => [['fromUid', uid]], [uid]));
  const [focus, setFocus] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('request') ?? ''));
  const toast = useToast();
  const marked = useRef(false);

  const sortedNotes = useMemo(() => [...notes.data].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 30), [notes.data]);
  // Opening the inbox marks what you can see as read, once.
  useEffect(() => {
    if (!uid || notes.loading || marked.current) return;
    marked.current = true;
    const unread = notes.data.filter((n) => !n.read).map((n) => n.id);
    const t = setTimeout(() => markRead(uid, unread).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [uid, notes.loading, notes.data]);

  if (loading || !user) return <div className="center"><Spinner /></div>;
  const me = { uid: user.uid, name: user.name, photo: user.photo };
  const pingOf = (id: string) => inc.data.find((p) => p.id === id) ?? out.data.find((p) => p.id === id);
  const answer = (p: PingDoc, accept: boolean) => answerPing(p, accept, me).then(() => toast(accept ? `You’re connected with ${p.fromName}` : 'Request declined')).catch((x) => toast(friendlyError(x), 'err'));

  return (
    <div className="dash">
      <DemoBanner />
      <header className="top"><Logo /><AccountMenu /></header>
      <main className="dash-main inbox">
        <div>
          <span className="kicker">Inbox</span>
          <h1>Meet Pings</h1>
          <p className="muted">Notifications about Meet Pings, and your people. Reading a notification never accepts or declines anything.</p>
        </div>

        <section className="stack">
          <h2><Bell size={18} aria-hidden="true" /> Notifications</h2>
          {notes.loading ? <Spinner /> : !sortedNotes.length ? <p className="muted">Nothing yet. When someone sends you a Meet Ping, it appears here.</p> : (
            <ul className="notes">
              {sortedNotes.map((n) => {
                const p = pingOf(n.pingId);
                return (
                  <li key={n.id} className={n.read ? '' : 'unread'}>
                    <Avatar id={n.fromUid} name={n.fromName} photo={n.fromPhoto} size={44} />
                    <div className="grow">
                      {n.type === 'ping'
                        ? <><b>Someone wants to meet you!</b><span>{n.fromName} would love to connect with you at {n.eventTitle}.</span>{n.message && <q>{n.message}</q>}</>
                        : <><b>{n.fromName} accepted your Meet Ping</b><span>You’re now connected at {n.eventTitle}.</span></>}
                      <small className="muted">{fmtDateTime(n.at)}</small>
                      <div className="row">
                        <button className="btn btn-ghost btn-sm" onClick={() => setFocus(n.pingId)}>Open request</button>
                        <Link className="btn btn-ghost btn-sm" href={`/e/${n.eventId}/people/${n.fromUid}`}>View profile</Link>
                        {n.type === 'ping' && p?.status === 'pending' && p.toUid === user.uid && <>
                          <button className="btn btn-primary btn-sm" onClick={() => answer(p, true)}><Check size={15} /> Accept</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => answer(p, false)}><X size={15} /> Decline</button>
                        </>}
                        {n.type === 'ping' && p && p.status !== 'pending' && <span className="muted">{p.status === 'accepted' ? 'Accepted' : 'Declined'}</span>}
                        {n.type === 'ping' && !p && !inc.loading && <span className="muted">No longer available</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <MyPeople user={user} focus={focus} />

        <WhatsAppPrefs uid={user.uid} />
      </main>
      <GlobalNav />
    </div>
  );
}

/** Opt in to WhatsApp alerts for Meet Pings. Stored privately; only the server uses the number. */
function WhatsAppPrefs({ uid }: { uid: string }) {
  const me = useDoc<{ phone?: string; whatsappOptIn?: boolean; whatsappPhone?: string }>(`users/${uid}/profile/me`);
  const toast = useToast();
  const [on, setOn] = useState<boolean | null>(null);
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (me.loading || on !== null) return;
    setOn(!!me.data?.whatsappOptIn);
    setPhone(me.data?.whatsappPhone || me.data?.phone || '');
  }, [me.loading, me.data, on]);
  if (on === null) return null;
  function save(next: boolean) {
    if (next) { const e = phoneError(phone); if (e) { setErr(e); return; } }
    setErr('');
    saveWhatsAppPrefs(uid, next, next ? normPhone(phone) : normPhone(phone)).then(() => { setOn(next); toast(next ? 'WhatsApp alerts on' : 'WhatsApp alerts off'); }).catch((x) => toast(friendlyError(x), 'err'));
  }
  return (
    <section className="card wa-prefs">
      <h2><MessageCircle size={18} aria-hidden="true" /> WhatsApp alerts</h2>
      <p className="muted">Get a WhatsApp message when someone sends you a Meet Ping. Your number is kept private and never shown to other people.</p>
      <label className="field"><span className="field-label">WhatsApp number</span><input type="tel" inputMode="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <label className="sfb-toggle">
        <input type="checkbox" role="switch" checked={on} onChange={(e) => save(e.target.checked)} />
        <span className="sfb-switch" aria-hidden="true" /><span>Send me WhatsApp alerts</span>
      </label>
      <ErrorNote text={err} />
    </section>
  );
}
