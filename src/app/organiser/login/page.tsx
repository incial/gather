'use client';

import { Suspense } from 'react';
import { Spinner } from '@/components/ui';
import { Login } from '@/screens/Login';

export default function Page() {
  return <Suspense fallback={<div className="center"><Spinner /></div>}><Login role="organiser" /></Suspense>;
}
