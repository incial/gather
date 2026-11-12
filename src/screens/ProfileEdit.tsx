'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Avatar, DemoBanner, ErrorNote, Field, GlobalNav, Icon, LoadError, Spinner, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import { backend } from '../lib/backend';
import { friendlyError } from '../lib/format';
import { UsernameField, type UsernameState } from '../components/UsernameField';
import { claimUsername } from '../lib/username';
import { blankProfile, cleanProfile, completion, LIMITS, saveProfile, shrinkPhoto, toList, type PublicProfile } from '../lib/profile';

type Draft = Omit<PublicProfile, 'id'> & { phone: string; skillsText: string; interestsText: string };

export function ProfileEdit() {
  const { user, loading } = useAuth();
  const nav = useRouter();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<Draft | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [uname, setUname] = useState<UsernameState>({ value: '', ok: true });

  useEffect(() => { if (!loading && !user) nav.replace('/login?next=/profile/edit'); }, [loading, user, nav]);
  useEffect(() => {
    if (!user) return;
    Promise.all([backend.getDoc<PublicProfile>(`profiles/${user.uid}`), backend.getDoc<{ phone?: string; institution?: string; designation?: string }>(`users/${user.uid}/profile/me`)])
      .then(([p, me]) => {
        const base = p ?? { ...blankProfile(user), id: user.uid };
        setF({
          ...base, organisation: base.organisation || me?.institution || '', designation: base.designation || me?.designation || '',
          phone: me?.phone ?? '', skillsText: base.skills.join(', '), interestsText: base.interests.join(', '),
        });
      }).catch(() => setLoadErr(true));
  }, [user]);

  if (loading || !user) return <div className="center"><Spinner /></div>;
  if (loadErr) return <div className="center"><LoadError /></div>;
  if (!f) return <div className="center"><Spinner /></div>;

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const live = { ...f, skills: toList(f.skillsText), interests: toList(f.interestsText) };
  const pct = completion(live, f.phone).percent;

  async function photo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setF({ ...f!, photo: await shrinkPhoto(file), photoSource: 'upload' }); setErr(''); }
    catch (x) { setErr((x as Error).message); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const { phone, skillsText: _s, interestsText: _i, id: _id, ...rest } = live as Draft & { id?: string };
    const res = cleanProfile(rest);
    if ('error' in res) { setErr(res.error); return; }
    const wantName = uname.value && uname.value !== (f!.username ?? '');
    if (wantName && !uname.ok) { setErr('Choose an available username, or keep your current one.'); return; }
    setErr(''); setBusy(true);
    try {
      await saveProfile(user!.uid, res.value, phone);
      if (wantName) {
        try { await claimUsername(user!.uid, uname.value, f!.username || undefined); }
        catch { setErr(`@${uname.value} was just taken by someone else. Pick another; the rest of your profile is saved.`); setBusy(false); return; }
      }
      toast('Profile saved'); nav.push('/profile');
    } catch (x) { setErr(friendlyError(x)); setBusy(false); }
  }

  return (
    <div className="dash">
      <DemoBanner />
      <main className="dash-main narrow-main">
        <div className="row-between">
          <h1 className="hello">Edit profile</h1>
          <span className="pill">{pct}% complete</span>
        </div>
        <form className="stack-lg" onSubmit={submit}>
          <section className="card form-sec">
            <h2>The basics</h2>
            <div className="photo-row">
              <Avatar id={user.uid} name={f.name || '?'} photo={f.photo || undefined} size={84} />
              <div className="stack">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => file.current?.click()}>{f.photo ? 'Change photo' : 'Upload photo'}</button>
                {f.photoSource === 'upload' && user.photo && <button type="button" className="link" onClick={() => setF({ ...f, photo: user.photo!, photoSource: 'google' })}>Use my Google photo</button>}
                {f.photo && <button type="button" className="link danger" onClick={() => setF({ ...f, photo: '', photoSource: 'none' })}>Remove photo</button>}
              </div>
              <input ref={file} type="file" accept="image/*" hidden onChange={photo} />
            </div>
            <Field label="Full name"><input required maxLength={LIMITS.name} value={f.name} onChange={set('name')} autoComplete="name" /></Field>
            <UsernameField uid={user.uid} current={f.username ?? ''} onChange={setUname} />
            <Field label="Headline" hint="One line about you, e.g. Assistant Professor of Physics · IEDC Nodal Officer"><input maxLength={LIMITS.headline} value={f.headline} onChange={set('headline')} /></Field>
            <div className="two">
              <Field label="College or organisation"><input maxLength={LIMITS.short} value={f.organisation} onChange={set('organisation')} autoComplete="organization" /></Field>
              <Field label="Designation"><input maxLength={LIMITS.short} value={f.designation} onChange={set('designation')} /></Field>
            </div>
            <Field label="Phone" hint="Private. Only used to fill in event registrations; never shown on your profile."><input type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
            <p className="muted small">Email: {user.email} (private, from Google)</p>
          </section>

          <section className="card form-sec">
            <h2>About you <small className="muted">optional</small></h2>
            <Field label="Bio"><textarea rows={4} maxLength={LIMITS.bio} value={f.bio} onChange={set('bio')} /></Field>
            <div className="two">
              <Field label="Education"><input maxLength={LIMITS.short} value={f.education} onChange={set('education')} placeholder="M.Tech, CUSAT" /></Field>
              <Field label="Location"><input maxLength={LIMITS.short} value={f.location} onChange={set('location')} placeholder="Kottayam, Kerala" /></Field>
            </div>
            <Field label="Skills" hint="Separate with commas"><input value={f.skillsText} onChange={set('skillsText')} placeholder="Python, Design thinking, IPR" /></Field>
            <Field label="Interests" hint="Separate with commas"><input value={f.interestsText} onChange={set('interestsText')} placeholder="Startups, AI in education" /></Field>
          </section>

          <section className="card form-sec">
            <h2>Links <small className="muted">optional</small></h2>
            <Field label="LinkedIn" hint="Your profile link or just the ID"><input value={f.linkedin} onChange={set('linkedin')} placeholder="linkedin.com/in/…" /></Field>
            <div className="two">
              <Field label="Website"><input value={f.website} onChange={set('website')} placeholder="example.com" /></Field>
              <Field label="Portfolio"><input value={f.portfolio} onChange={set('portfolio')} /></Field>
            </div>
            {f.links.map((l, i) => (
              <div key={i} className="link-edit">
                <input aria-label={`Link ${i + 1} name`} placeholder="Name, e.g. Instagram" value={l.label} onChange={(e) => setF({ ...f, links: f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input aria-label={`Link ${i + 1} address`} placeholder="Link" value={l.url} onChange={(e) => setF({ ...f, links: f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                <button type="button" className="icon-btn" aria-label={`Remove link ${i + 1}`} onClick={() => setF({ ...f, links: f.links.filter((_, j) => j !== i) })}><Icon name="close" size={16} /></button>
              </div>
            ))}
            {f.links.length < LIMITS.links && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, links: [...f.links, { label: '', url: '' }] })}><Icon name="plus" size={16} /> Add link</button>}
          </section>

          <section className="card form-sec">
            <h2>Privacy</h2>
            <label className="check"><input type="radio" name="vis" checked={f.visibility === 'public'} onChange={() => setF({ ...f, visibility: 'public' })} /><span><b>Visible</b><small>People signed in to Gather can see your profile and find you at events.</small></span></label>
            <label className="check"><input type="radio" name="vis" checked={f.visibility === 'private'} onChange={() => setF({ ...f, visibility: 'private' })} /><span><b>Hidden</b><small>Only you can see it. Organisers still see your registration details for events you join.</small></span></label>
          </section>

          <ErrorNote text={err} />
          <div className="two">
            <button type="button" className="btn btn-ghost" onClick={() => nav.push('/profile')}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
          </div>
        </form>
      </main>
      <GlobalNav />
    </div>
  );
}
