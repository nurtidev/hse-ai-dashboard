"""
AI-чат аналитик HSE — отвечает на вопросы по данным инцидентов и нарушений.
Контекст данных строится динамически и передаётся Claude при каждом запросе.
"""
from __future__ import annotations

import os
from pathlib import Path

import anthropic
import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

from ml.risk_scorer import org_ratings, top_risk_zones

router = APIRouter(prefix="/api/chat", tags=["chat"])

INCIDENTS_PATH = Path(__file__).parent.parent / "data" / "incidents.csv"
KORGAU_PATH = Path(__file__).parent.parent / "data" / "korgau_cards.csv"

SYSTEM_PROMPT = """Ты — AI-аналитик по охране труда и промышленной безопасности системы HSE компании КМГ-Кумколь (нефтегазовая отрасль, Казахстан).

Тебе предоставлены актуальные данные из HSE-системы: статистика инцидентов, результаты поведенческих аудитов (Карта Коргау), рейтинги организаций и зоны риска.

Правила:
- Отвечай строго на основе предоставленных данных. Если данных недостаточно — скажи об этом.
- Давай конкретные, практичные ответы с цифрами из данных.
- Если вопрос о причинах или рекомендациях — опирайся на паттерны в данных.
- Отвечай на том языке, на котором задан вопрос (русский или казахский).
- Будь лаконичен: 3-5 предложений, если не просят подробнее.
- Не придумывай данные. Только то, что есть в контексте ниже.

{data_context}"""


def _build_data_context() -> str:
    inc = pd.read_csv(INCIDENTS_PATH, parse_dates=["date"])
    korgau = pd.read_csv(KORGAU_PATH, parse_dates=["date"])

    # Общая статистика
    total_inc = len(inc)
    date_min = inc["date"].min().strftime("%d.%m.%Y")
    date_max = inc["date"].max().strftime("%d.%m.%Y")

    # По типам инцидентов
    by_type = inc["type"].value_counts().to_dict()

    # По организациям
    by_org = inc.groupby("org_name").agg(
        incidents=("id", "count")
    ).sort_values("incidents", ascending=False).to_dict()["incidents"]

    # По локациям
    by_location = inc["location"].value_counts().head(7).to_dict()

    # Топ причины
    by_cause = inc["cause"].value_counts().head(5).to_dict()

    # Динамика по месяцам (последние 12 месяцев)
    inc["month"] = inc["date"].dt.to_period("M")
    monthly = inc.groupby("month").size().tail(12).to_dict()
    monthly_str = ", ".join(f"{str(k)}: {v}" for k, v in monthly.items())

    # Коргау — нарушения
    violations = korgau[korgau["obs_type"] == "Нарушение"]
    good = korgau[korgau["obs_type"] == "Хорошая практика"]
    viol_by_cat = violations["category"].value_counts().to_dict()
    viol_by_org = violations.groupby("org_name").size().sort_values(ascending=False).to_dict()
    unresolved = violations[violations["resolved"] == "Просрочено"]

    # Рейтинги организаций
    ratings = org_ratings()
    ratings_str = "\n".join(
        f"  - {r['org_name']}: индекс риска {r['risk_index']}, уровень {r['risk_level']}, "
        f"инцидентов {r['total_incidents']}, нарушений {r['total_violations']}"
        for r in ratings
    )

    # Топ зоны риска
    risk_zones = top_risk_zones(5)
    zones_str = "\n".join(
        f"  - {z['org_name']} / {z['location']}: {z['incident_count']} инц., индекс {z['risk_index']}"
        for z in risk_zones
    )

    return f"""=== ДАННЫЕ HSE-СИСТЕМЫ КМГ-КУМКОЛЬ ===

ПЕРИОД ДАННЫХ: {date_min} — {date_max}

ИНЦИДЕНТЫ (всего {total_inc}):
По типам: {by_type}
По организациям: {dict(list(by_org.items()))}
По локациям: {by_location}
Топ причин: {by_cause}
Динамика по месяцам (последние 12 мес): {monthly_str}

ПОВЕДЕНЧЕСКИЕ АУДИТЫ КАРТЫ КОРГАУ:
Всего наблюдений: {len(korgau)} (нарушений: {len(violations)}, хороших практик: {len(good)})
Нарушения по категориям: {viol_by_cat}
Нарушения по организациям: {dict(list(viol_by_org.items()))}
Просроченных нарушений: {len(unresolved)}

РЕЙТИНГИ ОРГАНИЗАЦИЙ (индекс риска 0-100, выше = хуже):
{ratings_str}

ТОП-5 ЗОН РИСКА (организация / локация):
{zones_str}
"""


class ChatMessage(BaseModel):
    role: str  # "user" или "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


@router.post("/")
def chat(req: ChatRequest):
    data_context = _build_data_context()
    system = SYSTEM_PROMPT.format(data_context=data_context)

    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": req.message})

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=system,
        messages=messages,
    )

    return {"reply": response.content[0].text}
