"""
Live Demo: симуляция новых инцидентов в реальном времени.
POST /api/simulate/incident — добавляет случайный инцидент в память.
POST /api/simulate/reset    — сбрасывает симулированные данные.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

import simulation_store

router = APIRouter(prefix="/api/simulate", tags=["simulate"])


@router.post("/incident")
def simulate_incident(
    org_id: str = Query(None, description="org_01 … org_07 (или случайная)"),
    incident_type: str = Query(None, description="Тип инцидента (или случайный)"),
):
    """Добавляет один случайный инцидент сегодняшней датой."""
    incident = simulation_store.add_random_incident(org_id, incident_type)
    return {
        "added": incident,
        "total_simulated": simulation_store.count(),
    }


@router.post("/reset")
def reset_simulation():
    """Сбрасывает все симулированные данные."""
    simulation_store.reset()
    return {"reset": True, "total_simulated": 0}


@router.get("/status")
def get_status():
    return {
        "total_simulated": simulation_store.count(),
        "incidents": simulation_store.get_extra(),
    }
