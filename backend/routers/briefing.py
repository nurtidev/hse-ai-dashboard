"""
Генерация еженедельного брифинга для директора по HSE.
Claude формирует профессиональный отчёт на русском языке на основе актуальных данных.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd
from fastapi import APIRouter, HTTPException

from ml.alerts import get_alerts
from ml.risk_scorer import org_ratings
import data_loader
from anthropic_client import get_client

router = APIRouter(prefix="/api/briefing", tags=["briefing"])


def _build_briefing_context() -> dict:
    inc = data_loader.load_incidents(with_simulated=False)
    korgau = data_loader.load_korgau()

    ref_date = inc["date"].max()
    week_ago = ref_date - timedelta(days=7)
    prev_week_start = week_ago - timedelta(days=7)

    # Инциденты за последнюю неделю
    this_week = inc[inc["date"] >= week_ago]
    prev_week = inc[(inc["date"] >= prev_week_start) & (inc["date"] < week_ago)]
    delta = len(this_week) - len(prev_week)

    # Нарушения за неделю
    viol_week = korgau[
        (korgau["date"] >= week_ago) & (korgau["obs_type"] == "Нарушение")
    ]
    viol_prev = korgau[
        (korgau["date"] >= prev_week_start) &
        (korgau["date"] < week_ago) &
        (korgau["obs_type"] == "Нарушение")
    ]
    viol_delta = len(viol_week) - len(viol_prev)

    # Топ типов инцидентов этой недели
    inc_types = this_week["type"].value_counts().head(3).to_dict() if len(this_week) > 0 else {}

    # Топ категорий нарушений
    viol_cats = viol_week["category"].value_counts().head(3).to_dict() if len(viol_week) > 0 else {}

    # CRITICAL и HIGH алерты
    alerts = get_alerts()
    critical = [a for a in alerts if a["level"] == "CRITICAL"]
    high = [a for a in alerts if a["level"] == "HIGH"]

    # Топ-3 организации по риску
    ratings = org_ratings()[:3]
    top_orgs = [{"org": r["org_name"], "risk": r["risk_index"], "level": r["risk_level"]} for r in ratings]

    return {
        "report_date": ref_date.strftime("%d.%m.%Y"),
        "period": f"{week_ago.strftime('%d.%m')} — {ref_date.strftime('%d.%m.%Y')}",
        "incidents_this_week": len(this_week),
        "incidents_prev_week": len(prev_week),
        "incidents_delta": delta,
        "incident_types": inc_types,
        "violations_this_week": len(viol_week),
        "violations_prev_week": len(viol_prev),
        "violations_delta": viol_delta,
        "violation_categories": viol_cats,
        "critical_alerts": [{"org": a["org_name"], "msg": a["message"]} for a in critical],
        "high_alerts": [{"org": a["org_name"], "msg": a["message"]} for a in high[:5]],
        "top_risk_orgs": top_orgs,
    }


def _generate_with_claude(ctx: dict) -> str:
    delta_str = f"+{ctx['incidents_delta']}" if ctx['incidents_delta'] > 0 else str(ctx['incidents_delta'])
    viol_delta_str = f"+{ctx['violations_delta']}" if ctx['violations_delta'] > 0 else str(ctx['violations_delta'])

    prompt = f"""Ты — AI-аналитик системы охраны труда КМГ-Кумколь.
Составь краткий еженедельный брифинг для директора по HSE на русском языке.

Данные за период {ctx['period']}:

ИНЦИДЕНТЫ:
- Зафиксировано за неделю: {ctx['incidents_this_week']} (прошлая неделя: {ctx['incidents_prev_week']}, изменение: {delta_str})
- Типы: {ctx['incident_types'] if ctx['incident_types'] else 'нет данных за период'}

НАРУШЕНИЯ КОРГАУ:
- Зафиксировано за неделю: {ctx['violations_this_week']} (прошлая неделя: {ctx['violations_prev_week']}, изменение: {viol_delta_str})
- Категории: {ctx['violation_categories'] if ctx['violation_categories'] else 'нет данных за период'}

АКТИВНЫЕ АЛЕРТЫ:
- Критических: {len(ctx['critical_alerts'])} — {[a['org'] for a in ctx['critical_alerts']]}
- Высоких: {len(ctx['high_alerts'])}

ТОП-3 ОРГАНИЗАЦИИ ПО РИСКУ:
{chr(10).join(f"  {i+1}. {o['org']} — индекс {o['risk']} ({o['level']})" for i, o in enumerate(ctx['top_risk_orgs']))}

Требования к брифингу:
1. Начни с "Уважаемый директор по HSE,"
2. Абзац 1: краткое резюме недели (2-3 предложения с конкретными цифрами)
3. Абзац 2: критические и высокие риски — конкретные организации, что происходит
4. Абзац 3: рекомендуемые действия на следующую неделю (2-3 пункта с организациями)
5. Завершающая строка с подписью "AI-аналитик HSE Dashboard"

Тон: деловой, конкретный, без воды. Максимум 200 слов."""

    try:
        message = get_client().messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка Claude API: {e}")
    return message.content[0].text.strip()


@router.post("/generate")
def generate_briefing():
    ctx = _build_briefing_context()
    text = _generate_with_claude(ctx)
    return {
        "briefing": text,
        "period": ctx["period"],
        "stats": {
            "incidents": ctx["incidents_this_week"],
            "violations": ctx["violations_this_week"],
            "critical_alerts": len(ctx["critical_alerts"]),
        },
    }
