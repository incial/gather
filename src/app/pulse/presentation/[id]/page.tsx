'use client';

import { Suspense } from 'react';
import { RequireCreator } from '@/screens/pulse/PulseHome';
import { Presenter } from '@/screens/pulse/Presenter';

export default function Page() {
  return <Suspense><RequireCreator><Presenter /></RequireCreator></Suspense>;
}
