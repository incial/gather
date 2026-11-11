'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { Scan } from '@/screens/event/Scan';

export default function Page() {
  return (
    <div className="scan-page">
      <Link href="/" className="icon-btn" aria-label="Back to my events"><Icon name="back" /></Link>
      <Scan />
    </div>
  );
}
