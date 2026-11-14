import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  // Google sign-in runs through this site's own address, so the sign-in screen shows the
  // Gather web address instead of the Firebase project name.
  async rewrites() {
    return [
      { source: '/__/auth/:path*', destination: 'https://ie-fdp-2026.firebaseapp.com/__/auth/:path*' },
      { source: '/__/firebase/:path*', destination: 'https://ie-fdp-2026.firebaseapp.com/__/firebase/:path*' },
    ];
  },
  // Security headers on every response. Google sign-in uses a popup, so the opener policy allows popups;
  // the camera stays available to this site only (QR scanning), everything else it never needs is off.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ],
    }, {
      // API answers are per-person: never cached by browsers or shared caches.
      source: '/api/:path*',
      headers: [{ key: 'Cache-Control', value: 'no-store' }],
    }];
  },
  // Allows testing on a phone over the local network during development.
  allowedDevOrigins: ['*.local', '192.168.*.*', '10.*.*.*'],
};

export default config;
