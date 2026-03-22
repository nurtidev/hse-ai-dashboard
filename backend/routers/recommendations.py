"""
AI-рекомендации через Claude API на основе паттернов из данных.
Результат кэшируется на 1 час — повторные заходы не тратят токены.
"""
from __future__ import annotations

import json
import re
import time

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from ml.risk_scorer import top_risk_zones
import data_loader
import config_store
from anthropic_client import get_client

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])

CACHE_TTL = 3600  # секунды (1 час)
_cache: dict = {"data": None, "ts": 0, "dataset": None}


def _build_context() -> str:
    inc = data_loader.load_incidents(with_simulated=False)
    korgau = data_loader.load_korgau()

    cutoff = inc["date"].max() - pd.DateOffset(months=6)
    recent_inc = inc[inc["date"] >= cutoff]
    recent_viol = korgau[(korgau["date"] >= cutoff) & (korgau["obs_type"] == "Нарушение")]

    top_inc_types = recent_inc["type"].value_counts().head(3).to_dict()
    top_causes = recent_inc["cause"].value_counts().head(3).to_dict()
    top_viol_cats = recent_viol["category"].value_counts().head(3).to_dict()
    top_locations = recent_inc["location"].value_counts().head(3).to_dict()

    return f"""Данные HSE-системы за последние 6 месяцев:

Происшествия ({len(recent_inc)} шт.):
- Топ типов: {top_inc_types}
- Топ причин: {top_causes}
- Топ локаций: {top_locations}

Нарушения по Карте Коргау ({len(recent_viol)} шт.):
- Топ категорий нарушений: {top_viol_cats}

Топ-3 зоны риска:
{top_risk_zones(3)}""".strip()


def _fetch_from_claude(context: str) -> list:
    try:
        message = get_client().messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": f"""Ты эксперт по охране труда в нефтегазовой отрасли.
На основе следующих данных HSE-системы сформируй ровно 5 конкретных рекомендаций по улучшению безопасности.

{context}

Формат ответа — JSON-массив объектов:
[
  {{
    "priority": "Высокий" | "Средний" | "Низкий",
    "title": "Краткое название меры",
    "description": "Конкретное описание действия (2-3 предложения)",
    "target": "На кого направлено (организация/локация/тип работ)",
    "expected_effect": "Ожидаемый результат"
  }}
]

Отвечай только JSON, без markdown-обёртки.""",
                }
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка Claude API: {e}")
    raw = message.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Не удалось разобрать ответ модели: {e}")


@router.get("/")
def get_recommendations(refresh: bool = Query(False, description="Принудительно обновить (игнорировать кэш)")):
    now = time.time()
    current_dataset = config_store.get_dataset()
    cache_valid = (
        _cache["data"] is not None
        and (now - _cache["ts"]) < CACHE_TTL
        and _cache.get("dataset") == current_dataset
    )

    if cache_valid and not refresh:
        return {**_cache["data"], "cached": True}

    context = _build_context()
    recommendations = _fetch_from_claude(context)

    _cache["data"] = {"recommendations": recommendations, "context_summary": context}
    _cache["ts"] = now
    _cache["dataset"] = current_dataset

    return {**_cache["data"], "cached": False}
