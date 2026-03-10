from __future__ import annotations

from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Query, HTTPException

from ml.predictor import predict
from ml.risk_scorer import top_risk_zones
import simulation_store

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

DATA_PATH = Path(__file__).parent.parent / "data" / "incidents.csv"


def _load() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, parse_dates=["date"])
    extra = simulation_store.get_extra()
    if extra:
        extra_df = pd.DataFrame(extra)
        extra_df["date"] = pd.to_datetime(extra_df["date"])
        df = pd.concat([df, extra_df], ignore_index=True)
    return df


@router.get("/stats")
def get_stats(
    date_from: str = Query(None, description="YYYY-MM-DD"),
    date_to: str = Query(None, description="YYYY-MM-DD"),
    org_id: str = Query(None),
    incident_type: str = Query(None),
):
    df = _load()

    if date_from:
        df = df[df["date"] >= pd.to_datetime(date_from)]
    if date_to:
        df = df[df["date"] <= pd.to_datetime(date_to)]
    if org_id:
        df = df[df["org_id"] == org_id]
    if incident_type:
        df = df[df["type"] == incident_type]

    by_type = df["type"].value_counts().to_dict()
    by_org = df["org_name"].value_counts().head(7).to_dict()
    by_location = df["location"].value_counts().head(7).to_dict()

    monthly = (
        df.resample("MS", on="date")
        .size()
        .reset_index(name="count")
    )
    monthly_series = [
        {"month": r["date"].strftime("%Y-%m"), "count": r["count"]}
        for _, r in monthly.iterrows()
    ]

    return {
        "total": len(df),
        "by_type": by_type,
        "by_org": by_org,
        "by_location": by_location,
        "monthly_series": monthly_series,
    }


@router.get("/predict")
def get_predict(
    horizon: int = Query(12, description="Горизонт прогноза (мес.): 3, 6 или 12"),
    incident_type: str = Query(None),
):
    if horizon not in (3, 6, 12):
        raise HTTPException(status_code=422, detail="horizon must be 3, 6 or 12")
    return predict(horizon_months=horizon, incident_type=incident_type)


@router.get("/top-risks")
def get_top_risks(n: int = Query(5, ge=1, le=10)):
    return {"zones": top_risk_zones(n=n)}


@router.get("/types")
def get_types():
    df = _load()
    return {"types": sorted(df["type"].unique().tolist())}


@router.get("/organizations")
def get_organizations():
    df = _load()
    orgs = df[["org_id", "org_name"]].drop_duplicates().to_dict(orient="records")
    return {"organizations": orgs}
