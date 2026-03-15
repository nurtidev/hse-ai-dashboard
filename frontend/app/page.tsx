"use client";

import { useCallback, useEffect, useState } from "react";
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

interface SimulatedIncident {
  type: string;
  org_name: string;
  location: string;
}

const ORGS = [
  { id: "org_02", name: "БурСервис" },
  { id: "org_17", name: 'ТОО "Весенний Букет"' },
  { id: "org_05", name: "АзимутДриллинг" },
  { id: "org_03", name: "НефтеМонтаж" },
  { id: "org_01", name: "КМГ-Кумколь (основное)" },
  { id: "org_04", name: "КазТехСтрой" },
  { id: "org_06", name: "СтройПодряд" },
  { id: "org_07", name: "ТрансНефть" },
  { id: "org_09", name: 'ТОО "Алтын Раушан"' },
  { id: "org_67", name: 'ТОО "Сакура KZ"' },
  { id: "org_27", name: 'ТОО "Гүл Әлемі"' },
  { id: "org_44", name: 'ТОО "Лазурная Лилия"' },
];

const TYPES = [
  "НС (несчастный случай)",
  "Микротравма",
  "Ухудшение здоровья",
  "Опасная ситуация",
  "Near-miss",
  "Авария оборудования",
  "Экологическое нарушение",
  "ДТП",
  "Пожар/Возгорание",
];

function KpiCard({ title, value, sub, accent }: { title: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border-l-4" style={{ borderColor: accent ?? "#3b82f6" }}>
      <div className="text-slate-400 text-sm mb-1">{title}</div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  return (
    <div className="bg-slate-800 rounded-lg p-4 border-l-4 flex items-start gap-3" style={{ borderColor: alert.color }}>
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

  // Simulation state
  const [simOrgId, setSimOrgId] = useState("");
  const [simType, setSimType] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [simCount, setSimCount] = useState(0);
  const [lastAdded, setLastAdded] = useState<SimulatedIncident | null>(null);

  const loadData = useCallback(() => {
    Promise.all([
      fetch(`${API}/api/kpi/`).then((r) => r.json()),
      fetch(`${API}/api/incidents/stats`).then((r) => r.json()),
      fetch(`${API}/api/korgau/alerts`).then((r) => r.json()),
    ]).then(([kpiData, statsData, alertsData]) => {
      setKpi(kpiData.summary);
      setStats(statsData);
      setAlerts(alertsData.alerts ?? []);
    });
  }, []);

  useEffect(() => {
    loadData();
    fetch(`${API}/api/simulate/status`).then((r) => r.json()).then((d) => setSimCount(d.total_simulated));
  }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener("hse-dataset-changed", handler);
    return () => window.removeEventListener("hse-dataset-changed", handler);
  }, [loadData]);

  const handleSimulate = async () => {
    setSimulating(true);
    const params = new URLSearchParams();
    if (simOrgId) params.set("org_id", simOrgId);
    if (simType) params.set("incident_type", simType);
    try {
      const res = await fetch(`${API}/api/simulate/incident?${params}`, { method: "POST" });
      const data = await res.json();
      setSimCount(data.total_simulated);
      setLastAdded(data.added);
      loadData();
    } finally {
      setSimulating(false);
    }
  };

  const handleReset = async () => {
    await fetch(`${API}/api/simulate/reset`, { method: "POST" });
    setSimCount(0);
    setLastAdded(null);
    loadData();
  };

  const formatTenge = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(0)} млн ₸` : `${n.toLocaleString()} ₸`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Обзор</h1>
        <p className="text-slate-400 text-sm mt-1">Сводная аналитика HSE-системы КМГ-Кумколь</p>
      </div>

      {/* Live Demo Simulation */}
      <div className="bg-slate-800 rounded-xl p-5 border border-orange-500/30">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          <h2 className="text-slate-200 font-semibold text-sm">Live Demo — симуляция инцидента</h2>
          {simCount > 0 && (
            <span className="ml-auto text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">
              +{simCount} симулировано
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Организация</label>
            <select
              value={simOrgId}
              onChange={(e) => setSimOrgId(e.target.value)}
              className="bg-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-orange-500"
            >
              <option value="">Случайная</option>
              {ORGS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Тип инцидента</label>
            <select
              value={simType}
              onChange={(e) => setSimType(e.target.value)}
              className="bg-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-orange-500"
            >
              <option value="">Случайный</option>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm px-5 py-2 rounded-lg transition-colors font-medium"
          >
            {simulating ? "Добавление..." : "⚡ Симулировать"}
          </button>
          {simCount > 0 && (
            <button
              onClick={handleReset}
              className="text-slate-400 hover:text-slate-200 text-sm px-4 py-2 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
            >
              Сбросить данные
            </button>
          )}
        </div>

        {lastAdded && (
          <div className="mt-3 flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg px-4 py-3">
            <span className="text-orange-400 text-sm">✓</span>
            <div className="text-sm">
              <span className="text-orange-300 font-medium">{lastAdded.type}</span>
              <span className="text-slate-400"> · {lastAdded.org_name} · {lastAdded.location}</span>
            </div>
          </div>
        )}
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
          sub="по предиктивной модели"
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
