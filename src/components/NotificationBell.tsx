'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { useCol } from '../lib/live';
import type { NotificationDoc } from '../lib/meetping';

/** Bell with the unread count, shown next to the account menu. One small live query (unread only). */
export function NotificationBell() {
  const { user } = useAuth();
  const unread = useCol<NotificationDoc>(user ? `users/${user.uid}/notifications` : null, useMemo<[string, unknown][]>(() => [['read', false]], []));
  if (!user) return null;
  const n = unread.data.length;
  return (
    <Link href="/inbox" className="bell icon-btn" aria-label={n ? `${n} unread notifications` : 'Notifications'}>
      <Bell size={19} aria-hidden="true" />
      {n > 0 && <span className="bell-n">{n > 9 ? '9+' : n}</span>}
    </Link>
  );
}
