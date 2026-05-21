import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { BranchProvider } from "@/contexts/BranchContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { Toaster } from "@/components/ui/sonner";
import { DialogHost } from "@/components/common/dialogs";


import { ConfigProvider } from "@/contexts/ConfigContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Renotech POS - Sistema de Punto de Venta",
  description: "Sistema de Punto de Venta Multi-Sucursal para gestión de inventario, ventas y caja",
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Renotech' },
  icons: {
    icon: '/icons/favicon-32.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('theme'),s=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';if((t||s)==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
        <AuthProvider>
          <BranchProvider>
            <ConfigProvider>
              <ThemeProvider>
                <ChatProvider>
                  {children}
                  <Toaster />
                  <DialogHost />
                </ChatProvider>
              </ThemeProvider>
            </ConfigProvider>
          </BranchProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
