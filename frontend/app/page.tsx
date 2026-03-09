"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL;

interface KpiSummary {
  total_prevented_incidents_per_year: number;
  total_saved_tenge_per_year: number;
  roi_months: number;
  predicted_incidents_next_year: number;
}

interface Alert {
  level: string;
  label: string;
  color: string;
  org_name: string;
  message: string;
  count: number;
}

interface MonthlyStat {
  month: string;
  count: number;
}

function KpiCard({ title, value, sub, accent }: { title: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className={`bg-slate-800 rounded-xl p-5 border-l-4`} style={{ borderColor: accent ?? "#3b82f6" }}>
      <div className="text-slate-400 text-sm mb-1">{title}</div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  return (
    <div
      className="bg-slate-800 rounded-lg p-4 border-l-4 flex items-start gap-3"
      style={{ borderColor: alert.color }}
    >
      <div className="text-xs font-bold px-2 py-1 rounded text-white mt-0.5" style={{ backgroundColor: alert.color }}>
        {alert.label}
      </div>
      <div>
        <div className="text-sm font-medium text-slate-200">{alert.org_name}</div>
        <div className="text-xs text-slate-400 mt-0.5">{alert.message}</div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [stats, setStats] = useState<{ total: number; monthly_series: MonthlyStat[] } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/kpi`).then((r) => r.json()),
      fetch(`${API}/api/incidents/stats`).then((r) => r.json()),
      fetch(`${API}/api/korgau/alerts`).then((r) => r.json()),
    ]).then(([kpiData, statsData, alertsData]) => {
      setKpi(kpiData.summary);
      setStats(statsData);
      setAlerts(alertsData.alerts ?? []);
    });
  }, []);

  const formatTenge = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(0)} млн ₸` : `${n.toLocaleString()} ₸`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Обзор</h1>
        <p className="text-slate-400 text-sm mt-1">Сводная аналитика HSE-системы КМГ-Кумколь</p>
      </div>

      {/* KPI карточки */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Всего инцидентов (3 года)"
          value={stats ? String(stats.total) : "—"}
          sub="из данных HSE-системы"
          accent="#3b82f6"
        />
        <KpiCard
          title="Прогноз на следующий год"
          value={kpi ? String(kpi.predicted_incidents_next_year) : "—"}
          sub="по модели Prophet"
          accent="#8b5cf6"
        />
        <KpiCard
          title="Предотвращаемых инцидентов/год"
          value={kpi ? String(kpi.total_prevented_incidents_per_year) : "—"}
          sub="после внедрения AI"
          accent="#22c55e"
        />
        <KpiCard
          title="Экономия в год"
          value={kpi ? formatTenge(kpi.total_saved_tenge_per_year) : "—"}
          sub={kpi ? `Окупаемость: ${kpi.roi_months} мес.` : ""}
          accent="#f59e0b"
        />
      </div>

      {/* График динамики */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-slate-200 font-semibold mb-4">Динамика инцидентов по месяцам</h2>
        {stats?.monthly_series ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={stats.monthly_series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                labelStyle={{ color: "#94a3b8" }}
                itemStyle={{ color: "#3b82f6" }}
              />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} name="Инциденты" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-60 flex items-center justify-center text-slate-500">Загрузка...</div>
        )}
      </div>

      {/* Алерты */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-slate-200 font-semibold mb-4">
          Активные алерты{" "}
          <span className="text-sm font-normal text-slate-400">({alerts.length})</span>
        </h2>
        {alerts.length === 0 ? (
          <div className="text-slate-500 text-sm">Нет активных алертов</div>
        ) : (
          <div className="space-y-3">
            {alerts.map((a, i) => (
              <AlertCard key={i} alert={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
