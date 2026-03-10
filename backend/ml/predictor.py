"""
Предиктивная модель на основе линейного тренда + сезонности (numpy/pandas).
Заменяет Prophet для надёжной работы на любом сервере без компиляции.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import simulation_store

DATA_PATH = Path(__file__).parent.parent / "data" / "incidents.csv"


def _load_monthly(incident_type: str | None = None) -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, parse_dates=["date"])
    extra = simulation_store.get_extra()
    if extra:
        extra_df = pd.DataFrame(extra)
        extra_df["date"] = pd.to_datetime(extra_df["date"])
        df = pd.concat([df, extra_df], ignore_index=True)
    if incident_type:
        df = df[df["type"] == incident_type]
    monthly = (
        df.resample("MS", on="date")
        .size()
        .reset_index(name="y")
    )
    return monthly


def _fit_model(monthly: pd.DataFrame) -> tuple:
    """Обучает модель (тренд + сезонность) на переданных данных."""
    n = len(monthly)
    y = monthly["y"].values.astype(float)
    t = np.arange(n)

    coeffs = np.polyfit(t, y, 1)
    trend = np.poly1d(coeffs)
    fitted = trend(t)
    residuals = y - fitted

    monthly = monthly.copy()
    monthly["month"] = monthly["date"].dt.month
    monthly["resid"] = residuals
    seasonal = monthly.groupby("month")["resid"].mean().to_dict()
    sigma = residuals.std()

    return trend, seasonal, sigma, n, residuals


def _compute_metrics(monthly: pd.DataFrame) -> dict:
    """
    Backtesting: обучаем на первых N-3 месяцах, проверяем на последних 3.
    Возвращает MAE, RMSE, R².
    """
    test_size = 3
    if len(monthly) <= test_size + 6:
        return {}

    train = monthly.iloc[:-test_size].copy()
    test = monthly.iloc[-test_size:].copy()

    trend, seasonal, sigma, n_train, _ = _fit_model(train)

    actuals = test["y"].values.astype(float)
    predictions = []
    for step, (_, row) in enumerate(test.iterrows(), start=1):
        t_future = n_train - 1 + step
        trend_val = trend(t_future)
        seas = seasonal.get(row["date"].month, 0)
        predictions.append(max(0, trend_val + seas))

    predictions = np.array(predictions)
    errors = actuals - predictions
    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors ** 2)))

    # R² на всей истории (насколько модель объясняет дисперсию)
    trend_full, seasonal_full, _, n_full, _ = _fit_model(monthly)
    all_y = monthly["y"].values.astype(float)
    fitted_full = np.array([
        max(0, trend_full(i) + seasonal_full.get(monthly.iloc[i]["date"].month, 0))
        for i in range(n_full)
    ])
    ss_res = np.sum((all_y - fitted_full) ** 2)
    ss_tot = np.sum((all_y - all_y.mean()) ** 2)
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "r2": round(r2, 3),
        "backtest_months": test_size,
        "method": "Linear trend + monthly seasonality",
    }


def predict(
    horizon_months: int = 12,
    incident_type: str | None = None,
) -> dict:
    """
    Линейный тренд + месячная сезонность + доверительный интервал (±1.28σ = 80%).
    Включает метрики точности по backtesting (MAE, RMSE, R²).
    """
    monthly = _load_monthly(incident_type)

    trend, seasonal, sigma, n, residuals = _fit_model(monthly)
    metrics = _compute_metrics(monthly)

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
        "model_metrics": metrics,
    }
