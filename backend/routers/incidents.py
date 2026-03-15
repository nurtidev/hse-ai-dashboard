from __future__ import annotations

import json
import os

import anthropic
import pandas as pd
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from ml.predictor import predict
from ml.risk_scorer import top_risk_zones
import data_loader

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


class ClassifyRequest(BaseModel):
    text: str


_CLASSIFY_PROMPT = """Ты — AI-система классификации происшествий в нефтегазовой отрасли (HSE).
Проанализируй текст описания инцидента и верни JSON со следующими полями:

- type: тип инцидента (одно из: "НС (несчастный случай)", "Микротравма", "Ухудшение здоровья", "Опасная ситуация", "Near-miss", "Авария оборудования", "Экологическое нарушение", "ДТП", "Пожар/Возгорание")
- confidence: уверенность ("высокая", "средняя", "низкая")
- severity: тяжесть ("критический", "высокий", "средний", "низкий")
- clusters: список тематических кластеров из возможных ["Работа на высоте", "СИЗ", "LOTO/Изоляция энергии", "Транспорт", "Пожарная безопасность", "Химическая безопасность", "Электробезопасность", "Ручной труд", "Экология", "Оборудование"]
- cause_category: корневая причина ("нарушение процедур", "неисправность оборудования", "человеческий фактор", "недостаточный надзор", "условия среды", "иное")
- recommendation: одна конкретная превентивная мера (1-2 предложения)

Верни ТОЛЬКО валидный JSON без пояснений.

Текст инцидента: {text}"""


@router.post("/classify")
def classify_incident(req: ClassifyRequest):
    if not req.text.strip():
        raise HTTPException(status_code=422, detail="text не может быть пустым")

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": _CLASSIFY_PROMPT.format(text=req.text)}],
    )

    raw = response.content[0].text.strip()
    # убираем markdown-обёртку если есть
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Не удалось разобрать ответ модели")


def _load() -> pd.DataFrame:
    return data_loader.load_incidents()


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
