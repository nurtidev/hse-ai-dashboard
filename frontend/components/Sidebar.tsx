"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Обзор", icon: "⊞" },
  { href: "/incidents", label: "Происшествия", icon: "⚠" },
  { href: "/korgau", label: "Карта Коргау", icon: "☑" },
  { href: "/recommendations", label: "Рекомендации", icon: "✦" },
  { href: "/kpi", label: "Экон. эффект", icon: "₸" },
  { href: "/chat", label: "AI Аналитик", icon: "◈" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
      <div className="p-6 border-b border-slate-800">
        <div className="text-blue-400 font-bold text-lg">HSE AI</div>
        <div className="text-slate-400 text-xs mt-1">КМГ-Кумколь · Охрана труда</div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {links.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
        Хакатон Astana Hub · 2026
      </div>
    </aside>
  );
}
