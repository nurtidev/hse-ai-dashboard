"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const ChevronDown = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>;
const ChevronUp = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>;

interface Passport {
  org_id: string;
  org_name: string;
  risk_index: number;
  risk_level: string;
  total_incidents: number;
  incidents_last_3m: number;
  trend_pct: number | null;
  forecast_next_30d: number | null;
  total_violations: number;
  unresolved_recent: number;
  top_violations: Record<string, number>;
  recommendations: string[];
}

const API = process.env.NEXT_PUBLIC_API_URL;

interface KorgauStats {
  total_observations: number;
  total_violations: number;
  total_good_practices: number;
  total_proposals: number;
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

const RISK_COLORS: Record<string, string> = {
  Критический: "#ef4444",
  Высокий: "#f97316",
  Средний: "#eab308",
  Низкий: "#22c55e",
};

function AlertCard({ alert }: { alert: Alert }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = alert.evidence.length > 0 || alert.recommended_action;

  return (
    <div
      className="rounded-lg border-l-4 overflow-hidden"
      style={{ borderColor: alert.color, backgroundColor: `${alert.color}11` }}
    >
      <div
        className="flex items-start gap-3 p-3 cursor-pointer select-none"
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <span
          className="text-xs font-bold px-2 py-1 rounded text-white shrink-0 mt-0.5"
          style={{ backgroundColor: alert.color }}
        >
          {alert.label}
        </span>
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
        <div className="px-3 pb-3 space-y-3 border-t border-white/10 pt-3">
          {alert.evidence.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Наблюдения-триггеры
              </div>
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
            <div className="flex items-start gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
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

export default function KorgauPage() {
  const [stats, setStats] = useState<KorgauStats | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [passport, setPassport] = useState<Passport | null>(null);
  const [passportLoading, setPassportLoading] = useState(false);

  const openPassport = async (orgId: string) => {
    setPassport(null);
    setPassportLoading(true);
    const res = await fetch(`${API}/api/korgau/passport/${orgId}`);
    const data = await res.json();
    setPassport(data);
    setPassportLoading(false);
  };

  const loadAll = () => {
    Promise.all([
      fetch(`${API}/api/korgau/stats`).then((r) => r.json()),
      fetch(`${API}/api/korgau/ratings`).then((r) => r.json()),
      fetch(`${API}/api/korgau/alerts`).then((r) => r.json()),
    ]).then(([s, r, a]) => {
      setStats(s);
      setRatings(r.ratings ?? []);
      setAlerts(a.alerts ?? []);
    });
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    window.addEventListener("hse-dataset-changed", loadAll);
    return () => window.removeEventListener("hse-dataset-changed", loadAll);
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
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
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
        <div className="bg-slate-800 rounded-xl p-5 border-l-4 border-yellow-500">
          <div className="text-slate-400 text-sm">Предложений</div>
          <div className="text-2xl font-bold mt-1">{stats?.total_proposals ?? "—"}</div>
          <div className="text-xs text-slate-500 mt-1">инициативы работников</div>
        </div>
      </div>

      {/* Алерты */}
      {alerts.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-slate-200 font-semibold mb-4">
            Активные алерты <span className="text-slate-400 font-normal text-sm">({alerts.length})</span>
          </h2>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <AlertCard key={i} alert={a} />
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

      {/* Паспорт организации — модальное окно */}
      {(passport || passportLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => { setPassport(null); setPassportLoading(false); }}
        >
          <div
            className="bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {passportLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <div className="text-slate-400 text-sm">Загружаю паспорт организации...</div>
              </div>
            ) : passport ? (
              <>
                <div className="flex items-start justify-between px-6 py-5 border-b border-slate-700">
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Паспорт риска</div>
                    <h2 className="text-slate-100 font-semibold text-lg leading-tight">{passport.org_name}</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div
                        className="text-2xl font-bold"
                        style={{ color: RISK_COLORS[passport.risk_level] ?? "#94a3b8" }}
                      >
                        {passport.risk_index}
                      </div>
                      <div
                        className="text-xs font-semibold"
                        style={{ color: RISK_COLORS[passport.risk_level] ?? "#94a3b8" }}
                      >
                        {passport.risk_level}
                      </div>
                    </div>
                    <button
                      onClick={() => setPassport(null)}
                      className="text-slate-400 hover:text-slate-200 ml-2"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Метрики */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <div className="text-xs text-slate-400">Инцидентов всего</div>
                      <div className="text-xl font-bold text-slate-100 mt-0.5">{passport.total_incidents}</div>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <div className="text-xs text-slate-400">За последние 3 мес.</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xl font-bold text-slate-100">{passport.incidents_last_3m}</span>
                        {passport.trend_pct !== null && (
                          <span className={`text-xs font-semibold ${passport.trend_pct > 0 ? "text-red-400" : "text-green-400"}`}>
                            {passport.trend_pct > 0 ? "▲" : "▼"} {Math.abs(passport.trend_pct)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <div className="text-xs text-slate-400">Нарушений (всего)</div>
                      <div className="text-xl font-bold text-slate-100 mt-0.5">{passport.total_violations}</div>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <div className="text-xs text-slate-400">Не устранено (30д)</div>
                      <div className={`text-xl font-bold mt-0.5 ${passport.unresolved_recent > 0 ? "text-red-400" : "text-green-400"}`}>
                        {passport.unresolved_recent}
                      </div>
                    </div>
                  </div>

                  {/* Топ нарушения */}
                  {Object.keys(passport.top_violations).length > 0 && (
                    <div>
                      <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Топ категорий нарушений</div>
                      <div className="space-y-2">
                        {Object.entries(passport.top_violations).map(([cat, cnt], i) => (
                          <div key={i} className="flex items-center gap-3 text-sm">
                            <div className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                              <span className="text-amber-400 text-[9px] font-bold">{i + 1}</span>
                            </div>
                            <span className="text-slate-300 flex-1">{cat}</span>
                            <span className="text-amber-400 font-mono text-xs">{cnt} раз</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Рекомендации */}
                  <div>
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Рекомендуемые действия</div>
                    <div className="space-y-2">
                      {passport.recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-2">
                          <span className="text-blue-400 text-sm shrink-0 mt-0.5">→</span>
                          <span className="text-slate-200 text-xs leading-relaxed">{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Прогноз */}
                  {passport.forecast_next_30d !== null && (
                    <div className="flex items-center gap-3 bg-slate-700/40 rounded-lg px-4 py-3">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                      </svg>
                      <span className="text-xs text-slate-400">Прогноз на след. 30 дней:</span>
                      <span className="text-purple-400 font-semibold">{passport.forecast_next_30d} инц.</span>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Рейтинг организаций */}
      <div className="bg-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-slate-200 font-semibold">Рейтинг организаций по уровню риска</h2>
          <span className="text-xs text-slate-500">Нажмите на строку → паспорт организации</span>
        </div>
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
                <tr
                  key={r.org_id}
                  className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                  onClick={() => openPassport(r.org_id)}
                >
                  <td className="py-3 pr-4 text-slate-500">{i + 1}</td>
                  <td className="py-3 pr-4 text-slate-200 hover:text-blue-400 transition-colors">{r.org_name}</td>
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
