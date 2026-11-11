'use client';

import { useState } from 'react';
import { CsvButton, Icon, useToast } from '../../components/ui';
import { allSheets, downloadZip, type EventData } from '../../lib/exports';
import { loadEventData, useAdmin } from './context';

const NAMES: [string, string, string][] = [
  ['event-details', 'Event details', 'Name, dates, venue, join code and Wi-Fi'],
  ['attendees', 'Attendees', 'Everyone joined or pre-registered, with contact details'],
  ['attendance-register', 'Attendance register', 'One row per person, P or A for each session, with %'],
  ['attendance-log', 'Attendance log', 'Every check-in with time and method'],
  ['feedback', 'Feedback', 'Overall answers and speaker ratings'],
  ['session-feedback', 'Session feedback', 'Ratings and comments for each session'],
  ['speakers', 'Speakers', 'Profiles, links and connection counts'],
  ['schedule', 'Schedule', 'Sessions with check-in counts'],
  ['speaker-connections', 'Speaker connections', 'Who connected with whom'],
  ['saved-by', 'Saved by', 'People who swiped right on this event in Explore'],
];

/** Downloads read the event's data once, at the moment you ask, so nothing heavy stays loaded. */
export function DataTab() {
  const base = useAdmin();
  const toast = useToast();
  const [cache, setCache] = useState<EventData | null>(null);
  const [zipping, setZipping] = useState(false);
  const data = async () => { const d = cache ?? (await loadEventData(base)); setCache(d); return d; };

  async function zip() {
    setZipping(true);
    try { downloadZip(await data()); } catch { toast('Couldn’t prepare the export. Check your connection and try again.', 'err'); }
    setZipping(false);
  }
  return (
    <div className="stack-lg narrow">
      <div className="row-between">
        <h1>Data & CSV</h1>
        <button className="btn btn-ink btn-sm" onClick={zip} disabled={zipping}><Icon name="download" size={16} /> {zipping ? 'Preparing…' : 'Download all (.zip)'}</button>
      </div>
      <p className="muted">Each download includes everything up to the moment you click.</p>
      <div className="table-list">
        {NAMES.map(([name, title, desc]) => (
          <div key={name} className="list-row">
            <div className="grow"><b>{title}</b><small>{desc}</small></div>
            <CsvButton prefix={base.prefix} load={async () => allSheets(await data()).find((s) => s.name === name)!} />
          </div>
        ))}
      </div>
    </div>
  );
}
