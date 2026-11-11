'use client';

import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/lib/auth';
import { ModeProvider } from '@/lib/mode';

export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider><ModeProvider><ToastProvider>{children}</ToastProvider></ModeProvider></AuthProvider>;
}
