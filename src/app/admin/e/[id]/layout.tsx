'use client';

import type { ReactNode } from 'react';
import { AdminEventLayout } from '@/screens/admin/AdminEventLayout';

export default function Layout({ children }: { children: ReactNode }) {
  return <AdminEventLayout>{children}</AdminEventLayout>;
}
