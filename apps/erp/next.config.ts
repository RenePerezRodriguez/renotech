import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Raíz del workspace para que Next.js tracee correctamente
  // los paquetes hoisted del monorepo (next, react, firebase, etc.).
  // El buildCommand de App Hosting aplana la salida anidada.
  outputFileTracingRoot: path.join(__dirname, "../../"),
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

