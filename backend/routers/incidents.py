from __future__ import annotations

import json
import os
from datetime import timedelta

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


# Типы инцидентов которые стоит расследовать (тяжёлые)
_SERIOUS_TYPES = {
    "НС (несчастный случай)", "Авария оборудования",
    "Пожар/Возгорание", "ДТП", "Экологическое нарушение",
}


@router.get("/for-investigation")
def get_for_investigation():
    """Возвращает список серьёзных инцидентов для режима 'Следователь'."""
    df = data_loader.load_incidents(with_simulated=False)
    serious = df[df["type"].isin(_SERIOUS_TYPES)].copy()
    serious = serious.sort_values("date", ascending=False).head(50)
    result = []
    for _, row in serious.iterrows():
        desc = str(row.get("description", ""))
        result.append({
            "id": row["id"],
            "date": row["date"].strftime("%Y-%m-%d"),
            "type": row["type"],
            "org_name": row["org_name"],
            "org_id": row["org_id"],
            "location": row.get("location", ""),
            "description_short": desc[:120] + "…" if len(desc) > 120 else desc,
        })
    return {"incidents": result}


@router.get("/investigate/{incident_id}")
def investigate_incident(incident_id: str):
    """
    Ретроспективный анализ инцидента:
    - Детали инцидента
    - Нарушения Коргау из той же организации за 90 дней до инцидента
    - AI-объяснение паттерна
    """
    inc_df = data_loader.load_incidents(with_simulated=False)
    korgau_df = data_loader.load_korgau()

    row = inc_df[inc_df["id"] == incident_id]
    if row.empty:
        raise HTTPException(status_code=404, detail="Инцидент не найден")

    inc = row.iloc[0]
    inc_date = inc["date"]
    org_id = inc["org_id"]
    org_name = inc["org_name"]

    # Нарушения Коргау за 90 дней до инцидента в этой организации
    window_start = inc_date - timedelta(days=90)
    preceding = korgau_df[
        (korgau_df["org_id"] == org_id) &
        (korgau_df["obs_type"] == "Нарушение") &
        (korgau_df["date"] >= window_start) &
        (korgau_df["date"] < inc_date)
    ].sort_values("date")

    timeline_events = []
    for _, vrow in preceding.iterrows():
        days_before = (inc_date - vrow["date"]).days
        timeline_events.append({
            "date": vrow["date"].strftime("%Y-%m-%d"),
            "days_before": days_before,
            "event_type": "violation",
            "category": vrow["category"],
            "description": str(vrow.get("description", ""))[:100],
            "resolved": bool(vrow["resolved"] == "Устранено" or vrow["resolved"] is True or str(vrow["resolved"]) == "1"),
        })

    # Добавляем сам инцидент в конец таймлайна
    timeline_events.append({
        "date": inc["date"].strftime("%Y-%m-%d"),
        "days_before": 0,
        "event_type": "incident",
        "category": inc["type"],
        "description": str(inc.get("description", ""))[:200],
        "resolved": False,
    })

    # Статистика
    unresolved_count = sum(1 for e in timeline_events[:-1] if not e["resolved"])
    repeat_cats = (
        preceding["category"].value_counts()
        .head(3)
        .to_dict()
    )

    # AI-анализ
    ai_analysis = _generate_investigation_analysis(
        inc=inc,
        preceding_count=len(preceding),
        unresolved=unresolved_count,
        repeat_cats=repeat_cats,
        timeline_events=timeline_events[:-1],  # без самого инцидента
    )

    return {
        "incident": {
            "id": inc["id"],
            "date": inc["date"].strftime("%Y-%m-%d"),
            "type": inc["type"],
            "org_name": org_name,
            "location": inc.get("location", ""),
            "description": str(inc.get("description", "")),
            "cause": str(inc.get("cause", "")),
        },
        "timeline": timeline_events,
        "stats": {
            "violations_90d": len(preceding),
            "unresolved": unresolved_count,
            "repeat_categories": repeat_cats,
        },
        "ai_analysis": ai_analysis,
    }


def _generate_investigation_analysis(
    inc, preceding_count: int, unresolved: int,
    repeat_cats: dict, timeline_events: list,
) -> str:
    if preceding_count == 0:
        return "В базе данных Коргау не найдено нарушений в данной организации за 90 дней до инцидента."

    top_events = timeline_events[-5:] if len(timeline_events) >= 5 else timeline_events
    events_text = "\n".join(
        f"  {e['date']} ({e['days_before']} дн. до): {e['category']} — {'не устранено' if not e['resolved'] else 'устранено'}"
        for e in top_events
    )

    prompt = f"""Ты — эксперт по расследованию инцидентов в нефтегазовой отрасли.

Инцидент: {inc['type']} в {inc['org_name']}
Дата: {inc['date'].strftime('%d.%m.%Y')}
Место: {inc.get('location', 'не указано')}

За 90 дней до инцидента в этой организации зафиксировано {preceding_count} нарушений по Коргау.
Не устранено из них: {unresolved}
Повторяющиеся категории: {repeat_cats}

Последние нарушения перед инцидентом:
{events_text}

Напиши краткий анализ (3-4 предложения) на русском языке:
1. Какие сигналы предупреждали об инциденте
2. Какие из них были проигнорированы
3. Какой вывод для будущей превенции

Тон: экспертный, конкретный. Только текст, без заголовков."""

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()
