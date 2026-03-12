"""
In-memory хранилище симулированных инцидентов для live demo.
Данные живут пока работает сервер — сбрасываются через /api/simulate/reset.
"""
from __future__ import annotations

import random
import uuid
from datetime import date

_extra_incidents: list[dict] = []

INCIDENT_TYPES = [
    "НС (несчастный случай)",
    "Микротравма",
    "Ухудшение здоровья",
    "Опасная ситуация",
    "Near-miss",
    "Авария оборудования",
    "Экологическое нарушение",
    "ДТП",
    "Пожар/Возгорание",
]

# Топ организаций по частоте инцидентов (синтетика + реальные данные)
ORGS = [
    {"org_id": "org_02", "org_name": "БурСервис"},
    {"org_id": "org_17", "org_name": 'ТОО "Весенний Букет"'},
    {"org_id": "org_05", "org_name": "АзимутДриллинг"},
    {"org_id": "org_03", "org_name": "НефтеМонтаж"},
    {"org_id": "org_01", "org_name": "КМГ-Кумколь (основное)"},
    {"org_id": "org_04", "org_name": "КазТехСтрой"},
    {"org_id": "org_06", "org_name": "СтройПодряд"},
    {"org_id": "org_07", "org_name": "ТрансНефть"},
    {"org_id": "org_09", "org_name": 'ТОО "Алтын Раушан"'},
    {"org_id": "org_67", "org_name": 'ТОО "Сакура KZ"'},
    {"org_id": "org_27", "org_name": 'ТОО "Гүл Әлемі"'},
    {"org_id": "org_44", "org_name": 'ТОО "Лазурная Лилия"'},
]

LOCATIONS = [
    "Буровая №1", "Буровая №2", "Буровая №3",
    "Компрессорная", "Насосная станция", "Котельная",
    "Нефтесборный пункт", "Электроподстанция",
]

CAUSES = [
    "Нарушение требований безопасности при производстве работ",
    "Неудовлетворительная организация работ",
    "Несоблюдение требований охраны труда работником",
    "Отказ или неисправность оборудования",
    "Нарушение технологического регламента",
    "Недостаточный контроль со стороны руководства",
]


def get_extra() -> list[dict]:
    return _extra_incidents.copy()


def add_random_incident(
    org_id: str | None = None,
    incident_type: str | None = None,
) -> dict:
    org = next((o for o in ORGS if o["org_id"] == org_id), None) or random.choice(ORGS)
    itype = incident_type if incident_type in INCIDENT_TYPES else random.choice(INCIDENT_TYPES)

    incident = {
        "id": str(uuid.uuid4()),
        "date": date.today().isoformat(),
        "time": f"{random.randint(6, 22):02d}:{random.choice(['00', '15', '30', '45'])}",
        "type": itype,
        "org_id": org["org_id"],
        "org_name": org["org_name"],
        "location": random.choice(LOCATIONS),
        "description": f"[DEMO] {itype} на объекте {org['org_name']}",
        "cause": random.choice(CAUSES),
        "status": "Расследуется",
    }
    _extra_incidents.append(incident)
    return incident


def reset() -> None:
    _extra_incidents.clear()


def count() -> int:
    return len(_extra_incidents)
