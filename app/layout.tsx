import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/app/components/AppShell";
import { BottomNav } from "@/app/components/BottomNav";
import { OnboardingTour } from "@/app/components/onboarding/OnboardingTour";
import { InstallPrompt } from "@/app/components/pwa/InstallPrompt";
import { ServiceWorkerRegistration } from "@/app/components/pwa/ServiceWorkerRegistration";
import { ClientBoundary } from "@/app/components/ui/ClientBoundary";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Grain",
  description: "Local finance tracker PWA",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon",
    apple: "/icon",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegistration />
        <ClientBoundary label="InstallPrompt">
          <InstallPrompt />
        </ClientBoundary>
        <AppShell>{children}</AppShell>
        <ClientBoundary label="OnboardingTour">
          <OnboardingTour />
        </ClientBoundary>
        <BottomNav />
      </body>
    </html>
  );
}
