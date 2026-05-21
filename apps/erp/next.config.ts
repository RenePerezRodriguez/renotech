import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'flagcdn.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'mainfacts.com', port: '', pathname: '/**' },
    ],
  },
};

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  reloadOnOnline: false,
  workboxOptions: { disableDevLogs: true, skipWaiting: true },
})(nextConfig);
