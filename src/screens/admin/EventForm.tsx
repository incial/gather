'use client';

import { CalendarRange, Globe, ImagePlus, Link2, Lock, Trash2, Video } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EventBanner, EventVideo, ScheduleFiles } from '../../components/EventMedia';
import { ErrorNote, Field } from '../../components/ui';
import { checkFile, saveAsset } from '../../lib/assets';
import { prepareBanner, removeBanner, saveBanner, videoEmbedUrl } from '../../lib/eventMedia';
import { friendlyError, fromLocalInput, toLocalInput } from '../../lib/format';
import type { Accent, EventDoc } from '../../lib/types';
import { cleanDetails, EVENT_TYPES, TYPE_ORDER, typeInfo } from '../../lib/eventTypes';

export type EventFields = Pick<EventDoc, 'title' | 'tagline' | 'description' | 'organiser' | 'venue' | 'startsAt' | 'endsAt' | 'published' | 'registration' | 'feedbackOpen' | 'color' | 'mapLink' | 'linkAccess' | 'videoUrl' | 'expectedAttendees' | 'capacity' | 'eventType' | 'typeDetails'>;

export const blankEvent = (): EventFields => ({
  title: '', tagline: '', description: '', organiser: '', venue: '', startsAt: '', endsAt: '',
  published: false, registration: 'open', feedbackOpen: false, color: 'blue', mapLink: '', linkAccess: true, videoUrl: '', expectedAttendees: 0, capacity: 0, eventType: undefined, typeDetails: {},
});

const COLORS: Accent[] = ['blue', 'amber', 'violet', 'lime', 'rose'];

/** Who can find the event, as one choice instead of two switches. */
export type Visibility = 'public' | 'private' | 'draft';
export const visibilityOf = (e: Pick<EventDoc, 'published' | 'linkAccess'>): Visibility => (e.published ? 'public' : e.linkAccess ? 'private' : 'draft');
export const visibilityPatch = (v: Visibility) => ({ published: v === 'public', linkAccess: v !== 'draft' });
export const VISIBILITY_LABEL: Record<Visibility, string> = { public: 'Public', private: 'Private link', draft: 'Draft' };

/**
 * Create and edit form. `eventId` is set when editing. When creating, onSubmit returns the new ID
 * so the banner and schedule file can be saved to it, then onDone runs.
 */
