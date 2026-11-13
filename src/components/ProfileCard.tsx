'use client';

import { speakerLinks } from '../lib/links';
import type { PublicProfile } from '../lib/profile';
import { Avatar, Icon, LinkedinIcon } from './ui';

/** A person's public profile: who they are, then the details. Never shows email or phone. */
export function ProfileCard({ p, children }: { p: PublicProfile; children?: React.ReactNode }) {
  return (
    <div className="prof">
      <ProfileHero p={p}>{children}</ProfileHero>
      <ProfileDetails p={p} />
    </div>
  );
}

export function ProfileHero({ p, children }: { p: PublicProfile; children?: React.ReactNode }) {
  const line = [p.designation, p.organisation].filter(Boolean).join(' · ');
  return (
    <section className="prof-id prof-card" aria-label={`${p.name}’s profile`}>
      <div className="prof-cover" aria-hidden="true"><i /><i /><i /></div>
      <Avatar id={p.id} name={p.name} photo={p.photo || undefined} size={92} />
      <div className="prof-who">
        <h1>{p.name}</h1>
        {p.username && <p className="prof-handle">@{p.username}</p>}
        {p.headline && <p className="prof-headline">{p.headline}</p>}
        {line && <p className="muted">{line}</p>}
        {(p.location || p.education) && <p className="muted prof-meta">{p.location && <><Icon name="pin" size={14} /> {p.location}</>}{p.location && p.education && ' · '}{p.education}</p>}
      </div>
      {children}
    </section>
  );
}

/** About, skills, interests and links, in one card. */
export function ProfileDetails({ p }: { p: PublicProfile }) {
  const tray = speakerLinks({ linkedin: p.linkedin, website: p.website, links: [...(p.portfolio ? [{ label: 'Portfolio', url: p.portfolio }] : []), ...p.links] } as never);
  if (!p.bio && !p.skills.length && !p.interests.length && !tray.length) return null;
  return (
    <section className="prof-details">
      {p.bio && <div><h2>About</h2><p className="prose">{p.bio}</p></div>}
      {p.skills.length > 0 && <div><h2>Skills</h2><div className="tags tags-left">{p.skills.map((t) => <span key={t}>{t}</span>)}</div></div>}
      {p.interests.length > 0 && <div><h2>Interests</h2><div className="tags tags-left">{p.interests.map((t) => <span key={t}>{t}</span>)}</div></div>}
      {tray.length > 0 && (
        <div>
          <h2>Links</h2>
          <div className="link-tray">
            {tray.map((l) => (
              <a key={l.label + l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                <span>{l.label === 'LinkedIn' ? <LinkedinIcon size={18} /> : <Icon name={l.label === 'Website' ? 'globe' : 'external'} size={18} />}</span>
                <b>{l.label}</b><Icon name="arrow" size={16} />
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
