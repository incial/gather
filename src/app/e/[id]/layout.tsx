'use client';

import { Suspense, type ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { EventLayout } from '@/screens/event/EventLayout';

export default function Layout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="center"><Spinner /></div>}><EventLayout>{children}</EventLayout></Suspense>;
}
