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
  // Allows testing on a phone over the local network during development.
  allowedDevOrigins: ['*.local', '192.168.*.*', '10.*.*.*'],
};

export default config;
