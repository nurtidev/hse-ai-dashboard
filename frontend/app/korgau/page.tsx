"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL;

interface KorgauStats {
  total_observations: number;
  total_violations: number;
  total_good_practices: number;
  by_category: Record<string, number>;
  by_org: Record<string, number>;
  resolution_status: Record<string, number>;
}

interface Rating {
  org_id: string;
  org_name: string;
  total_incidents: number;
  total_violations: number;
  risk_index: number;
  risk_level: string;
}

interface Alert {
  level: string;
  label: string;
  color: string;
  org_name: string;
  message: string;
  count: number;
}

const RISK_COLORS: Record<string, string> = {
  Критический: "#ef4444",
  Высокий: "#f97316",
  Средний: "#eab308",
  Низкий: "#22c55e",
};

export default function KorgauPage() {
  const [stats, setStats] = useState<KorgauStats | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/korgau/stats`).then((r) => r.json()),
      fetch(`${API}/api/korgau/ratings`).then((r) => r.json()),
      fetch(`${API}/api/korgau/alerts`).then((r) => r.json()),
    ]).then(([s, r, a]) => {
      setStats(s);
      setRatings(r.ratings ?? []);
      setAlerts(a.alerts ?? []);
    });
  }, []);

  const categoryData = stats
    ? Object.entries(stats.by_category)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Карта Коргау</h1>
        <p className="text-slate-400 text-sm mt-1">Поведенческие аудиты безопасности и нарушения</p>
      </div>

      {/* Сводные KPI */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border-l-4 border-blue-500">
          <div className="text-slate-400 text-sm">Всего наблюдений</div>
          <div className="text-2xl font-bold mt-1">{stats?.total_observations ?? "—"}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border-l-4 border-red-500">
          <div className="text-slate-400 text-sm">Нарушений</div>
          <div className="text-2xl font-bold mt-1">{stats?.total_violations ?? "—"}</div>
          {stats && (
            <div className="text-xs text-slate-500 mt-1">
              {Math.round((stats.total_violations / stats.total_observations) * 100)}% от всех наблюдений
            </div>
          )}
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border-l-4 border-green-500">
          <div className="text-slate-400 text-sm">Хороших практик</div>
          <div className="text-2xl font-bold mt-1">{stats?.total_good_practices ?? "—"}</div>
        </div>
      </div>

      {/* Алерты */}
      {alerts.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-slate-200 font-semibold mb-4">
            Активные алерты <span className="text-slate-400 font-normal text-sm">({alerts.length})</span>
          </h2>
          <div className="space-y-3">
            {alerts.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border-l-4"
                style={{ borderColor: a.color, backgroundColor: `${a.color}11` }}
              >
                <span
                  className="text-xs font-bold px-2 py-1 rounded text-white shrink-0"
                  style={{ backgroundColor: a.color }}
                >
                  {a.label}
                </span>
                <div>
                  <div className="text-sm font-medium text-slate-200">{a.org_name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{a.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Нарушения по категориям */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-slate-200 font-semibold mb-4">Нарушения по категориям</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={categoryData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={160} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
              itemStyle={{ color: "#ef4444" }}
            />
            <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} name="Нарушений" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Рейтинг организаций */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-slate-200 font-semibold mb-4">Рейтинг организаций по уровню риска</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-700">
                <th className="pb-3 pr-4">#</th>
                <th className="pb-3 pr-4">Организация</th>
                <th className="pb-3 pr-4 text-right">Инцидентов</th>
                <th className="pb-3 pr-4 text-right">Нарушений</th>
                <th className="pb-3 pr-4">Индекс риска</th>
                <th className="pb-3">Уровень</th>
              </tr>
            </thead>
            <tbody>
              {ratings.map((r, i) => (
                <tr key={r.org_id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-3 pr-4 text-slate-500">{i + 1}</td>
                  <td className="py-3 pr-4 text-slate-200">{r.org_name}</td>
                  <td className="py-3 pr-4 text-right text-slate-300">{r.total_incidents}</td>
                  <td className="py-3 pr-4 text-right text-slate-300">{r.total_violations}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-700 rounded-full h-2 max-w-20">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${r.risk_index}%`,
                            backgroundColor: RISK_COLORS[r.risk_level] ?? "#94a3b8",
                          }}
                        />
                      </div>
                      <span className="text-slate-300 font-mono text-xs">{r.risk_index}</span>
                    </div>
                  </td>
                  <td className="py-3">
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{
                        color: RISK_COLORS[r.risk_level] ?? "#94a3b8",
                        backgroundColor: `${RISK_COLORS[r.risk_level] ?? "#94a3b8"}22`,
                      }}
                    >
                      {r.risk_level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
