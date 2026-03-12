"""
Управление режимом датасета.
GET  /api/config/dataset  — текущий режим
POST /api/config/dataset  — сменить режим
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config_store

router = APIRouter(prefix="/api/config", tags=["config"])


class DatasetRequest(BaseModel):
    dataset: str  # "combined" | "real" | "synthetic"


@router.get("/dataset")
def get_dataset():
    ds = config_store.get_dataset()
    return {
        "dataset": ds,
        "label": config_store.DATASET_LABELS[ds],
        "options": [
            {"value": k, "label": v}
            for k, v in config_store.DATASET_LABELS.items()
        ],
    }


@router.post("/dataset")
def set_dataset(body: DatasetRequest):
    try:
        config_store.set_dataset(body.dataset)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    ds = config_store.get_dataset()
    return {"dataset": ds, "label": config_store.DATASET_LABELS[ds]}
