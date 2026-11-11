'use client';

import { Suspense } from 'react';
import { PulseCreate, RequireCreator } from '@/screens/pulse/PulseHome';

export default function Page() {
  return <Suspense><RequireCreator><PulseCreate /></RequireCreator></Suspense>;
}