export function EventForm({ initial, eventId, bannerThumb, submitLabel, onSubmit, onDone }: {
  initial: EventFields; eventId?: string; bannerThumb?: string; submitLabel: string;
  onSubmit: (d: EventFields) => Promise<string | void>; onDone?: (id: string) => void;
}) {
  const [f, setF] = useState<EventFields>({ ...blankEvent(), ...initial });
  const [banner, setBanner] = useState<{ data: string; thumb: string } | null>(null);
  const [dropBanner, setDropBanner] = useState(false);
  const [schedule, setSchedule] = useState<File | null>(null);
  const [mediaErr, setMediaErr] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const text = (k: 'title' | 'tagline' | 'description' | 'organiser' | 'venue') => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const vis = visibilityOf(f);
  const videoOk = !f.videoUrl?.trim() || !!videoEmbedUrl(f.videoUrl);

  async function pickBanner(file: File | undefined) {
    if (!file) return;
    setMediaErr(''); setBusy('Preparing banner…');
    try { setBanner(await prepareBanner(file)); setDropBanner(false); } catch (x) { setMediaErr((x as Error).message); }
    setBusy('');
  }
  function pickSchedule(file: File | undefined) {
    setMediaErr('');
    if (!file) return;
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) { setMediaErr('Upload the schedule as a PDF or an image.'); return; }
    const problem = checkFile(file);
    if (problem) { setMediaErr(problem); return; }
    setSchedule(file);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (Date.parse(f.endsAt) < Date.parse(f.startsAt)) { setErr('The end time is before the start time.'); return; }
    if (!videoOk) { setErr('The video link should be a YouTube or Vimeo link.'); return; }
    setErr(''); setBusy('Saving…');
    try {
      const keys = Object.keys(blankEvent()) as (keyof EventFields)[];
      const clean = Object.fromEntries(keys.map((k) => [k, f[k]])) as unknown as EventFields;
      clean.videoUrl = f.videoUrl?.trim() ?? '';
      if (f.eventType) { clean.eventType = f.eventType; clean.typeDetails = cleanDetails(f.eventType, f.typeDetails); }
      else { delete clean.eventType; delete clean.typeDetails; }
      const id = (await onSubmit(clean)) || eventId;
      if (id) {
        if (banner) { setBusy('Uploading banner…'); await saveBanner(id, banner); }
        else if (dropBanner && bannerThumb) await removeBanner(id);
        if (schedule) { setBusy('Uploading schedule…'); await saveAsset(id, { title: 'Event schedule', description: '', kind: 'schedule', sessionId: '', url: '', file: schedule }); setSchedule(null); }
        setBanner(null);
        onDone?.(id);
      }
    } catch (x) { setErr(friendlyError(x)); }
    setBusy('');
  }

  const shownThumb = banner?.thumb ?? (dropBanner ? '' : bannerThumb ?? '');
  const type = typeInfo(f.eventType);
  const [picking, setPicking] = useState(!eventId && !initial.eventType);
  const detail = (k: string) => (e: { target: { value: string } }) => setF({ ...f, typeDetails: { ...(f.typeDetails ?? {}), [k]: e.target.value } });

  if (picking) {
    return (
      <div className="ev-form">
        <fieldset className="ev-section">
          <legend><span>1</span> What kind of event is it?</legend>
          <p className="muted">We’ll only ask the questions that fit. You can change this later; nothing you’ve typed is lost.</p>
          <div className="ev-types" role="radiogroup" aria-label="Event type">
            {TYPE_ORDER.map((t) => (
              <button type="button" key={t} role="radio" aria-checked={f.eventType === t} className={`ev-type${f.eventType === t ? ' on' : ''}`}
                onClick={() => { setF({ ...f, eventType: t }); setPicking(false); }}>
                <span className="ev-type-emoji" aria-hidden="true">{EVENT_TYPES[t].emoji}</span>
                <b>{EVENT_TYPES[t].label}</b><small>{EVENT_TYPES[t].blurb}</small>
              </button>
            ))}
          </div>
          {eventId && <button type="button" className="link" onClick={() => setPicking(false)}>Back to the form</button>}
        </fieldset>
      </div>
    );
  }

  return (
    <form className="ev-form" onSubmit={submit}>
      <div className="ev-type-bar">
        {type ? <><span className="ev-type-emoji" aria-hidden="true">{type.emoji}</span><span className="grow"><small className="muted">Event type</small><b>{type.label}</b></span></>
          : <span className="grow"><small className="muted">Event type</small><b>Not set</b></span>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking(true)}>{type ? 'Change' : 'Choose type'}</button>
      </div>
      <fieldset className="ev-section">
        <legend><span>1</span> Basics</legend>
        <Field label="Event name"><input required maxLength={120} value={f.title} onChange={text('title')} /></Field>
        <Field label="Tagline"><input maxLength={140} value={f.tagline} onChange={text('tagline')} placeholder="One line about the event" /></Field>
        <Field label="Organised by"><input value={f.organiser} onChange={text('organiser')} /></Field>
        <div className="two">
          <Field label="Starts"><input required type="datetime-local" value={toLocalInput(f.startsAt)} onChange={(e) => setF({ ...f, startsAt: fromLocalInput(e.target.value) })} /></Field>
          <Field label="Ends"><input required type="datetime-local" value={toLocalInput(f.endsAt)} onChange={(e) => setF({ ...f, endsAt: fromLocalInput(e.target.value) })} /></Field>
        </div>
        <Field label={type?.online ? 'Online meeting details' : 'Venue'} hint={type?.online ? 'The meeting link or where to watch. Attendees see it on the event page.' : undefined}><input required value={f.venue} onChange={text('venue')} placeholder={type?.online ? 'meet.google.com/… or YouTube Live' : undefined} /></Field>
        <Field label="Map" hint="Paste a Google Maps link, or type the full address. Attendees get a map and directions."><input value={f.mapLink ?? ''} onChange={(e) => setF({ ...f, mapLink: e.target.value })} placeholder="maps.app.goo.gl/… or full address" /></Field>
        <Field label="About the event"><textarea rows={4} value={f.description} onChange={text('description')} /></Field>
      </fieldset>

      {type && (
        <fieldset className="ev-section">
          <legend><span className="ev-type-emoji sm" aria-hidden="true">{type.emoji}</span> {type.label} details</legend>
          <p className="muted">All optional. Fill in what helps people decide to come.</p>
          {type.fields.map((fd) => (
            <Field key={fd.key} label={fd.label}>
              {fd.long
                ? <textarea rows={2} maxLength={1000} value={f.typeDetails?.[fd.key] ?? ''} placeholder={fd.placeholder} onChange={detail(fd.key)} />
                : <input maxLength={160} value={f.typeDetails?.[fd.key] ?? ''} placeholder={fd.placeholder} onChange={detail(fd.key)} />}
            </Field>
          ))}
        </fieldset>
      )}

      <fieldset className="ev-section">
        <legend><span>2</span> Banner and video</legend>
        <div className="field">
          <span className="field-label">Banner or poster</span>
          {shownThumb ? (
            <div className="ev-banner-edit">
              {banner ? <div className="ev-banner">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={banner.data} alt="New banner preview" /></div>
                : eventId ? <EventBanner event={{ id: eventId, title: f.title, bannerThumb: shownThumb }} /> : null}
              <div className="row">
                <label className="btn btn-ghost btn-sm"><ImagePlus size={15} /> Replace<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickBanner(e.target.files?.[0])} /></label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setBanner(null); setDropBanner(true); }}><Trash2 size={15} /> Remove</button>
              </div>
            </div>
          ) : (
            <label className="ev-drop">
              <ImagePlus size={24} aria-hidden="true" />
              <b>Add a banner</b>
              <small>A wide picture works best (16:9). PNG, JPG or WebP. We resize it for you.</small>
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickBanner(e.target.files?.[0])} />
            </label>
          )}
        </div>
        <Field label="Video (optional)" hint="A YouTube or Vimeo link: a teaser, last year’s highlights or a welcome message.">
          <div className="ev-input-icon"><Video size={17} aria-hidden="true" /><input value={f.videoUrl ?? ''} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} placeholder="youtube.com/watch?v=…" /></div>
        </Field>
        {!videoOk && <small className="error">That isn’t a YouTube or Vimeo link we can show.</small>}
        {videoOk && f.videoUrl?.trim() && <EventVideo url={f.videoUrl} title={f.title || 'Event'} />}
        <div className="field">
          <span className="field-label">Colour</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button type="button" key={c} className={`swatch c-${c}${f.color === c ? ' on' : ''}`} aria-label={c} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })} />
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="ev-section">
        <legend><span>3</span> Schedule file</legend>
        <p className="muted">Upload the printed schedule or brochure (PDF or image, up to 700 KB). Attendees can open and download it from the event’s Schedule page. You can also add sessions one by one, or import them from a PDF, in the Schedule tab.</p>
        {eventId && <ScheduleFiles eventId={eventId} compact />}
        {schedule ? (
          <div className="ev-schedule-file"><span className="ev-file-ic"><CalendarRange size={22} aria-hidden="true" /></span><div><b>{schedule.name}</b><small className="muted">Uploads when you save</small></div><button type="button" className="icon-btn" aria-label="Remove file" onClick={() => setSchedule(null)}><Trash2 size={16} /></button></div>
        ) : (
          <label className="btn btn-ghost btn-sm ev-upload"><CalendarRange size={15} /> {eventId ? 'Upload another schedule file' : 'Upload schedule file'}<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={(e) => pickSchedule(e.target.files?.[0])} /></label>
        )}
      </fieldset>

      <fieldset className="ev-section">
        <legend><span>4</span> Access</legend>
        <div className="ev-vis" role="radiogroup" aria-label="Who can find this event">
          {([
            ['public', Globe, 'Public', 'Listed in Explore. Anyone can find it and join.'],
            ['private', Lock, 'Private link', 'Not listed anywhere. Only people you send the private link to can open and join it.'],
            ['draft', Link2, 'Draft', 'Hidden while you set it up. Only organisers can see it.'],
          ] as const).map(([v, Ico, label, hint]) => (
            <button type="button" key={v} role="radio" aria-checked={vis === v} className={`ev-vis-opt${vis === v ? ' on' : ''}`} onClick={() => setF({ ...f, ...visibilityPatch(v) })}>
              <Ico size={20} aria-hidden="true" /><b>{label}</b><small>{hint}</small>
            </button>
          ))}
        </div>
        <div className="two">
          <div className="field">
            <span className="field-label">Expected number of attendees</span>
            <div className="stepper">
              <button type="button" aria-label="Fewer" onClick={() => setF({ ...f, expectedAttendees: Math.max(0, (f.expectedAttendees ?? 0) - 10) })}>−</button>
              <input type="number" min={0} max={1000000} inputMode="numeric" aria-label="Expected number of attendees" value={f.expectedAttendees || ''} placeholder="0"
                onChange={(e) => setF({ ...f, expectedAttendees: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
              <button type="button" aria-label="More" onClick={() => setF({ ...f, expectedAttendees: (f.expectedAttendees ?? 0) + 10 })}>+</button>
            </div>
            <span className="field-hint">For planning only. It never limits registration.</span>
          </div>
          <div className="field">
            <span className="field-label">Registration capacity</span>
            <input type="number" min={0} max={1000000} inputMode="numeric" value={f.capacity || ''} placeholder="No limit"
              onChange={(e) => setF({ ...f, capacity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
            <span className="field-hint">The most people who can register. Leave empty for no limit.</span>
          </div>
        </div>
        <Field label="Registration">
          <select value={f.registration} onChange={(e) => setF({ ...f, registration: e.target.value as EventFields['registration'] })}>
            <option value="open">Open: anyone who can see it can register</option>
            <option value="invite">Invite list only: people I import</option>
          </select>
        </Field>
      </fieldset>

      <ErrorNote text={mediaErr || err} />
      <button className="btn btn-primary btn-block" disabled={!!busy}>{busy || submitLabel}</button>
    </form>
  );
}
