"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

interface IncidentItem {
  id: string;
  date: string;
  type: string;
  org_name: string;
  org_id: string;
  location: string;
  description_short: string;
}

interface TimelineEvent {
  date: string;
  days_before: number;
  event_type: "violation" | "incident";
  category: string;
  description: string;
  resolved: boolean;
}

interface InvestigationResult {
  incident: {
    id: string;
    date: string;
    type: string;
    org_name: string;
    location: string;
    description: string;
    cause: string;
  };
  timeline: TimelineEvent[];
  stats: {
    violations_90d: number;
    unresolved: number;
    repeat_categories: Record<string, number>;
  };
  ai_analysis: string;
}

const TYPE_COLORS: Record<string, string> = {
  "НС (несчастный случай)": "#ef4444",
  "Авария оборудования": "#f97316",
  "Пожар/Возгорание": "#f59e0b",
  "ДТП": "#eab308",
  "Экологическое нарушение": "#84cc16",
};

export default function InvestigatePage() {
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/incidents/for-investigation`)
      .then((r) => r.json())
      .then((d) => {
        setIncidents(d.incidents ?? []);
      });
  }, []);

  const handleInvestigate = async (id: string) => {
    if (!id) return;
    setSelectedId(id);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/incidents/investigate/${id}`);
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const violations = result?.timeline.filter((e) => e.event_type === "violation") ?? [];
  const incidentEvent = result?.timeline.find((e) => e.event_type === "incident");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Следователь инцидентов</h1>
        <p className="text-slate-400 text-sm mt-1">
          Ретроспективный анализ: какие сигналы предшествовали инциденту
        </p>
      </div>

      {/* Выбор инцидента */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-slate-200 font-semibold mb-3">Выберите инцидент для анализа</h2>
        <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
          {incidents.map((inc) => {
            const color = TYPE_COLORS[inc.type] ?? "#94a3b8";
            const isSelected = selectedId === inc.id;
            return (
              <button
                key={inc.id}
                onClick={() => handleInvestigate(inc.id)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  isSelected
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-slate-700 hover:border-slate-500 bg-slate-700/30 hover:bg-slate-700/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded"
                        style={{ color, backgroundColor: `${color}22` }}
                      >
                        {inc.type}
                      </span>
                      <span className="text-xs text-slate-400">{inc.date}</span>
                      <span className="text-xs text-slate-500">{inc.org_name}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 truncate">{inc.description_short}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Загрузка */}
      {loading && (
        <div className="bg-slate-800 rounded-xl p-10 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-slate-400 text-sm">AI анализирует предшествующие нарушения...</div>
        </div>
      )}

      {/* Результат */}
      {result && !loading && (
        <>
          {/* Карточка инцидента */}
          <div
            className="rounded-xl p-5 border-l-4"
            style={{
              borderColor: TYPE_COLORS[result.incident.type] ?? "#94a3b8",
              backgroundColor: `${TYPE_COLORS[result.incident.type] ?? "#94a3b8"}11`,
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="text-xs font-bold px-2 py-1 rounded text-white shrink-0"
                style={{ backgroundColor: TYPE_COLORS[result.incident.type] ?? "#94a3b8" }}
              >
                {result.incident.type}
              </div>
              <div>
                <div className="text-slate-100 font-semibold">{result.incident.org_name}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {result.incident.date} · {result.incident.location}
                </div>
                {result.incident.description && (
                  <div className="text-xs text-slate-400 mt-2 leading-relaxed max-w-2xl line-clamp-3">
                    {result.incident.description}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-amber-400">{result.stats.violations_90d}</div>
              <div className="text-xs text-slate-400 mt-1">нарушений за 90 дней до</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{result.stats.unresolved}</div>
              <div className="text-xs text-slate-400 mt-1">не были устранены</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-slate-300">
                {Object.keys(result.stats.repeat_categories).length}
              </div>
              <div className="text-xs text-slate-400 mt-1">повторяющихся категорий</div>
            </div>
          </div>

          {/* Таймлайн */}
          <div className="bg-slate-800 rounded-xl p-5">
            <h2 className="text-slate-200 font-semibold mb-5">
              Хронология за 90 дней до инцидента
            </h2>
            {violations.length === 0 ? (
              <div className="text-slate-500 text-sm">Нарушений Коргау в данной организации за этот период не найдено.</div>
            ) : (
              <div className="relative">
                {/* Вертикальная линия */}
                <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-700" />

                <div className="space-y-3">
                  {violations.map((event, i) => (
                    <div key={i} className="relative flex items-start gap-4 pl-10">
                      {/* Точка на линии */}
                      <div
                        className={`absolute left-2 top-1.5 w-3 h-3 rounded-full border-2 shrink-0 ${
                          event.resolved
                            ? "bg-green-500 border-green-400"
                            : "bg-red-500 border-red-400"
                        }`}
                      />
                      <div className="flex-1 bg-slate-700/40 rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-mono text-slate-400">{event.date}</span>
                          <span className="text-xs text-amber-300 font-medium">{event.category}</span>
                          <span className={`text-xs ml-auto ${event.resolved ? "text-green-400" : "text-red-400"}`}>
                            {event.resolved ? "✓ Устранено" : "✗ Не устранено"}
                          </span>
                        </div>
                        {event.description && (
                          <div className="text-xs text-slate-500 mt-1 truncate">{event.description}</div>
                        )}
                        <div className="text-xs text-slate-600 mt-1">
                          За {event.days_before} {event.days_before === 1 ? "день" : "дней"} до инцидента
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Сам инцидент */}
                  {incidentEvent && (
                    <div className="relative flex items-start gap-4 pl-10">
                      <div className="absolute left-1.5 top-1 w-5 h-5 rounded-full bg-red-600 border-2 border-red-400 flex items-center justify-center shrink-0">
                        <span className="text-white text-[8px] font-bold">!</span>
                      </div>
                      <div className="flex-1 bg-red-900/30 border border-red-700/40 rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-slate-400">{incidentEvent.date}</span>
                          <span className="text-xs text-red-300 font-bold">{incidentEvent.category}</span>
                          <span className="text-xs text-red-400 ml-auto font-semibold">ИНЦИДЕНТ</span>
                        </div>
                        {incidentEvent.description && (
                          <div className="text-xs text-slate-400 mt-1 line-clamp-2">{incidentEvent.description}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* AI-анализ */}
          <div className="bg-gradient-to-r from-blue-900/30 to-slate-800 border border-blue-700/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <span className="text-blue-400 text-sm font-semibold">AI-анализ паттерна</span>
            </div>
            <p className="text-slate-200 text-sm leading-relaxed">{result.ai_analysis}</p>
          </div>
        </>
      )}
    </div>
  );
}
