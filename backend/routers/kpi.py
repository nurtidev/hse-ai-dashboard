"""
Расчёт KPI: экономический эффект от внедрения AI-модуля.
"""
from __future__ import annotations

import pandas as pd
from fastapi import APIRouter

from ml.predictor import predict
import data_loader

router = APIRouter(prefix="/api/kpi", tags=["kpi"])

# Стоимость инцидентов (тенге) — типовые отраслевые данные Казахстана
COST_PER_INCIDENT = {
    "НС (несчастный случай)": 5_000_000,
    "Авария оборудования": 3_000_000,
    "Пожар/Возгорание": 3_000_000,
    "ДТП": 2_500_000,
    "Экологическое нарушение": 2_000_000,
    "Опасная ситуация": 500_000,
    "Near-miss": 300_000,
    "Микротравма": 200_000,
    "Ухудшение здоровья": 200_000,
}

# Ожидаемое снижение после внедрения AI (из ТЗ)
REDUCTION_RATES = {
    "НС (несчастный случай)": 0.38,
    "Микротравма": 0.40,
    "Ухудшение здоровья": 0.40,
    "Опасная ситуация": 0.50,
    "Near-miss": 0.45,
    "Авария оборудования": 0.30,
    "Пожар/Возгорание": 0.30,
    "ДТП": 0.35,
    "Экологическое нарушение": 0.35,
}


@router.get("/")
def get_kpi():
    df = data_loader.load_incidents(with_simulated=False)

    # Среднегодовые показатели (по последним 3 годам)
    df["year"] = df["date"].dt.year
    yearly = df.groupby(["year", "type"]).size().reset_index(name="count")
    avg_by_type = yearly.groupby("type")["count"].mean().to_dict()

    safety_kpi = []
    total_saved_tenge = 0
    total_prevented_incidents = 0

    for inc_type, avg_count in avg_by_type.items():
        reduction = REDUCTION_RATES.get(inc_type, 0.30)
        cost = COST_PER_INCIDENT.get(inc_type, 300_000)
        prevented = avg_count * reduction
        saved = prevented * cost

        # Косвенные потери — до 200% от прямых (ТЗ)
        total_cost_saved = saved * 2.0

        safety_kpi.append({
            "type": inc_type,
            "avg_per_year": round(avg_count, 1),
            "predicted_after_ai": round(avg_count * (1 - reduction), 1),
            "prevented_per_year": round(prevented, 1),
            "reduction_pct": round(reduction * 100),
            "direct_savings_tenge": round(total_cost_saved),
        })
        total_saved_tenge += total_cost_saved
        total_prevented_incidents += prevented

    # Прогноз на следующий год
    forecast = predict(horizon_months=12)
    predicted_next_year = forecast["summary"]["total_predicted"]

    return {
        "by_type": safety_kpi,
        "summary": {
            "total_prevented_incidents_per_year": round(total_prevented_incidents, 1),
            "total_saved_tenge_per_year": round(total_saved_tenge),
            "total_saved_usd_per_year": round(total_saved_tenge / 480),  # ~480 тенге/$
            "response_time_reduction_pct": 83,  # из ТЗ
            "predicted_incidents_next_year": round(predicted_next_year, 1),
            "roi_months": round(1_000_000 / (total_saved_tenge / 12), 1),  # окупаемость
        },
    }
