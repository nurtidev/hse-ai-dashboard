"""
Risk Scoring — расчёт индекса риска для каждой организации и локации.
Учитывает: частоту инцидентов, тяжесть, динамику, нарушения из Карты Коргау.
"""
from __future__ import annotations

import pandas as pd
import numpy as np
import data_loader

# Веса тяжести по типу инцидента
SEVERITY_WEIGHTS = {
    "НС (несчастный случай)": 10,
    "Авария оборудования": 7,
    "Пожар/Возгорание": 7,
    "ДТП": 6,
    "Экологическое нарушение": 6,
    "Опасная ситуация": 4,
    "Near-miss": 3,
    "Микротравма": 2,
    "Ухудшение здоровья": 2,
}


def _load() -> tuple[pd.DataFrame, pd.DataFrame]:
    return data_loader.load_incidents(), data_loader.load_korgau()


def top_risk_zones(n: int = 5) -> list[dict]:
    """Топ-N зон риска (организация + локация)."""
    inc, korgau = _load()

    # Последний год
    cutoff = inc["date"].max() - pd.DateOffset(years=1)
    recent = inc[inc["date"] >= cutoff].copy()

    recent["severity"] = recent["type"].map(SEVERITY_WEIGHTS).fillna(1)
    scores = (
        recent.groupby(["org_name", "location"])
        .agg(
            incident_count=("id", "count"),
            severity_score=("severity", "sum"),
        )
        .reset_index()
    )
    scores["risk_index"] = (
        scores["severity_score"] / scores["severity_score"].max() * 100
    ).round(1)
    scores = scores.sort_values("risk_index", ascending=False).head(n)

    return scores.to_dict(orient="records")


def org_ratings() -> list[dict]:
    """Рейтинг организаций по уровню безопасности (0–100, выше = хуже)."""
    inc, korgau = _load()

    # Метрики инцидентов
    inc["severity"] = inc["type"].map(SEVERITY_WEIGHTS).fillna(1)
    inc_score = (
        inc.groupby("org_id")
        .agg(
            org_name=("org_name", "first"),
            total_incidents=("id", "count"),
            severity_sum=("severity", "sum"),
        )
        .reset_index()
    )

    # Метрики нарушений
    violations = korgau[korgau["obs_type"] == "Нарушение"]
    viol_score = (
        violations.groupby("org_id")
        .agg(total_violations=("id", "count"))
        .reset_index()
    )

    merged = inc_score.merge(viol_score, on="org_id", how="left").fillna(0)

    # Нормализованный индекс риска
    for col in ["severity_sum", "total_violations"]:
        max_val = merged[col].max()
        merged[f"{col}_norm"] = merged[col] / max_val if max_val > 0 else 0

    merged["risk_index"] = (
        0.6 * merged["severity_sum_norm"] + 0.4 * merged["total_violations_norm"]
    ) * 100

    merged["risk_level"] = pd.cut(
        merged["risk_index"],
        bins=[0, 25, 50, 75, 100],
        labels=["Низкий", "Средний", "Высокий", "Критический"],
        include_lowest=True,
    )

    result = merged[[
        "org_id", "org_name", "total_incidents",
        "total_violations", "risk_index", "risk_level",
    ]].sort_values("risk_index", ascending=False)

    result["risk_index"] = result["risk_index"].round(1)
    # Фильтруем мусорные записи (org_name пустой или нечисловой короткий)
    result = result[result["org_name"].astype(str).str.len() >= 2]
    return result.to_dict(orient="records")


def correlation_analysis() -> dict:
    """
    Корреляция: нарушения в Карте Коргау → инциденты через 1–4 недели.
    """
    inc, korgau = _load()

    violations = korgau[korgau["obs_type"] == "Нарушение"].copy()
    violations["week"] = violations["date"].dt.to_period("W")
    inc["week"] = inc["date"].dt.to_period("W")

    weekly_viol = violations.groupby("week").size().reset_index(name="violations")
    weekly_inc = inc.groupby("week").size().reset_index(name="incidents")

    merged = weekly_viol.merge(weekly_inc, on="week", how="inner")
    corr = merged["violations"].corr(merged["incidents"])

    return {
        "correlation": round(float(corr), 3),
        "interpretation": (
            "Сильная связь" if abs(corr) > 0.6
            else "Умеренная связь" if abs(corr) > 0.3
            else "Слабая связь"
        ),
        "weekly_data": [
            {"week": str(r["week"]), "violations": r["violations"], "incidents": r["incidents"]}
            for _, r in merged.tail(52).iterrows()
        ],
    }
