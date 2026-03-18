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

interface Breakdown {
  direct_costs_prevented: number;
  indirect_losses_prevented: number;
  fines_avoided: number;
  investigation_savings: number;
  audit_efficiency: number;
}

interface Summary {
  total_prevented_incidents_per_year: number;
  prevented_serious_incidents: number;
  prevented_microtrama: number;
  total_saved_tenge_per_year: number;
  total_saved_usd_per_year: number;
  response_time_reduction_pct: number;
  predicted_incidents_next_year: number;
  roi_months: number;
  tz_comparable_tenge: number;
  tz_baseline_tenge: number;
  breakdown: Breakdown;
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

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    window.addEventListener("hse-dataset-changed", loadAll);
    return () => window.removeEventListener("hse-dataset-changed", loadAll);
  }, []);

  const beforeAfterData = byType.map((t) => ({
    name: t.type
      .replace("НС (несчастный случай)", "НС")
      .replace("Авария оборудования", "Авария обор.")
      .replace("Экологическое нарушение", "Эко. нар.")
      .replace("Опасная ситуация", "Опасн. ситуация"),
    "До AI": t.avg_per_year,
    "После AI": t.predicted_after_ai,
  }));

  const savingsData = byType
    .sort((a, b) => b.direct_savings_tenge - a.direct_savings_tenge)
    .map((t) => ({
      name: t.type
        .replace("НС (несчастный случай)", "НС")
        .replace("Авария оборудования", "Авария")
        .replace("Экологическое нарушение", "Экология"),
      savings: Math.round(t.direct_savings_tenge / 1_000_000),
    }));

  const bd = summary?.breakdown;
  const breakdownRows = bd
    ? [
        { label: "Прямые затраты (медпомощь, компенсации)", value: bd.direct_costs_prevented, color: "text-red-400" },
        { label: "Косвенные потери (простой, репутация)", value: bd.indirect_losses_prevented, color: "text-orange-400" },
        { label: "Предотвращённые штрафы регулятора", value: bd.fines_avoided, color: "text-yellow-400" },
        { label: "Снижение затрат на расследования", value: bd.investigation_savings, color: "text-blue-400" },
        { label: "Эффективность аудита (Карта Коргау)", value: bd.audit_efficiency, color: "text-purple-400" },
      ]
    : [];

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

        <div className="bg-slate-800 rounded-xl p-5 border-l-4 border-red-500">
          <div className="text-slate-400 text-sm">Предотвращено НС/год</div>
          <div className="text-3xl font-bold text-red-400 mt-1">
            {summary ? `↓ ${summary.prevented_serious_incidents}` : "—"}
          </div>
          <div className="text-slate-500 text-xs mt-1">
            микротравм: ↓ {summary?.prevented_microtrama ?? "—"}/год
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

        <div className="col-span-2 bg-gradient-to-r from-green-900/40 to-blue-900/40 border border-green-800/50 rounded-xl p-5">
          <div className="flex items-center gap-6 mb-3">
            <div className="text-5xl">💰</div>
            <div>
              <div className="text-slate-300 text-sm mb-1">Совокупный экономический эффект</div>
              <div className="text-2xl font-bold text-green-300">
                {summary ? `≈ ${fmt(summary.total_saved_tenge_per_year)} в год` : "—"}
              </div>
              <div className="text-slate-400 text-xs mt-1">
                Окупаемость — менее {summary?.roi_months ?? "—"} месяцев. ISO 45001 (data-driven).
              </div>
            </div>
          </div>
          {summary && (
            <div className="grid grid-cols-2 gap-3 border-t border-slate-700/50 pt-3">
              <div className="text-xs text-slate-400">
                <span className="text-slate-500">Базовый уровень по ТЗ (только НС):</span>
                <span className="text-slate-300 font-medium ml-2">{fmt(summary.tz_baseline_tenge)}</span>
              </div>
              <div className="text-xs text-slate-400">
                <span className="text-slate-500">Наш сопоставимый (по методологии ТЗ):</span>
                <span className="text-green-400 font-medium ml-2">{fmt(summary.tz_comparable_tenge)}</span>
              </div>
              <div className="col-span-2 text-xs text-slate-500 italic">
                Полный эффект выше за счёт предотвращения аварий оборудования, ДТП и экологических нарушений
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Разбивка по статьям ТЗ */}
      {bd && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-slate-200 font-semibold mb-4">Структура экономии (по методологии ТЗ)</h2>
          <div className="space-y-3">
            {breakdownRows.map((row, i) => {
              const pct = Math.round((row.value / summary!.total_saved_tenge_per_year) * 100);
              return (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-56 text-slate-400 text-sm flex-shrink-0">{row.label}</div>
                  <div className="flex-1 bg-slate-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-current transition-all"
                      style={{ width: `${pct}%`, color: row.color.replace("text-", "") }}
                    />
                  </div>
                  <div className={`w-24 text-right text-sm font-medium ${row.color}`}>
                    {fmt(row.value)}
                  </div>
                  <div className="w-10 text-right text-slate-500 text-xs">{pct}%</div>
                </div>
              );
            })}
            <div className="border-t border-slate-700 pt-3 flex items-center gap-4">
              <div className="w-56 text-slate-300 text-sm font-semibold flex-shrink-0">ИТОГО</div>
              <div className="flex-1" />
              <div className="w-24 text-right text-green-400 font-bold">
                {summary ? fmt(summary.total_saved_tenge_per_year) : "—"}
              </div>
              <div className="w-10 text-right text-slate-500 text-xs">100%</div>
            </div>
          </div>
        </div>
      )}

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
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #484155", borderRadius: 8 }}
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
