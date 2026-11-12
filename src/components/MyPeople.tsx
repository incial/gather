'use client';

import { Check, Handshake, Send, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fmtDateTime, friendlyError } from '../lib/format';
import { useCol } from '../lib/live';
import { answerPing, sharePhone, withdrawPing, type PingDoc } from '../lib/meetping';
import { getMyProfile } from '../lib/api';
import { backend } from '../lib/backend';
import type { AppUser } from '../lib/types';
import { Composer } from './MeetPing';
import { Empty, Spinner, useToast } from './ui';
import { EmojiAvatar } from './Fun';

type Tab = 'connections' | 'incoming' | 'sent';
const STATUS: Record<PingDoc['status'], string> = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled' };

/**
 * Everyone you've connected with through Meet Ping, and requests in both directions. Reads the
 * same ping records as notifications, so the counts change the moment a request is answered.
 */
export function usePings(uid: string | undefined) {
  const inc = useCol<PingDoc>(uid ? 'pings' : null, useMemo<[string, unknown][]>(() => [['toUid', uid]], [uid]));
  const out = useCol<PingDoc>(uid ? 'pings' : null, useMemo<[string, unknown][]>(() => [['fromUid', uid]], [uid]));
  return useMemo(() => {
    const byTime = (a: PingDoc, b: PingDoc) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    const connections = [...inc.data, ...out.data].filter((p) => p.status === 'accepted').sort(byTime);
    return {
      loading: inc.loading || out.loading,
      error: inc.error || out.error,
      all: [...inc.data, ...out.data],
      connections,
      people: new Set(connections.map((p) => (p.fromUid === uid ? p.toUid : p.fromUid))).size,
      incoming: inc.data.filter((p) => p.status === 'pending').sort(byTime),
      sent: [...out.data].sort(byTime),
    };
  }, [inc.loading, inc.error, inc.data, out.loading, out.error, out.data, uid]);
}

export function PeopleSummary({ uid }: { uid: string }) {
  const p = usePings(uid);
  if (p.loading) return null;
  return <p className="mp-summary"><b>{p.people}</b> Connected {p.people === 1 ? 'Person' : 'People'} · <b>{p.incoming.length}</b> Pending {p.incoming.length === 1 ? 'Request' : 'Requests'}</p>;
}

