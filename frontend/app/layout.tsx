import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "PulseGuard | Emergency Triage & Continuous Physiological Telemetry",
  description:
    "Open-source clinical tele-triage and continuous physiological monitoring platform with real-time Telegram paramedic forwarding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased">
        <Navbar />
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">{children}</main>
        <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
          PulseGuard Clinical Platform • 100% Open-Source • HIPAA/GDPR Compatible Architecture
        </footer>
      </body>
    </html>
  );
}
