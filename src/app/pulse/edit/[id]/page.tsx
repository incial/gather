'use client';

import { Suspense } from 'react';
import { RequireCreator } from '@/screens/pulse/PulseHome';
import { Builder } from '@/screens/pulse/Builder';

export default function Page() {
  return <Suspense><RequireCreator><Builder /></RequireCreator></Suspense>;
}
