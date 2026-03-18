"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

const links = [
  { href: "/", label: "Обзор", icon: "⊞" },
  { href: "/incidents", label: "Происшествия", icon: "⚠" },
  { href: "/korgau", label: "Карта Коргау", icon: "☑" },
  { href: "/investigate", label: "Следователь", icon: "🔍" },
  { href: "/recommendations", label: "Рекомендации", icon: "✦" },
  { href: "/kpi", label: "Экон. эффект", icon: "₸" },
  { href: "/chat", label: "AI Аналитик", icon: "◈" },
];

const DATASET_OPTIONS = [
  { value: "combined", label: "Все данные", badge: "820 инц." },
  { value: "real", label: "Данные организаторов", badge: "219 инц." },
  { value: "synthetic", label: "Синтетика", badge: "601 инц." },
] as const;

type Dataset = "combined" | "real" | "synthetic";

const BADGE_COLORS: Record<Dataset, string> = {
  combined: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  real: "bg-green-500/20 text-green-400 border-green-500/30",
  synthetic: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [dataset, setDataset] = useState<Dataset>("combined");
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/config/dataset`)
      .then((r) => r.json())
      .then((d) => setDataset(d.dataset as Dataset))
      .catch(() => {});
  }, []);

  const handleSwitch = async (value: Dataset) => {
    if (value === dataset || switching) return;
    setSwitching(true);
    try {
      await fetch(`${API}/api/config/dataset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: value }),
      });
      setDataset(value);
      window.dispatchEvent(new CustomEvent("hse-dataset-changed", { detail: { dataset: value } }));
      router.refresh();
    } finally {
      setSwitching(false);
    }
  };

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

      {/* Dataset Switcher */}
      <div className="p-4 border-t border-slate-800">
        <div className="text-xs text-slate-500 mb-2 flex items-center justify-between">
          <span>Источник данных</span>
          {switching && <span className="text-blue-400 animate-pulse text-xs">обновление...</span>}
        </div>
        <div className="space-y-1">
          {DATASET_OPTIONS.map((opt) => {
            const active = dataset === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSwitch(opt.value as Dataset)}
                disabled={switching}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                  active
                    ? "bg-slate-700 text-slate-100"
                    : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      active ? "bg-blue-400" : "bg-slate-600"
                    }`}
                  />
                  {opt.label}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
                    active
                      ? BADGE_COLORS[opt.value as Dataset]
                      : "bg-slate-800 text-slate-600 border-slate-700"
                  }`}
                >
                  {opt.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-4 text-xs text-slate-600">
        Хакатон Astana Hub · 2026
      </div>
    </aside>
  );
}
