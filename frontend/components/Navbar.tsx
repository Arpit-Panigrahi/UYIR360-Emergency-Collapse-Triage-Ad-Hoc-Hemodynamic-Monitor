"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Radio, Send, HeartPulse } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/monitor", label: "Sternal sPPG & CPR Monitor", icon: Radio },
    { href: "/paramedic", label: "Paramedic Incident Relay", icon: Send },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <Link href="/" className="flex items-center space-x-2.5">
          <div className="bg-red-500/20 text-red-400 p-2 rounded-xl border border-red-500/30">
            <HeartPulse className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold tracking-tight text-white">The Intermediator</span>
              <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                120+ FPS Sternal sPPG
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Emergency Collapse Triage &amp; Hemodynamic Monitor</p>
          </div>
        </Link>
      </div>

      <nav className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                isActive
                  ? "bg-brand-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center space-x-3 text-xs">
        <div className="flex items-center space-x-1.5 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-slate-300">Pure TypeScript DSP</span>
        </div>
        <div className="flex items-center space-x-1.5 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700">
          <Send className="w-3 h-3 text-sky-400" />
          <span className="text-slate-300">@PulseGuardbbot</span>
        </div>
      </div>
    </header>
  );
}
