from __future__ import annotations

from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Query

from ml.alerts import get_alerts
from ml.risk_scorer import org_ratings, correlation_analysis

router = APIRouter(prefix="/api/korgau", tags=["korgau"])

DATA_PATH = Path(__file__).parent.parent / "data" / "korgau_cards.csv"


def _load() -> pd.DataFrame:
    return pd.read_csv(DATA_PATH, parse_dates=["date"])


@router.get("/alerts")
def alerts():
    return {"alerts": get_alerts()}


@router.get("/ratings")
def ratings():
    return {"ratings": org_ratings()}


@router.get("/correlation")
def correlation():
    return correlation_analysis()


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

    by_category = violations["category"].value_counts().to_dict()
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
