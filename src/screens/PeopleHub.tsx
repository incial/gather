'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AccountMenu } from '../components/AccountMenu';
import { CountUp, PeopleStack, Reveal } from '../components/Fun';
import { MyPeople, usePings } from '../components/MyPeople';
import { DemoBanner, GlobalNav, Icon, Logo, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useCol } from '../lib/live';
import type { MembershipDoc } from '../lib/types';

/** /people: everyone you've met through Gather, requests both ways, and a way into each event's People list. */
export function PeopleHub() {
  const { user, loading } = useAuth();
  const nav = useRouter();
  useEffect(() => { if (!loading && !user) nav.replace('/login?next=/people'); }, [loading, user, nav]);
  const [q] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)));
  const pings = usePings(user?.uid);
  const mine = useCol<MembershipDoc>(user ? `users/${user.uid}/events` : null);
  if (loading || !user) return <div className="center"><Spinner /></div>;

  const friends = pings.connections.map((x) => (x.fromUid === user.uid
    ? { uid: x.toUid, name: x.toName, photo: x.toPhoto || undefined, sub: x.eventTitle }
    : { uid: x.fromUid, name: x.fromName, photo: x.fromPhoto || undefined, sub: x.eventTitle }))
    .filter((f, i, all) => all.findIndex((g) => g.uid === f.uid) === i);
  const tab = q?.get('tab');

  return (
    <div className="dash">
      <DemoBanner />
      <header className="top"><Logo /><AccountMenu /></header>
      <main className="dash-main fun">
        <section className="people-hero">
          <div className="people-hero-copy">
            <span className="eyebrow">People</span>
            <h1>Your people,<br />all in one place</h1>
            <p>Everyone you’ve connected with at Gather events, and the requests waiting on you.</p>
          </div>
          {friends.length > 0 ? <PeopleStack people={friends} /> : <div className="people-hero-emoji" aria-hidden="true"><span>🙋</span><span>🤝</span><span>🙋‍♂️</span></div>}
          <dl className="people-hero-stats">
            <div><dt>Connected</dt><dd>{pings.loading ? '…' : <CountUp value={pings.people} />}</dd></div>
            <div><dt>Requests</dt><dd>{pings.loading ? '…' : <CountUp value={pings.incoming.length} />}</dd></div>
            <div><dt>Sent</dt><dd>{pings.loading ? '…' : <CountUp value={pings.sent.filter((s) => s.status === 'pending').length} />}</dd></div>
          </dl>
        </section>

        <Reveal><MyPeople user={user} focus={q?.get('request') ?? undefined} initialTab={tab === 'incoming' || tab === 'sent' ? tab : undefined} /></Reveal>

        {mine.data.length > 0 && (
          <Reveal as="section" className="stack">
            <h2>Meet more people</h2>
            <p className="muted">Open an event’s People list to find speakers and attendees, then tap Meet.</p>
            <ul className="meet-more">
              {mine.data.map((m) => (
                <li key={m.id}>
                  <Link href={`/e/${m.id}/people`} className={`meet-more-row a-${m.color}`}>
                    <span className="meet-more-dot" aria-hidden="true" />
                    <span className="grow"><b>{m.title}</b><small>{m.venue}</small></span>
                    <span className="meet-more-go">People <Icon name="arrow" size={16} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </main>
      <GlobalNav />
    </div>
  );
}
