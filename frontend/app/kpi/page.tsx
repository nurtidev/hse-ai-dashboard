"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL;

interface ByType {
  type: string;
  avg_per_year: number;
  predicted_after_ai: number;
  prevented_per_year: number;
  reduction_pct: number;
  direct_savings_tenge: number;
}

interface Summary {
  total_prevented_incidents_per_year: number;
  total_saved_tenge_per_year: number;
  total_saved_usd_per_year: number;
  response_time_reduction_pct: number;
  predicted_incidents_next_year: number;
  roi_months: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)} млн ₸`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} тыс ₸`;
  return `${n} ₸`;
}

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

export default function KpiPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byType, setByType] = useState<ByType[]>([]);

  const loadAll = () => {
    fetch(`${API}/api/kpi/`)
      .then((r) => r.json())
      .then((d) => {
        setSummary(d.summary);
        setByType(d.by_type ?? []);
      });
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    window.addEventListener("hse-dataset-changed", loadAll);
    return () => window.removeEventListener("hse-dataset-changed", loadAll);
  }, []);

  const beforeAfterData = byType.map((t) => ({
    name: t.type.replace("НС (несчастный случай)", "НС").replace("Авария оборудования", "Авария обор.").replace("Экологическое нарушение", "Эко. нар.").replace("Опасная ситуация", "Опасн. ситуация"),
    "До AI": t.avg_per_year,
    "После AI": t.predicted_after_ai,
  }));

  const savingsData = byType
    .sort((a, b) => b.direct_savings_tenge - a.direct_savings_tenge)
    .map((t) => ({
      name: t.type.replace("НС (несчастный случай)", "НС").replace("Авария оборудования", "Авария").replace("Экологическое нарушение", "Экология"),
      savings: Math.round(t.direct_savings_tenge / 1_000_000),
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Экономический эффект</h1>
        <p className="text-slate-400 text-sm mt-1">
          Прогнозируемые результаты от внедрения AI-модуля в HSE-систему
        </p>
      </div>

      {/* Главные KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border-l-4 border-green-500 xl:col-span-1">
          <div className="text-slate-400 text-sm">Годовая экономия</div>
          <div className="text-3xl font-bold text-green-400 mt-1">
            {summary ? fmt(summary.total_saved_tenge_per_year) : "—"}
          </div>
          <div className="text-slate-500 text-xs mt-1">
            ≈ ${summary?.total_saved_usd_per_year?.toLocaleString()} USD
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-5 border-l-4 border-blue-500">
          <div className="text-slate-400 text-sm">Предотвращаемых инцидентов/год</div>
          <div className="text-3xl font-bold text-blue-400 mt-1">
            {summary ? `↓ ${summary.total_prevented_incidents_per_year}` : "—"}
          </div>
          <div className="text-slate-500 text-xs mt-1">
            прогноз на след. год: {summary?.predicted_incidents_next_year ?? "—"}
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-5 border-l-4 border-purple-500">
          <div className="text-slate-400 text-sm">Срок окупаемости</div>
          <div className="text-3xl font-bold text-purple-400 mt-1">
            {summary ? `${summary.roi_months} мес.` : "—"}
          </div>
          <div className="text-slate-500 text-xs mt-1">при стоимости разработки 1 млн ₸</div>
        </div>

        <div className="bg-slate-800 rounded-xl p-5 border-l-4 border-amber-500">
          <div className="text-slate-400 text-sm">Снижение времени реагирования</div>
          <div className="text-3xl font-bold text-amber-400 mt-1">
            {summary ? `↓ ${summary.response_time_reduction_pct}%` : "—"}
          </div>
          <div className="text-slate-500 text-xs mt-1">с 72 часов до 12 часов</div>
        </div>

        <div className="col-span-2 bg-gradient-to-r from-green-900/40 to-blue-900/40 border border-green-800/50 rounded-xl p-5 flex items-center gap-6">
          <div className="text-5xl">💰</div>
          <div>
            <div className="text-slate-300 text-sm mb-1">Совокупный экономический эффект</div>
            <div className="text-2xl font-bold text-green-300">
              {summary ? `≈ ${fmt(summary.total_saved_tenge_per_year)} в год` : "—"}
            </div>
            <div className="text-slate-400 text-xs mt-1">
              Окупаемость — менее {summary?.roi_months ?? "—"} месяцев. Соответствует ISO 45001 (data-driven подход).
            </div>
          </div>
        </div>
      </div>

      {/* До / После по типам */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-slate-200 font-semibold mb-4">
          Инциденты в год: до и после внедрения AI
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={beforeAfterData} layout="vertical" barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={130} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
              formatter={(value, name) => [Number(value).toFixed(1), String(name)]}
            />
            <Bar dataKey="До AI" fill="#ef4444" radius={[0, 4, 4, 0]} />
            <Bar dataKey="После AI" fill="#22c55e" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Экономия по типам */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-slate-200 font-semibold mb-4">Экономия по типам инцидентов (млн ₸/год)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={savingsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} unit=" млн" />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
              formatter={(v) => [`${Number(v)} млн ₸`, "Экономия"]}
            />
            <Bar dataKey="savings" radius={[4, 4, 0, 0]}>
              {savingsData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Таблица по типам */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-slate-200 font-semibold mb-4">Детализация по типам инцидентов</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-700">
                <th className="pb-3 pr-4">Тип</th>
                <th className="pb-3 pr-4 text-right">Ср./год сейчас</th>
                <th className="pb-3 pr-4 text-right">После AI</th>
                <th className="pb-3 pr-4 text-right">Снижение</th>
                <th className="pb-3 text-right">Экономия/год</th>
              </tr>
            </thead>
            <tbody>
              {byType.map((t, i) => (
                <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-3 pr-4 text-slate-200">{t.type}</td>
                  <td className="py-3 pr-4 text-right text-slate-300">{t.avg_per_year.toFixed(1)}</td>
                  <td className="py-3 pr-4 text-right text-green-400">{t.predicted_after_ai.toFixed(1)}</td>
                  <td className="py-3 pr-4 text-right">
                    <span className="text-green-400 font-medium">↓ {t.reduction_pct}%</span>
                  </td>
                  <td className="py-3 text-right text-amber-400 font-medium">{fmt(t.direct_savings_tenge)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
