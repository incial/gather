import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/geist';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Gather',
  description: 'Join events, check in, meet speakers and share feedback.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Gather' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#FFFFFF' };

/** Runs before the first paint: a visitor who was signed in last time sees a loader, not the website. */
const HINT = `try{if(localStorage.getItem('gather-signed-in'))document.documentElement.setAttribute('data-auth','')}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Open the connections sign-in and data use while the app is still downloading. */}
        <link rel="preconnect" href="https://firestore.googleapis.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://securetoken.googleapis.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: HINT }} />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
