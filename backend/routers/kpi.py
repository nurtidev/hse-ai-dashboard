"""
Расчёт KPI: экономический эффект от внедрения AI-модуля.

Методология соответствует ТЗ:
  Итого = Прямые затраты + Косвенные потери + Штрафы + Расследования + Аудит
  Косвенные = 2× прямых (только для тяжёлых типов: НС, Авария, ДТП, Пожар)
  Фиксированные компоненты: штрафы 5M + расследования 8M + аудит 3M = 16M тг
"""
from __future__ import annotations

import pandas as pd
from fastapi import APIRouter

from ml.predictor import predict
import data_loader

router = APIRouter(prefix="/api/kpi", tags=["kpi"])

# Прямые затраты на один инцидент (тенге) — отраслевые данные Казахстана
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

# Снижение частоты после внедрения AI (из ТЗ: LTIR -38%)
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

# Косвенные потери 2× прямых — только НС (медпомощь + компенсации, по ТЗ: 35M→70M)
# Авария/ДТП/Пожар учитываются только прямыми затратами
SERIOUS_TYPES = {"НС (несчастный случай)"}

# Фиксированные годовые компоненты экономии (из ТЗ, тенге)
FINES_AVOIDED = 5_000_000         # предотвращённые штрафы регулятора
INVESTIGATION_SAVINGS = 8_000_000  # снижение затрат на расследования
AUDIT_EFFICIENCY = 3_000_000       # рост эффективности аудита (Карта Коргау)


@router.get("/")
def get_kpi():
    df = data_loader.load_incidents(with_simulated=False)

    # Среднегодовые показатели — нормируем на реальный период данных в годах
    span_years = max((df["date"].max() - df["date"].min()).days / 365.25, 1.0)
    total_by_type = df.groupby("type").size().to_dict()
    avg_by_type = {t: count / span_years for t, count in total_by_type.items()}

    safety_kpi = []
    total_direct = 0
    total_indirect = 0
    total_prevented = 0
    prevented_ns = 0.0
    prevented_microtrama = 0.0

    for inc_type, avg_count in avg_by_type.items():
        reduction = REDUCTION_RATES.get(inc_type, 0.30)
        cost = COST_PER_INCIDENT.get(inc_type, 300_000)
        prevented = avg_count * reduction
        direct_saved = prevented * cost

        # Косвенные потери — только для тяжёлых типов инцидентов (по ТЗ)
        indirect_saved = direct_saved * 2.0 if inc_type in SERIOUS_TYPES else 0.0
        type_total = direct_saved + indirect_saved

        safety_kpi.append({
            "type": inc_type,
            "avg_per_year": round(avg_count, 1),
            "predicted_after_ai": round(avg_count * (1 - reduction), 1),
            "prevented_per_year": round(prevented, 1),
            "reduction_pct": round(reduction * 100),
            "direct_savings_tenge": round(type_total),
        })

        total_direct += direct_saved
        total_indirect += indirect_saved
        total_prevented += prevented

        if inc_type == "НС (несчастный случай)":
            prevented_ns = round(prevented, 1)
        elif inc_type == "Микротравма":
            prevented_microtrama = round(prevented, 1)

    total_fixed = FINES_AVOIDED + INVESTIGATION_SAVINGS + AUDIT_EFFICIENCY
    total_saved_tenge = total_direct + total_indirect + total_fixed

    # Компонент экономии только от НС (для сравнения с методологией ТЗ)
    ns_avg = avg_by_type.get("НС (несчастный случай)", 0)
    ns_direct = ns_avg * REDUCTION_RATES["НС (несчастный случай)"] * COST_PER_INCIDENT["НС (несчастный случай)"]
    tz_comparable = round(ns_direct + ns_direct * 2.0 + total_fixed)

    # Прогноз на следующий год
    forecast = predict(horizon_months=12)
    predicted_next_year = forecast["summary"]["total_predicted"]

    return {
        "by_type": sorted(safety_kpi, key=lambda x: x["direct_savings_tenge"], reverse=True),
        "summary": {
            "total_prevented_incidents_per_year": round(total_prevented, 1),
            "prevented_serious_incidents": prevented_ns,
            "prevented_microtrama": prevented_microtrama,
            "total_saved_tenge_per_year": round(total_saved_tenge),
            "total_saved_usd_per_year": round(total_saved_tenge / 480),
            "response_time_reduction_pct": 83,
            "predicted_incidents_next_year": round(predicted_next_year, 1),
            "roi_months": round(1_000_000 / (total_saved_tenge / 12), 1),
            # Разбивка по статьям ТЗ
            # Сравнение с методологией ТЗ (только НС + фиксированные статьи)
            "tz_comparable_tenge": tz_comparable,
            "tz_baseline_tenge": 121_000_000,
            "breakdown": {
                "direct_costs_prevented": round(total_direct),
                "indirect_losses_prevented": round(total_indirect),
                "fines_avoided": FINES_AVOIDED,
                "investigation_savings": INVESTIGATION_SAVINGS,
                "audit_efficiency": AUDIT_EFFICIENCY,
            },
        },
    }
