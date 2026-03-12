"""
Предиктивная модель: Holt-Winters (тренд + сезонность) с fallback на линейный тренд.
Holt-Winters даёт лучший R² на нестационарных рядах с сезонностью.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
import data_loader

try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    HW_AVAILABLE = True
except ImportError:
    HW_AVAILABLE = False


# ─── Загрузка данных ─────────────────────────────────────────────────────────

def _trim_trailing_incomplete(
    monthly: pd.DataFrame,
    threshold: float = 0.40,
    min_months: int = 6,
) -> pd.DataFrame:
    """
    Удаляет хвостовые месяцы с подозрительно низким числом инцидентов.
    Используем глобальную медиану текущего ряда — она устойчива к выбросам.
    Итеративно убираем последний месяц, пока он < threshold * global_median.
    Это устраняет артефакт незавершённого сбора данных за последние месяцы.
    """
    if len(monthly) < min_months + 2:
        return monthly

    while len(monthly) > min_months:
        global_median = float(monthly["y"].median())
        last_val = float(monthly.iloc[-1]["y"])
        if global_median > 0 and last_val < threshold * global_median:
            monthly = monthly.iloc[:-1].copy()
        else:
            break
    return monthly


def _load_monthly(incident_type: str | None = None) -> pd.DataFrame:
    df = data_loader.load_incidents()
    if incident_type:
        df = df[df["type"] == incident_type]
    monthly = (
        df.resample("MS", on="date")
        .size()
        .reset_index(name="y")
    )
    monthly = _trim_trailing_incomplete(monthly)
    return monthly


# ─── Holt-Winters ─────────────────────────────────────────────────────────────

def _fit_holtwinters(y: np.ndarray) -> tuple:
    """
    Holt-Winters с аддитивным трендом и аддитивной сезонностью (период 12 мес.).
    Возвращает: (модель, fitted_values, sigma).
    """
    n = len(y)
    seasonal_periods = 12 if n >= 24 else None

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if seasonal_periods:
            model = ExponentialSmoothing(
                y,
                trend="add",
                seasonal="add",
                seasonal_periods=seasonal_periods,
                initialization_method="estimated",
            ).fit(optimized=True)
        else:
            model = ExponentialSmoothing(
                y,
                trend="add",
                seasonal=None,
                initialization_method="estimated",
            ).fit(optimized=True)

    fitted = model.fittedvalues
    sigma = float(np.std(y - fitted))
    return model, fitted, sigma


# ─── Линейный тренд (fallback) ────────────────────────────────────────────────

def _fit_linear(monthly: pd.DataFrame) -> tuple:
    n = len(monthly)
    y = monthly["y"].values.astype(float)
    t = np.arange(n)
    coeffs = np.polyfit(t, y, 1)
    trend_fn = np.poly1d(coeffs)
    fitted = trend_fn(t)
    residuals = y - fitted
    monthly = monthly.copy()
    monthly["month"] = monthly["date"].dt.month
    monthly["resid"] = residuals
    seasonal = monthly.groupby("month")["resid"].mean().to_dict()
    sigma = float(residuals.std())
    return trend_fn, seasonal, sigma, n


# ─── Backtesting ──────────────────────────────────────────────────────────────

def _compute_metrics(monthly: pd.DataFrame) -> dict:
    """
    Walk-forward backtesting на последних 3 месяцах.
    Сравниваем Holt-Winters vs линейный тренд и берём лучший.
    """
    test_size = 3
    if len(monthly) <= test_size + 6:
        return {}

    train_y = monthly.iloc[:-test_size]["y"].values.astype(float)
    test_y = monthly.iloc[-test_size:]["y"].values.astype(float)

    # Holt-Winters backtesting
    hw_predictions = None
    if HW_AVAILABLE and len(train_y) >= 12:
        try:
            hw_model, hw_fitted, _ = _fit_holtwinters(train_y)
            hw_predictions = np.maximum(0, hw_model.forecast(test_size))
        except Exception:
            hw_predictions = None

    # Linear fallback backtesting
    train_monthly = monthly.iloc[:-test_size].copy()
    trend_fn, seasonal, _, n_train = _fit_linear(train_monthly)
    lin_predictions = np.array([
        max(0, trend_fn(n_train - 1 + s) + seasonal.get(monthly.iloc[-test_size + s - 1]["date"].month, 0))
        for s in range(1, test_size + 1)
    ])

    # Выбираем модель с меньшим MAE
    lin_mae = float(np.mean(np.abs(test_y - lin_predictions)))
    if hw_predictions is not None:
        hw_mae = float(np.mean(np.abs(test_y - hw_predictions)))
        use_hw = hw_mae < lin_mae
        predictions = hw_predictions if use_hw else lin_predictions
        method = "Holt-Winters (ETS)" if use_hw else "Linear trend + seasonality"
        mae = hw_mae if use_hw else lin_mae
    else:
        predictions = lin_predictions
        method = "Linear trend + seasonality"
        mae = lin_mae

    rmse = float(np.sqrt(np.mean((test_y - predictions) ** 2)))

    # R² на всей истории
    all_y = monthly["y"].values.astype(float)
    if HW_AVAILABLE and len(all_y) >= 12:
        try:
            _, fitted_all, _ = _fit_holtwinters(all_y)
        except Exception:
            fitted_all = None
    else:
        fitted_all = None

    if fitted_all is None:
        trend_fn2, seasonal2, _, n2 = _fit_linear(monthly)
        fitted_all = np.array([
            max(0, trend_fn2(i) + seasonal2.get(monthly.iloc[i]["date"].month, 0))
            for i in range(n2)
        ])

    ss_res = float(np.sum((all_y - fitted_all) ** 2))
    ss_tot = float(np.sum((all_y - all_y.mean()) ** 2))
    r2 = round(1 - ss_res / ss_tot, 3) if ss_tot > 0 else 0.0

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "r2": r2,
        "backtest_months": test_size,
        "method": method,
    }


# ─── Прогноз ─────────────────────────────────────────────────────────────────

def predict(
    horizon_months: int = 12,
    incident_type: str | None = None,
) -> dict:
    """
    Прогноз методом Holt-Winters (или линейный тренд при недостаточной истории).
    Включает доверительный интервал (±1.28σ = 80%) и backtesting метрики.
    """
    monthly = _load_monthly(incident_type)
    y = monthly["y"].values.astype(float)
    last_date = monthly["date"].max()
    n = len(monthly)

    # Выбираем метод
    hw_model = None
    sigma = float(y.std())
    method_used = "Linear trend + seasonality"

    if HW_AVAILABLE and n >= 12:
        try:
            hw_model, hw_fitted, sigma = _fit_holtwinters(y)
            method_used = "Holt-Winters (ETS)"
            fitted_history = hw_fitted
        except Exception:
            hw_model = None

    if hw_model is None:
        trend_fn, seasonal_dict, sigma, _ = _fit_linear(monthly)
        fitted_history = np.array([
            max(0.0, trend_fn(i) + seasonal_dict.get(monthly.iloc[i]["date"].month, 0))
            for i in range(n)
        ])

    metrics = _compute_metrics(monthly)

    # История
    result_rows = []
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
    if hw_model is not None:
        forecasts = np.maximum(0, hw_model.forecast(horizon_months))
    else:
        forecasts = np.array([
            max(0.0, trend_fn(n - 1 + s) + seasonal_dict.get(
                (last_date + pd.DateOffset(months=s)).month, 0
            ))
            for s in range(1, horizon_months + 1)
        ])

    for step, predicted in enumerate(forecasts, start=1):
        future_date = last_date + pd.DateOffset(months=step)
        lower = max(0.0, float(predicted) - 1.28 * sigma)
        upper = float(predicted) + 1.28 * sigma
        result_rows.append({
            "date": future_date.strftime("%Y-%m"),
            "actual": None,
            "predicted": round(float(predicted), 1),
            "lower": round(lower, 1),
            "upper": round(upper, 1),
            "is_forecast": True,
        })

    total_predicted = sum(r["predicted"] for r in result_rows if r["is_forecast"])
    total_lower = sum(r["lower"] for r in result_rows if r["is_forecast"])
    total_upper = sum(r["upper"] for r in result_rows if r["is_forecast"])

    if metrics and "method" not in metrics:
        metrics["method"] = method_used

    return {
        "horizon_months": horizon_months,
        "incident_type": incident_type,
        "series": result_rows,
        "summary": {
            "total_predicted": round(float(total_predicted), 1),
            "total_lower": round(float(total_lower), 1),
            "total_upper": round(float(total_upper), 1),
        },
        "model_metrics": metrics,
    }
