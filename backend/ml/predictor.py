"""
Предиктивная модель на основе линейного тренда + сезонности (numpy/pandas).
Заменяет Prophet для надёжной работы на любом сервере без компиляции.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


DATA_PATH = Path(__file__).parent.parent / "data" / "incidents.csv"


def _load_monthly(incident_type: str | None = None) -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, parse_dates=["date"])
    if incident_type:
        df = df[df["type"] == incident_type]
    monthly = (
        df.resample("MS", on="date")
        .size()
        .reset_index(name="y")
    )
    return monthly


def predict(
    horizon_months: int = 12,
    incident_type: str | None = None,
) -> dict:
    """
    Линейный тренд + месячная сезонность + доверительный интервал (±1.28σ = 80%).
    """
    monthly = _load_monthly(incident_type)

    n = len(monthly)
    y = monthly["y"].values.astype(float)
    t = np.arange(n)

    # Линейный тренд
    coeffs = np.polyfit(t, y, 1)
    trend = np.poly1d(coeffs)
    fitted = trend(t)
    residuals = y - fitted

    # Месячная сезонность — среднее отклонение по каждому месяцу
    monthly["month"] = monthly["date"].dt.month
    monthly["resid"] = residuals
    seasonal = monthly.groupby("month")["resid"].mean().to_dict()

    # Стандартное отклонение остатков для CI
    sigma = residuals.std()

    # Строим итоговый ряд (история + прогноз)
    last_date = monthly["date"].max()
    result_rows = []

    # История
    for i, row in monthly.iterrows():
        result_rows.append({
            "date": row["date"].strftime("%Y-%m"),
            "actual": int(row["y"]),
            "predicted": None,
            "lower": None,
            "upper": None,
            "is_forecast": False,
        })

    # Прогноз
    for step in range(1, horizon_months + 1):
        future_date = last_date + pd.DateOffset(months=step)
        t_future = n - 1 + step
        trend_val = trend(t_future)
        seas = seasonal.get(future_date.month, 0)
        predicted = max(0, trend_val + seas)
        lower = max(0, predicted - 1.28 * sigma)
        upper = max(0, predicted + 1.28 * sigma)

        result_rows.append({
            "date": future_date.strftime("%Y-%m"),
            "actual": None,
            "predicted": round(predicted, 1),
            "lower": round(lower, 1),
            "upper": round(upper, 1),
            "is_forecast": True,
        })

    total_predicted = sum(r["predicted"] for r in result_rows if r["is_forecast"])
    total_lower = sum(r["lower"] for r in result_rows if r["is_forecast"])
    total_upper = sum(r["upper"] for r in result_rows if r["is_forecast"])

    return {
        "horizon_months": horizon_months,
        "incident_type": incident_type,
        "series": result_rows,
        "summary": {
            "total_predicted": round(total_predicted, 1),
            "total_lower": round(total_lower, 1),
            "total_upper": round(total_upper, 1),
        },
    }
