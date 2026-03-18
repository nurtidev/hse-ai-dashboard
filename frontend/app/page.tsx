"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ChevronDown = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>;
const ChevronUp = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>;
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL;

interface KpiSummary {
  total_prevented_incidents_per_year: number;
  total_prevented_per_month: number;
  prevented_serious_incidents: number;
  prevented_serious_per_month: number;
  total_saved_tenge_per_year: number;
  roi_months: number;
  predicted_incidents_next_year: number;
}

interface EvidenceItem {
  date: string;
  category: string;
  resolved: boolean;
}

interface Alert {
  level: string;
  label: string;
  color: string;
  org_name: string;
  message: string;
  count: number;
  unresolved_count: number | null;
  evidence: EvidenceItem[];
  recommended_action: string;
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
  const [expanded, setExpanded] = useState(false);
  const hasDetails = alert.evidence?.length > 0 || alert.recommended_action;

  return (
    <div className="bg-slate-800 rounded-lg border-l-4 overflow-hidden" style={{ borderColor: alert.color }}>
      <div
        className="flex items-start gap-3 p-4 cursor-pointer select-none"
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <div className="text-xs font-bold px-2 py-1 rounded text-white mt-0.5 shrink-0" style={{ backgroundColor: alert.color }}>
          {alert.label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-200">{alert.org_name}</div>
          <div className="text-xs text-slate-400 mt-0.5">{alert.message}</div>
          {alert.unresolved_count !== null && alert.unresolved_count > 0 && (
            <div className="text-xs mt-1" style={{ color: alert.color }}>
              Не устранено: {alert.unresolved_count} из {alert.count}
            </div>
          )}
        </div>
        {hasDetails && (
          <div className="text-slate-500 shrink-0 mt-0.5">
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </div>
        )}
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-3">
          {alert.evidence?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Наблюдения-триггеры</div>
              <div className="space-y-1.5">
                {alert.evidence.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500 font-mono w-20 shrink-0">{e.date}</span>
                    <span className="text-slate-300 flex-1">{e.category}</span>
                    <span className={e.resolved ? "text-green-400" : "text-red-400"}>
                      {e.resolved ? "✓ Устранено" : "✗ Не устранено"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {alert.recommended_action && (
            <div className="flex items-start gap-2 bg-slate-700/50 rounded-lg px-3 py-2">
              <span className="text-blue-400 text-sm shrink-0">→</span>
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-0.5">Рекомендуемое действие</div>
                <div className="text-xs text-slate-200">{alert.recommended_action}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OverviewPage() {
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [stats, setStats] = useState<{ total: number; monthly_series: MonthlyStat[] } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsFlash, setAlertsFlash] = useState(false);
  const alertsRef = useRef<HTMLDivElement>(null);

  // Simulation state
  const [simOrgId, setSimOrgId] = useState("");
  const [simType, setSimType] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [simCount, setSimCount] = useState(0);
  const [lastAdded, setLastAdded] = useState<SimulatedIncident | null>(null);

  // Briefing state
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingText, setBriefingText] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerateBriefing = async () => {
    setBriefingLoading(true);
    setBriefingText("");
    try {
      const res = await fetch(`${API}/api/briefing/generate`, { method: "POST" });
      const data = await res.json();
      setBriefingText(data.briefing ?? "Ошибка генерации");
    } catch {
      setBriefingText("Ошибка соединения с сервером");
    } finally {
      setBriefingLoading(false);
    }
  };

  // Auto-generate when modal opens
  const handleOpenBriefing = () => {
    setBriefingOpen(true);
    if (!briefingText) handleGenerateBriefing();
  };

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
      await loadData();
      // Скролл к алертам + вспышка
      setTimeout(() => {
        alertsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setAlertsFlash(true);
        setTimeout(() => setAlertsFlash(false), 1500);
      }, 400);
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Обзор</h1>
          <p className="text-slate-400 text-sm mt-1">Сводная аналитика HSE-системы КМГ-Кумколь</p>
        </div>
        <button
          onClick={handleOpenBriefing}
          className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors font-medium"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Брифинг директору
        </button>
      </div>

      {/* Модальное окно брифинга */}
      {briefingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setBriefingOpen(false)}>
          <div className="bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <h2 className="text-slate-100 font-semibold">Еженедельный брифинг</h2>
                <p className="text-xs text-slate-400 mt-0.5">Генерируется AI на основе актуальных данных</p>
              </div>
              <button onClick={() => setBriefingOpen(false)} className="text-slate-400 hover:text-slate-200">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {briefingLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <div className="text-slate-400 text-sm">Claude составляет брифинг...</div>
                </div>
              ) : briefingText ? (
                <pre className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-sans">{briefingText}</pre>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="text-slate-400 text-sm">Нажмите кнопку чтобы сгенерировать брифинг</div>
                  <button
                    onClick={handleGenerateBriefing}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-5 py-2 rounded-lg transition-colors"
                  >
                    Сгенерировать
                  </button>
                </div>
              )}
            </div>
            {briefingText && (
              <div className="px-6 py-4 border-t border-slate-700 flex items-center gap-3">
                <button
                  onClick={() => { navigator.clipboard.writeText(briefingText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  {copied ? "Скопировано!" : "Копировать"}
                </button>
                <button
                  onClick={handleGenerateBriefing}
                  className="text-slate-400 hover:text-slate-200 text-sm px-4 py-2 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
                >
                  Обновить
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
          <div className="mt-3 bg-orange-500/10 border border-orange-500/30 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
              <span className="text-orange-400 text-xs font-semibold uppercase tracking-wider">Новый инцидент зарегистрирован</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-orange-300 font-semibold text-sm">{lastAdded.type}</span>
              <span className="text-slate-400 text-sm">·</span>
              <span className="text-slate-300 text-sm">{lastAdded.org_name}</span>
              <span className="text-slate-400 text-sm">·</span>
              <span className="text-slate-400 text-sm">{lastAdded.location}</span>
            </div>
            <div className="text-xs text-orange-400/60 mt-1">↓ Алерты обновлены автоматически</div>
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
          title="Предотвращаемых травм в месяц"
          value={kpi ? `↓ ${kpi.prevented_serious_per_month} НС` : "—"}
          sub={kpi ? `${kpi.total_prevented_per_month} инц/мес · ${kpi.total_prevented_incidents_per_year} в год` : "после внедрения AI"}
          accent="#22c55e"
        />
        <KpiCard
          title="Экономия в год"
          value={kpi ? formatTenge(kpi.total_saved_tenge_per_year) : "—"}
          sub={kpi ? `Окупаемость: ${kpi.roi_months} мес.` : ""}
          accent="#f59e0b"
        />
      </div>

      {/* Ключевой инсайт */}
      <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/20 border border-amber-700/40 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="text-2xl mt-0.5">🔍</div>
          <div className="flex-1">
            <div className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">
              Ключевой инсайт — доказано на реальных данных
            </div>
            <div className="text-slate-100 font-semibold text-sm leading-relaxed">
              Рост нарушений Коргау в{" "}
              <span className="text-amber-300">феврале–марте 2025</span>{" "}
              предшествовал пику инцидентов в{" "}
              <span className="text-red-400">июне–июле 2025</span>{" "}
              <span className="text-slate-400">(+21 инцидент)</span>
            </div>
            <div className="flex items-center gap-6 mt-2">
              <div className="text-xs text-slate-400">
                Коргау — <span className="text-amber-400 font-medium">leading indicator</span>
              </div>
              <div className="text-xs text-slate-400">
                Инциденты — <span className="text-red-400 font-medium">lagging indicator</span>
              </div>
              <div className="text-xs text-slate-400">
                Опережение: <span className="text-slate-200 font-medium">~4 месяца</span>
              </div>
              <div className="text-xs text-slate-400">
                Корреляция: <span className="text-slate-200 font-medium">0.41</span>
              </div>
            </div>
          </div>
        </div>
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
      <div
        ref={alertsRef}
        className={`rounded-xl p-5 transition-all duration-700 ${
          alertsFlash
            ? "bg-orange-500/10 border border-orange-500/40 shadow-lg shadow-orange-500/10"
            : "bg-slate-800"
        }`}
      >
        <h2 className="text-slate-200 font-semibold mb-4">
          Активные алерты{" "}
          <span className="text-sm font-normal text-slate-400">({alerts.length})</span>
          {alertsFlash && (
            <span className="ml-2 text-xs text-orange-400 animate-pulse">● обновлено</span>
          )}
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
