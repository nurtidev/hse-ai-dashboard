from __future__ import annotations

from datetime import timedelta

import pandas as pd
from fastapi import APIRouter, Query, HTTPException

from ml.alerts import get_alerts
from ml.risk_scorer import org_ratings, correlation_analysis, SEVERITY_WEIGHTS
import data_loader

router = APIRouter(prefix="/api/korgau", tags=["korgau"])


def _load() -> pd.DataFrame:
    return data_loader.load_korgau()


@router.get("/alerts")
def alerts():
    return {"alerts": get_alerts()}


@router.get("/ratings")
def ratings():
    return {"ratings": org_ratings()}


@router.get("/correlation")
def correlation():
    return correlation_analysis()


@router.get("/passport/{org_id}")
def org_passport(org_id: str):
    """Организационный паспорт риска: сводка для инспектора HSE."""
    inc_df = data_loader.load_incidents(with_simulated=False)
    korgau_df = data_loader.load_korgau()

    org_inc = inc_df[inc_df["org_id"] == org_id]
    if org_inc.empty:
        raise HTTPException(status_code=404, detail="Организация не найдена")

    org_name = org_inc["org_name"].iloc[0]
    ref_date = inc_df["date"].max()

    # Тренд за 3 месяца
    m3_start = ref_date - timedelta(days=90)
    m6_start = ref_date - timedelta(days=180)
    inc_last3 = org_inc[org_inc["date"] >= m3_start]
    inc_prev3 = org_inc[(org_inc["date"] >= m6_start) & (org_inc["date"] < m3_start)]
    trend_pct = (
        round((len(inc_last3) - len(inc_prev3)) / len(inc_prev3) * 100)
        if len(inc_prev3) > 0 else None
    )

    # Прогноз: линейная экстраполяция на следующие 30 дней
    monthly = (
        org_inc.resample("MS", on="date").size().reset_index(name="count")
    )
    forecast_30d = round(monthly["count"].tail(3).mean()) if len(monthly) >= 3 else None

    # Топ-3 нарушения по Коргау
    org_viol = korgau_df[
        (korgau_df["org_id"] == org_id) & (korgau_df["obs_type"] == "Нарушение")
    ]
    top_violations = org_viol["category"].value_counts().head(3).to_dict()

    # Неустранённые нарушения за последние 30 дней
    recent_viol = org_viol[org_viol["date"] >= ref_date - timedelta(days=30)]
    unresolved_recent = int(
        (recent_viol["resolved"].isin([False, "Не устранено", 0, "0"])).sum()
    )

    # Индекс риска этой организации
    ratings = org_ratings()
    org_rating = next((r for r in ratings if r["org_id"] == org_id), None)
    risk_index = org_rating["risk_index"] if org_rating else None
    risk_level = org_rating["risk_level"] if org_rating else "—"

    # Рекомендации (2 конкретных действия)
    recommendations = []
    if unresolved_recent > 0:
        recommendations.append(f"Устранить {unresolved_recent} нарушений, зафиксированных за последние 30 дней")
    if top_violations:
        top_cat = list(top_violations.keys())[0]
        recommendations.append(f"Провести целевой инструктаж по теме «{top_cat}» — наиболее частое нарушение")
    if not recommendations:
        recommendations.append("Поддерживать текущий уровень соблюдения HSE-требований")

    return {
        "org_id": org_id,
        "org_name": org_name,
        "risk_index": risk_index,
        "risk_level": str(risk_level),
        "total_incidents": len(org_inc),
        "incidents_last_3m": len(inc_last3),
        "trend_pct": trend_pct,
        "forecast_next_30d": forecast_30d,
        "total_violations": len(org_viol),
        "unresolved_recent": unresolved_recent,
        "top_violations": top_violations,
        "recommendations": recommendations,
    }


@router.get("/stats")
def stats(
    date_from: str = Query(None),
    date_to: str = Query(None),
    org_id: str = Query(None),
):
    df = _load()

    if date_from:
        df = df[df["date"] >= pd.to_datetime(date_from)]
    if date_to:
        df = df[df["date"] <= pd.to_datetime(date_to)]
    if org_id:
        df = df[df["org_id"] == org_id]

    violations = df[df["obs_type"] == "Нарушение"]
    good = df[df["obs_type"] == "Хорошая практика"]
    proposals = df[df["obs_type"] == "Предложение"]

    # Разбиваем многокатегорийные строки (реальные данные) и берём топ-10
    split_cats = (
        violations["category"]
        .dropna()
        .str.split(",")
        .explode()
        .str.strip()
        .loc[lambda s: s != ""]
    )
    by_category = split_cats.value_counts().head(10).to_dict()
    by_org = violations["org_name"].value_counts().head(7).to_dict()

    resolution = violations["resolved"].value_counts().to_dict()

    monthly = (
        violations.resample("MS", on="date")
        .size()
        .reset_index(name="count")
    )
    monthly_series = [
        {"month": r["date"].strftime("%Y-%m"), "count": r["count"]}
        for _, r in monthly.iterrows()
    ]

    return {
        "total_observations": len(df),
        "total_violations": len(violations),
        "total_good_practices": len(good),
        "total_proposals": len(proposals),
        "by_category": by_category,
        "by_org": by_org,
        "resolution_status": resolution,
        "monthly_series": monthly_series,
    }
