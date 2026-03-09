"""
Предиктивная модель на Prophet.
Прогноз числа инцидентов на 3, 6, 12 месяцев вперёд.
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

import pandas as pd
from prophet import Prophet


DATA_PATH = Path(__file__).parent.parent / "data" / "incidents.csv"


def _load_monthly(incident_type: str | None = None) -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, parse_dates=["date"])
    if incident_type:
        df = df[df["type"] == incident_type]
    monthly = (
        df.resample("MS", on="date")
        .size()
        .reset_index(name="y")
        .rename(columns={"date": "ds"})
    )
    return monthly


def predict(
    horizon_months: Literal[3, 6, 12] = 12,
    incident_type: str | None = None,
) -> dict:
    """
    Возвращает исторические данные + прогноз с доверительным интервалом.
    """
    monthly = _load_monthly(incident_type)

    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
        interval_width=0.80,
    )
    model.fit(monthly)

    future = model.make_future_dataframe(periods=horizon_months, freq="MS")
    forecast = model.predict(future)

    history_end = monthly["ds"].max()

    result_rows = []
    for _, row in forecast.iterrows():
        result_rows.append({
            "date": row["ds"].strftime("%Y-%m"),
            "actual": None,
            "predicted": max(0, round(row["yhat"], 1)),
            "lower": max(0, round(row["yhat_lower"], 1)),
            "upper": max(0, round(row["yhat_upper"], 1)),
            "is_forecast": row["ds"] > history_end,
        })

    # Заполняем фактические значения
    actual_map = {
        row["ds"].strftime("%Y-%m"): int(row["y"]) for _, row in monthly.iterrows()
    }
    for r in result_rows:
        if r["date"] in actual_map:
            r["actual"] = actual_map[r["date"]]

    total_forecast = sum(
        r["predicted"] for r in result_rows if r["is_forecast"]
    )
    total_lower = sum(r["lower"] for r in result_rows if r["is_forecast"])
    total_upper = sum(r["upper"] for r in result_rows if r["is_forecast"])

    return {
        "horizon_months": horizon_months,
        "incident_type": incident_type,
        "series": result_rows,
        "summary": {
            "total_predicted": round(total_forecast, 1),
            "total_lower": round(total_lower, 1),
            "total_upper": round(total_upper, 1),
        },
    }
