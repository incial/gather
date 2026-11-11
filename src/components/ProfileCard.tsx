'use client';

import { speakerLinks } from '../lib/links';
import { emojiFor } from '../lib/persona';
import type { PublicProfile } from '../lib/profile';
import { EmojiAvatar, Reveal } from './Fun';
import { Icon, LinkedinIcon } from './ui';

/** A person's public profile: the bright hero, then the details. Never shows email or phone. */
export function ProfileCard({ p, children }: { p: PublicProfile; children?: React.ReactNode }) {
  return (
    <div className="fun stack-lg">
      <ProfileHero p={p}>{children}</ProfileHero>
      <ProfileDetails p={p} />
    </div>
  );
}

export function ProfileHero({ p, children }: { p: PublicProfile; children?: React.ReactNode }) {
  const line = [p.designation, p.organisation].filter(Boolean).join(' · ');
  const e = emojiFor(p.id);
  return (
    <section className="ph" aria-label={`${p.name}’s profile`}>
      <span className="ph-float f1" aria-hidden="true">{e}</span>
      <span className="ph-float f2" aria-hidden="true">✨</span>
      <span className="ph-float f3" aria-hidden="true">👋</span>
      <div className="ph-photo">
        <EmojiAvatar id={p.id} photo={p.photo || undefined} size={128} />
      </div>
      <div className="ph-copy">
        <h1>{p.name}</h1>
        {p.headline && <p className="ph-headline">{p.headline}</p>}
        {line && <p className="ph-line">{line}</p>}
        {(p.location || p.education) && <p className="ph-meta">{p.location && <><Icon name="pin" size={14} /> {p.location}</>}{p.location && p.education && ' · '}{p.education}</p>}
      </div>
      {children}
    </section>
  );
}

export function ProfileDetails({ p }: { p: PublicProfile }) {
  const tray = speakerLinks({ linkedin: p.linkedin, website: p.website, links: [...(p.portfolio ? [{ label: 'Portfolio', url: p.portfolio }] : []), ...p.links] } as never);
  if (!p.bio && !p.skills.length && !p.interests.length && !tray.length) return null;
  return (
    <div className="pd">
      {p.bio && <Reveal as="section" className="pd-card"><h2>About</h2><p className="prose">{p.bio}</p></Reveal>}
      {(p.skills.length > 0 || p.interests.length > 0) && (
        <Reveal as="section" className="pd-card" delay={60}>
          {p.skills.length > 0 && <><h2>Skills</h2><div className="pills">{p.skills.map((s) => <span key={s}>{s}</span>)}</div></>}
          {p.interests.length > 0 && <><h2>Interests</h2><div className="pills soft">{p.interests.map((s) => <span key={s}>{s}</span>)}</div></>}
        </Reveal>
      )}
      {tray.length > 0 && (
        <Reveal as="section" className="pd-card" delay={120}>
          <h2>Links</h2>
          <div className="link-tray">
            {tray.map((l) => (
              <a key={l.label + l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                <span>{l.label === 'LinkedIn' ? <LinkedinIcon size={18} /> : <Icon name={l.label === 'Website' ? 'globe' : 'external'} size={18} />}</span>
                <b>{l.label}</b><Icon name="arrow" size={16} />
              </a>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}
