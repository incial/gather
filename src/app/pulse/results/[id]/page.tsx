'use client';

import { Suspense } from 'react';
import { RequireCreator } from '@/screens/pulse/PulseHome';
import { Results } from '@/screens/pulse/Results';

export default function Page() {
  return <Suspense><RequireCreator><Results /></RequireCreator></Suspense>;
}
