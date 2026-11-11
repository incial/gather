'use client';

import { speakerLinks } from '../lib/links';
import type { PublicProfile } from '../lib/profile';
import { Avatar, Icon, LinkedinIcon } from './ui';

/** A person's public profile. Never shows email or phone. */
export function ProfileCard({ p, children }: { p: PublicProfile; children?: React.ReactNode }) {
  const tray = speakerLinks({ linkedin: p.linkedin, website: p.website, links: [...(p.portfolio ? [{ label: 'Portfolio', url: p.portfolio }] : []), ...p.links] } as never);
  const line = [p.designation, p.organisation].filter(Boolean).join(' · ');
  return (
    <article className="pcard">
      <div className="pcard-cover" aria-hidden="true" />
      <div className="pcard-id">
        <span className="pcard-photo"><Avatar id={p.id} name={p.name} photo={p.photo || undefined} size={112} /></span>
        <h1>{p.name}</h1>
        {p.headline && <p className="pcard-headline">{p.headline}</p>}
        {line && <p className="muted">{line}</p>}
        {(p.location || p.education) && <p className="pcard-meta">{[p.location, p.education].filter(Boolean).join(' · ')}</p>}
        {children}
      </div>
      {p.bio && <section className="pcard-sec"><h2>About</h2><p className="prose">{p.bio}</p></section>}
      {(p.skills.length > 0 || p.interests.length > 0) && (
        <section className="pcard-sec">
          {p.skills.length > 0 && <><h2>Skills</h2><div className="tags tags-left">{p.skills.map((s) => <span key={s}>{s}</span>)}</div></>}
          {p.interests.length > 0 && <><h2>Interests</h2><div className="tags tags-left">{p.interests.map((s) => <span key={s}>{s}</span>)}</div></>}
        </section>
      )}
      {tray.length > 0 && (
        <section className="pcard-sec">
          <h2>Links</h2>
          <div className="link-tray">
            {tray.map((l) => (
              <a key={l.label + l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                <span>{l.label === 'LinkedIn' ? <LinkedinIcon size={18} /> : <Icon name={l.label === 'Website' ? 'globe' : 'external'} size={18} />}</span>
                <b>{l.label}</b><Icon name="arrow" size={16} />
              </a>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
