"""
Система алертов по Карте Коргау.
Уровни: CRITICAL / HIGH / MEDIUM / LOW
"""
from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

KORGAU_PATH = Path(__file__).parent.parent / "data" / "korgau_cards.csv"

ALERT_COLORS = {
    "CRITICAL": "#EF4444",
    "HIGH": "#F97316",
    "MEDIUM": "#EAB308",
    "LOW": "#22C55E",
}

ALERT_LABELS = {
    "CRITICAL": "Критический",
    "HIGH": "Высокий",
    "MEDIUM": "Средний",
    "LOW": "Низкий",
}


def _load() -> pd.DataFrame:
    df = pd.read_csv(KORGAU_PATH, parse_dates=["date"])
    return df[df["obs_type"] == "Нарушение"].copy()


def get_alerts(reference_date: datetime | None = None) -> list[dict]:
    """
    Генерирует список активных алертов на указанную дату.
    По умолчанию — последняя дата в данных.
    """
    df = _load()

    if reference_date is None:
        reference_date = df["date"].max().to_pydatetime()

    alerts = []

    # --- Правило 1: CRITICAL — нарушений за 30 дней > порог × 2 ---
    window_30 = df[df["date"] >= reference_date - timedelta(days=30)]
    counts_30 = window_30.groupby("org_id").agg(
        org_name=("org_name", "first"),
        count=("id", "count"),
    ).reset_index()
    threshold = df.groupby("org_id")["id"].count().mean() / 12 * 2  # среднемесячное × 2
    for _, row in counts_30[counts_30["count"] >= threshold * 2].iterrows():
        alerts.append({
            "level": "CRITICAL",
            "label": ALERT_LABELS["CRITICAL"],
            "color": ALERT_COLORS["CRITICAL"],
            "org_id": row["org_id"],
            "org_name": row["org_name"],
            "message": f"Число нарушений за 30 дней ({row['count']}) превысило порог в 2 раза",
            "count": int(row["count"]),
        })

    # --- Правило 2: HIGH — один тип нарушения повторяется >3 раз за 30 дней ---
    repeat = (
        window_30.groupby(["org_id", "org_name", "category"])
        .size()
        .reset_index(name="count")
    )
    for _, row in repeat[repeat["count"] > 3].iterrows():
        if not any(
            a["org_id"] == row["org_id"] and a["level"] == "CRITICAL" for a in alerts
        ):
            alerts.append({
                "level": "HIGH",
                "label": ALERT_LABELS["HIGH"],
                "color": ALERT_COLORS["HIGH"],
                "org_id": row["org_id"],
                "org_name": row["org_name"],
                "message": f"Нарушения «{row['category']}» повторились {row['count']} раз за 30 дней",
                "count": int(row["count"]),
            })

    # --- Правило 3: MEDIUM — рост нарушений >15% к прошлому году ---
    this_year_start = reference_date - timedelta(days=30)
    last_year_start = this_year_start - timedelta(days=365)
    last_year_end = reference_date - timedelta(days=365)

    current = df[df["date"] >= this_year_start].groupby("org_id").size()
    previous = df[
        (df["date"] >= last_year_start) & (df["date"] <= last_year_end)
    ].groupby("org_id").size()

    for org_id in current.index:
        if org_id in previous.index and previous[org_id] > 0:
            growth = (current[org_id] - previous[org_id]) / previous[org_id]
            if growth > 0.15:
                org_name = df[df["org_id"] == org_id]["org_name"].iloc[0]
                if not any(a["org_id"] == org_id for a in alerts):
                    alerts.append({
                        "level": "MEDIUM",
                        "label": ALERT_LABELS["MEDIUM"],
                        "color": ALERT_COLORS["MEDIUM"],
                        "org_id": org_id,
                        "org_name": org_name,
                        "message": f"Рост нарушений +{round(growth * 100)}% к аналогичному периоду прошлого года",
                        "count": int(current[org_id]),
                    })

    # --- Правило 4: LOW — улучшение показателей ---
    for org_id in previous.index:
        if org_id in current.index and previous[org_id] > 0:
            growth = (current[org_id] - previous[org_id]) / previous[org_id]
            if growth < -0.20:
                org_name = df[df["org_id"] == org_id]["org_name"].iloc[0]
                if not any(a["org_id"] == org_id for a in alerts):
                    alerts.append({
                        "level": "LOW",
                        "label": ALERT_LABELS["LOW"],
                        "color": ALERT_COLORS["LOW"],
                        "org_id": org_id,
                        "org_name": org_name,
                        "message": f"Снижение нарушений на {abs(round(growth * 100))}% — положительная динамика",
                        "count": int(current[org_id]),
                    })

    # Сортировка по уровню критичности
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    alerts.sort(key=lambda a: order[a["level"]])
    return alerts
