'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

/**
 * A thin bar at the top that starts the instant someone taps a link inside the app and finishes when the
 * new page is on screen. Without it, a page that takes a moment to load looks like the tap didn't work,
 * and people tap again.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page (or a #link)
      setState('busy');
    };
    // Capture phase, so the bar shows even if the page's own handler navigates programmatically.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // The new page is here: finish the bar.
  useEffect(() => {
    setState((s) => (s === 'busy' ? 'done' : s));
  }, [pathname, search]);
  useEffect(() => {
    if (state === 'done') { const t = setTimeout(() => setState('idle'), 320); return () => clearTimeout(t); }
    if (state === 'busy') { const t = setTimeout(() => setState('idle'), 10_000); return () => clearTimeout(t); } // never stuck
  }, [state]);

  return <div className={`nav-progress ${state}`} aria-hidden="true" />;
}

export function NavProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
