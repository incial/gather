'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { Site } from './Site';

// The signed-in dashboard is its own chunk: visitors never download it, and it starts loading as soon as
// sign-in reports a user. While it arrives, the same loader as before is shown.
const MyEvents = dynamic(() => import('./MyEvents').then((m) => m.MyEvents), {
  ssr: false,
  loading: () => <div className="center"><Spinner /></div>,
});

export function Home() {
  const { user, loading } = useAuth();
  // While sign-in is starting, the website is already on screen for visitors (it is in the page's HTML).
  // Someone signed in last time gets a loader instead (CSS, from a hint set before the first paint).
  // The website keeps the same place in the page before and after sign-in, so it isn't built a second time.
  return (
    <>
      {loading && <div className="center boot-spin"><Spinner /></div>}
      {loading || !user ? <Site deferData={loading} /> : <MyEvents />}
    </>
  );
}
