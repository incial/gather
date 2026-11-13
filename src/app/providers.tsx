'use client';

import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/lib/auth';
import { ModeProvider } from '@/lib/mode';
import { NavProgress } from '@/components/NavProgress';

export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider><ModeProvider><ToastProvider><NavProgress />{children}</ToastProvider></ModeProvider></AuthProvider>;
}
