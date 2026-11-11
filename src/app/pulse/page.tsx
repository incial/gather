'use client';

import { Suspense } from 'react';
import { PulseHome, RequireCreator } from '@/screens/pulse/PulseHome';

export default function Page() {
  return <Suspense><RequireCreator><PulseHome /></RequireCreator></Suspense>;
}
