'use client';

import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/lib/auth';
import { ModeProvider } from '@/lib/mode';
import { NavProgress } from '@/components/NavProgress';
import { SpeakerAutoLink } from '@/components/SpeakerAutoLink';

export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider><ModeProvider><ToastProvider><NavProgress /><SpeakerAutoLink />{children}</ToastProvider></ModeProvider></AuthProvider>;
}