export function MyPeople({ user, focus, initialTab }: { user: AppUser; focus?: string; initialTab?: Tab }) {
  const p = usePings(user.uid);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(initialTab ?? 'connections');
  const [busy, setBusy] = useState('');
  const [again, setAgain] = useState<PingDoc | null>(null);
  const [myPhone, setMyPhone] = useState<string | null>(null);
  const me = { uid: user.uid, name: user.name, photo: user.photo };

  // Opening a notification brings you straight to its request.
  useEffect(() => {
    if (!focus || p.loading) return;
    const ping = p.all.find((x) => x.id === focus);
    if (!ping) return;
    setTab(ping.status === 'accepted' ? 'connections' : ping.toUid === user.uid && ping.status === 'pending' ? 'incoming' : 'sent');
    setTimeout(() => document.getElementById(`req-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }, [focus, p.loading, p.all, user.uid]);

  async function act(ping: PingDoc, f: () => Promise<unknown>, msg: string) {
    setBusy(ping.id);
    try { await f(); toast(msg); } catch (x) { toast(friendlyError(x), 'err'); }
    setBusy('');
  }
  const other = (x: PingDoc) => (x.fromUid === user.uid
    ? { uid: x.toUid, name: x.toName, photo: x.toPhoto, role: x.toRole }
    : { uid: x.fromUid, name: x.fromName, photo: x.fromPhoto, role: x.fromRole });
  const lists: Record<Tab, PingDoc[]> = { connections: p.connections, incoming: p.incoming, sent: p.sent };

  return (
    <section className="mp" aria-labelledby="mp-title">
      <div className="row-between">
        <h2 id="mp-title"><Users size={19} aria-hidden="true" /> My People</h2>
        {!p.loading && <span className="mp-summary"><b>{p.people}</b> connected · <b>{p.incoming.length}</b> pending</span>}
      </div>
      <div className="seg mp-tabs" role="tablist" aria-label="My People">
        {([['connections', 'My', 'Connections'], ['incoming', 'Incoming', 'Requests'], ['sent', 'Sent', 'Requests']] as [Tab, string, string][]).map(([k, a, b]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {k === 'connections' ? <><span className="long">{a} </span>{b}</> : <>{a}<span className="long"> {b}</span></>} {k !== 'sent' && lists[k].length > 0 && <span className="count-badge">{k === 'connections' ? p.people : lists[k].length}</span>}
          </button>
        ))}
      </div>
      {p.loading ? <Spinner /> : p.error ? <p className="error">Couldn’t load your connections. Check your connection and try again.</p> : !lists[tab].length ? (
        <Empty title={{ connections: 'No connections yet', incoming: 'No requests waiting', sent: 'No requests sent' }[tab]}>
          {tab === 'incoming' ? 'When someone sends you a Meet Ping, it waits here until you answer.' : 'Open an event, go to People and tap Meet on someone.'}
        </Empty>
      ) : (
        <ul className="mp-list">
          {lists[tab].map((x) => {
            const o = other(x);
            return (
              <li key={x.id} id={`req-${x.id}`} className={`card${focus === x.id ? ' focused' : ''}`}>
                <Link href={`/e/${x.eventId}/people/${o.uid}`} className="mp-who" aria-label={`Open ${o.name}’s profile`}>
                  <EmojiAvatar id={o.uid} photo={o.photo || undefined} size={50} />
                  <span className="grow">
                    <b>{o.name}</b>
                    <small className="muted">{o.role || 'Attendee'} · {x.eventTitle}</small>
                    <small className="muted">{tab === 'connections' ? `Connected ${fmtDateTime(x.updatedAt)}` : tab === 'incoming' ? `Received ${fmtDateTime(x.createdAt)}` : `Sent ${fmtDateTime(x.createdAt)}`}</small>
                  </span>
                </Link>
                {tab !== 'connections' && x.message && <q className="mp-msg">{x.message}</q>}
                <div className="mp-actions">
                  {tab === 'connections' && <>
                    <span className="meet-state connected"><Handshake size={15} aria-hidden="true" /> Connected</span>
                    {(() => {
                      const mine = x.fromUid === user.uid ? x.fromPhone : x.toPhone;
                      const theirs = x.fromUid === user.uid ? x.toPhone : x.fromPhone;
                      return <>
                        {theirs && <a className="btn btn-ghost btn-sm" href={`tel:${theirs}`}><span aria-hidden="true">📞</span> {theirs}</a>}
                        {mine
                          ? <button className="link" disabled={busy === x.id} onClick={() => act(x, () => sharePhone(x, user.uid, ''), 'Your number is no longer shared')}>Stop sharing my number</button>
                          : <button className="btn btn-ghost btn-sm" disabled={busy === x.id} onClick={async () => {
                              // Saved profile first, then the phone from this event's registration.
                              const phone = myPhone || (await getMyProfile(user.uid).catch(() => null))?.phone
                                || (await backend.getDoc<{ phone?: string }>(`events/${x.eventId}/attendees/${user.uid}`).catch(() => null))?.phone || '';
                              if (!phone) { toast('Add your phone number in Edit profile first.', 'err'); return; }
                              setMyPhone(phone);
                              act(x, () => sharePhone(x, user.uid, phone), `Your number is shared with ${o.name}`);
                            }}><span aria-hidden="true">📞</span> Share my number</button>}
                      </>;
                    })()}
                  </>}
                  {tab === 'incoming' && <>
                    <button className="btn btn-primary btn-sm" disabled={busy === x.id} onClick={() => act(x, () => answerPing(x, true, me), `You’re connected with ${o.name}`)}><Check size={15} /> Accept</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy === x.id} onClick={() => act(x, () => answerPing(x, false, me), 'Request declined')}><X size={15} /> Decline</button>
                  </>}
                  {tab === 'sent' && <>
                    <span className={`mp-status s-${x.status}`}>{STATUS[x.status]}</span>
                    {x.status === 'pending' && <button className="btn btn-ghost btn-sm" disabled={busy === x.id} onClick={() => { if (confirm(`Cancel your Meet Ping to ${o.name}?`)) act(x, () => withdrawPing(x), 'Request cancelled'); }}>Cancel</button>}
                    {x.status === 'cancelled' && <button className="btn btn-ghost btn-sm" onClick={() => setAgain(x)}><Send size={14} /> Send again</button>}
                  </>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {again && <Composer event={{ id: again.eventId, title: again.eventTitle }} me={me} other={{ uid: again.toUid, name: again.toName, photo: again.toPhoto }} again={again} onClose={() => setAgain(null)} />}
    </section>
  );
}
