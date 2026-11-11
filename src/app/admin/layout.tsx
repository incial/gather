'use client';

import type { ReactNode } from 'react';
import { RequireOrganiser } from '@/screens/admin/RequireOrganiser';

export default function Layout({ children }: { children: ReactNode }) {
  return <RequireOrganiser>{children}</RequireOrganiser>;
}
