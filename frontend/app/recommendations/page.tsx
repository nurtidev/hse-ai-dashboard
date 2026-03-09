"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

interface Recommendation {
  priority: "Высокий" | "Средний" | "Низкий";
  title: string;
  description: string;
  target: string;
  expected_effect: string;
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  Высокий: { bg: "#ef444422", text: "#ef4444" },
  Средний: { bg: "#f9731622", text: "#f97316" },
  Низкий: { bg: "#22c55e22", text: "#22c55e" },
};

export default function RecommendationsPage() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState("");

  const load = (refresh = false) => {
    setLoading(true);
    setError("");
    fetch(`${API}/api/recommendations/${refresh ? "?refresh=true" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setRecs(d.recommendations ?? []);
        setCached(d.cached ?? false);
        setLoading(false);
      })
      .catch(() => {
        setError("Ошибка загрузки. Проверьте ANTHROPIC_API_KEY в backend/.env");
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI-рекомендации</h1>
          <p className="text-slate-400 text-sm mt-1">
            Сгенерировано на основе паттернов за последние 6 месяцев
            {cached && <span className="ml-2 text-xs text-slate-500">(из кэша)</span>}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition-colors"
        >
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {loading && !error && (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-1/4 mb-3" />
              <div className="h-5 bg-slate-700 rounded w-2/3 mb-3" />
              <div className="h-3 bg-slate-700 rounded w-full mb-2" />
              <div className="h-3 bg-slate-700 rounded w-4/5" />
            </div>
          ))}
        </div>
      )}

      {!loading && recs.length > 0 && (
        <div className="space-y-4">
          {recs.map((rec, i) => {
            const style = PRIORITY_STYLES[rec.priority] ?? { bg: "#94a3b822", text: "#94a3b8" };
            return (
              <div key={i} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ backgroundColor: style.bg, color: style.text }}>
                    {rec.priority} приоритет
                  </span>
                  <span className="text-slate-500 text-xs">#{i + 1}</span>
                </div>
                <h3 className="text-slate-100 font-semibold text-base mb-2">{rec.title}</h3>
                <p className="text-slate-300 text-sm leading-relaxed mb-4">{rec.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">Целевая аудитория</div>
                    <div className="text-sm text-slate-300">{rec.target}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">Ожидаемый эффект</div>
                    <div className="text-sm text-slate-300">{rec.expected_effect}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
