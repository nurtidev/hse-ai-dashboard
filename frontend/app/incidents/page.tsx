"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL;

interface Stats {
  total: number;
  by_type: Record<string, number>;
  by_org: Record<string, number>;
  monthly_series: { month: string; count: number }[];
}

interface ForecastPoint {
  date: string;
  actual: number | null;
  predicted: number;
  lower: number;
  upper: number;
  is_forecast: boolean;
}

interface ModelMetrics {
  mae: number;
  rmse: number;
  r2: number;
  backtest_months: number;
  method: string;
}

interface RiskZone {
  org_name: string;
  location: string;
  incident_count: number;
  severity_score: number;
  risk_index: number;
}

interface ClassifyResult {
  type: string;
  confidence: string;
  severity: string;
  clusters: string[];
  cause_category: string;
  recommendation: string;
}

export default function IncidentsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [risks, setRisks] = useState<RiskZone[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<{ org_id: string; org_name: string }[]>([]);

  const [classifyText, setClassifyText] = useState("");
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const [classifyLoading, setClassifyLoading] = useState(false);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [orgId, setOrgId] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [horizon, setHorizon] = useState<3 | 6 | 12>(12);

  const runClassify = async () => {
    if (!classifyText.trim()) return;
    setClassifyLoading(true);
    setClassifyResult(null);
    try {
      const res = await fetch(`${API}/api/incidents/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: classifyText }),
      });
      const data = await res.json();
      setClassifyResult(data);
    } finally {
      setClassifyLoading(false);
    }
  };

  const loadStats = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (orgId) params.set("org_id", orgId);
    if (incidentType) params.set("incident_type", incidentType);
    fetch(`${API}/api/incidents/stats?${params}`).then((r) => r.json()).then(setStats);
  };

  const reloadAll = () => {
    fetch(`${API}/api/incidents/types`).then((r) => r.json()).then((d) => setTypes(d.types));
    fetch(`${API}/api/incidents/organizations`).then((r) => r.json()).then((d) => setOrgs(d.organizations));
    fetch(`${API}/api/incidents/top-risks`).then((r) => r.json()).then((d) => setRisks(d.zones));
    loadStats();
    const params = new URLSearchParams({ horizon: String(horizon) });
    if (incidentType) params.set("incident_type", incidentType);
    fetch(`${API}/api/incidents/predict?${params}`).then((r) => r.json()).then((d) => {
      setForecast(d.series ?? []);
      setMetrics(d.model_metrics ?? null);
    });
  };

  useEffect(() => {
    reloadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ horizon: String(horizon) });
    if (incidentType) params.set("incident_type", incidentType);
    fetch(`${API}/api/incidents/predict?${params}`).then((r) => r.json()).then((d) => {
      setForecast(d.series ?? []);
      setMetrics(d.model_metrics ?? null);
    });
  }, [horizon, incidentType]);

  useEffect(() => {
    const handler = () => reloadAll();
    window.addEventListener("hse-dataset-changed", handler);
    return () => window.removeEventListener("hse-dataset-changed", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, incidentType]);

  const byTypeData = stats
    ? Object.entries(stats.by_type).map(([name, value]) => ({ name, value }))
    : [];

  const mergedForecast = forecast.map((p) => ({
    month: p.date,
    actual: p.actual,
    predicted: p.is_forecast ? p.predicted : null,
    lower: p.is_forecast ? p.lower : null,
    upper: p.is_forecast ? p.upper : null,
    historical: !p.is_forecast ? p.predicted : null,
  }));

  const historyEnd = forecast.find((p) => p.is_forecast)?.date;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Аналитика происшествий</h1>
        <p className="text-slate-400 text-sm mt-1">Статистика, паттерны и прогноз инцидентов</p>
      </div>

      {/* Фильтры */}
      <div className="bg-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-slate-400 block mb-1">С</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">По</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Организация</label>
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="bg-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">Все</option>
            {orgs.map((o) => (
              <option key={o.org_id} value={o.org_id}>{o.org_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Тип инцидента</label>
          <select
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
            className="bg-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">Все</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button
          onClick={loadStats}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-5 py-2 rounded-lg transition-colors"
        >
          Применить
        </button>
      </div>

      {/* Инциденты по типам */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-slate-200 font-semibold mb-4">
            По типам <span className="text-slate-400 font-normal text-sm">(всего: {stats?.total ?? "—"})</span>
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byTypeData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={140} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} itemStyle={{ color: "#3b82f6" }} />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Кол-во" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-slate-200 font-semibold mb-4">По организациям</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={stats ? Object.entries(stats.by_org).map(([name, value]) => ({ name, value })) : []}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={140} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} itemStyle={{ color: "#f97316" }} />
              <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} name="Кол-во" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Прогноз */}
      <div className="bg-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-slate-200 font-semibold">Прогноз инцидентов</h2>
          <div className="flex gap-2">
            {([3, 6, 12] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`text-sm px-3 py-1 rounded-lg transition-colors ${
                  horizon === h ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:text-slate-100"
                }`}
              >
                {h} мес.
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={mergedForecast}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} interval={2} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
            {historyEnd && <ReferenceLine x={historyEnd} stroke="#475569" strokeDasharray="4 4" label={{ value: "прогноз →", fill: "#64748b", fontSize: 11 }} />}
            <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
            <Line type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={2} dot={false} name="Факт" connectNulls={false} />
            <Line type="monotone" dataKey="historical" stroke="#3b82f6" strokeWidth={2} dot={false} name="Модель (история)" strokeOpacity={0.5} connectNulls={false} />
            <Line type="monotone" dataKey="predicted" stroke="#a855f7" strokeWidth={2} dot={false} strokeDasharray="5 3" name="Прогноз" connectNulls={false} />
            <Line type="monotone" dataKey="upper" stroke="#a855f7" strokeWidth={1} dot={false} strokeDasharray="2 4" strokeOpacity={0.4} name="Верхняя граница" connectNulls={false} />
            <Line type="monotone" dataKey="lower" stroke="#a855f7" strokeWidth={1} dot={false} strokeDasharray="2 4" strokeOpacity={0.4} name="Нижняя граница" connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Метрики модели */}
      {metrics && (
        <div className="bg-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-slate-200 font-semibold">Точность предиктивной модели</h2>
            <span className="text-xs text-slate-500 bg-slate-700 px-2 py-1 rounded">
              Backtesting · последние {metrics.backtest_months} мес.
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">MAE</div>
              <div className="text-2xl font-bold text-blue-400">{metrics.mae}</div>
              <div className="text-xs text-slate-500 mt-1">средняя абс. ошибка</div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">RMSE</div>
              <div className="text-2xl font-bold text-purple-400">{metrics.rmse}</div>
              <div className="text-xs text-slate-500 mt-1">среднекв. ошибка</div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">R²</div>
              <div className={`text-2xl font-bold ${metrics.r2 >= 0.7 ? "text-green-400" : metrics.r2 >= 0.4 ? "text-yellow-400" : "text-red-400"}`}>
                {metrics.r2}
              </div>
              <div className="text-xs text-slate-500 mt-1">коэф. детерминации</div>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Метод: {metrics.method} · Доверительный интервал: 80%
          </div>
        </div>
      )}

      {/* NLP: AI-классификатор описания инцидента */}
      <div className="bg-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-slate-200 font-semibold">AI-анализ текста инцидента</h2>
          <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">NLP · F-01</span>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Вставьте произвольное описание инцидента — Claude автоматически определит тип, тяжесть, тематику и предложит меру контроля.
        </p>
        <textarea
          value={classifyText}
          onChange={(e) => setClassifyText(e.target.value)}
          placeholder="Например: Работник упал с лестницы при монтаже трубопровода на высоте 4 метров. Средства защиты от падения отсутствовали."
          rows={3}
          className="w-full bg-slate-700 text-slate-100 text-sm rounded-lg px-4 py-3 border border-slate-600 focus:outline-none focus:border-blue-500 resize-none mb-3"
        />
        <button
          onClick={runClassify}
          disabled={classifyLoading || !classifyText.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm px-5 py-2 rounded-lg transition-colors"
        >
          {classifyLoading ? "Анализирую..." : "Классифицировать"}
        </button>

        {classifyResult && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Тип инцидента</div>
              <div className="text-slate-100 font-semibold">{classifyResult.type}</div>
              <div className="flex gap-2 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  classifyResult.severity === "критический" ? "bg-red-500/20 text-red-400" :
                  classifyResult.severity === "высокий" ? "bg-orange-500/20 text-orange-400" :
                  classifyResult.severity === "средний" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-green-500/20 text-green-400"
                }`}>
                  {classifyResult.severity}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-600 text-slate-300">
                  уверенность: {classifyResult.confidence}
                </span>
              </div>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-2">Тематические кластеры</div>
              <div className="flex flex-wrap gap-1">
                {classifyResult.clusters.map((c) => (
                  <span key={c} className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                    {c}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Корневая причина</div>
              <div className="text-slate-200 text-sm">{classifyResult.cause_category}</div>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Рекомендованная мера</div>
              <div className="text-slate-200 text-sm">{classifyResult.recommendation}</div>
            </div>
          </div>
        )}
      </div>

      {/* Топ зон риска */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-slate-200 font-semibold mb-4">Топ-5 зон риска</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-700">
                <th className="pb-3 pr-4">#</th>
                <th className="pb-3 pr-4">Организация</th>
                <th className="pb-3 pr-4">Локация</th>
                <th className="pb-3 pr-4">Инцидентов</th>
                <th className="pb-3">Индекс риска</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((z, i) => (
                <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-3 pr-4 text-slate-500">{i + 1}</td>
                  <td className="py-3 pr-4 text-slate-200">{z.org_name}</td>
                  <td className="py-3 pr-4 text-slate-300">{z.location}</td>
                  <td className="py-3 pr-4 text-slate-300">{z.incident_count}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-700 rounded-full h-2 max-w-24">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${z.risk_index}%`,
                            backgroundColor: z.risk_index > 70 ? "#ef4444" : z.risk_index > 40 ? "#f97316" : "#eab308",
                          }}
                        />
                      </div>
                      <span className="text-slate-300 font-mono">{z.risk_index}</span>
                    </div>
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
