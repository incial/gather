'use client';

import { useEffect, useMemo, useState } from 'react';
import { forgetDeletedEvents } from './api';
import { useCol } from './live';
import type { MembershipDoc } from './types';

/**
 * The events this person joined, as every screen shows them. Events an organiser deleted vanish
 * live (their copy is removed); any copy left over from an older or interrupted delete is checked
 * once per session and tidied away, so a deleted event never shows anywhere.
 */
export function useMyEvents(uid: string | undefined) {
  const col = useCol<MembershipDoc>(uid ? `users/${uid}/events` : null);
  const [gone, setGone] = useState<string[]>([]);
  const ids = col.data.map((m) => m.id).join(',');
  useEffect(() => {
    if (!uid || col.loading || !ids) return;
    forgetDeletedEvents(uid, ids.split(',')).then((g) => { if (g.length) setGone(g); }).catch(() => {});
  }, [uid, col.loading, ids]);
  const data = useMemo(() => col.data.filter((m) => !gone.includes(m.id)), [col.data, gone]);
  return { ...col, data };
}
