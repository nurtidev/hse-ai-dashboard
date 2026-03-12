"""
Глобальный конфиг: режим датасета.
combined  — синтетика 2023-2025 + реальные данные организаторов (по умолчанию)
real      — только данные от организаторов (ТОО-организации)
synthetic — только наша синтетика
"""
from __future__ import annotations

VALID_DATASETS = ("combined", "real", "synthetic")

_dataset: str = "combined"


def get_dataset() -> str:
    return _dataset


def set_dataset(value: str) -> None:
    global _dataset
    if value not in VALID_DATASETS:
        raise ValueError(f"Unknown dataset: {value}. Valid: {VALID_DATASETS}")
    _dataset = value


DATASET_LABELS = {
    "combined": "Все данные (синтетика + организаторы)",
    "real": "Только данные организаторов",
    "synthetic": "Только синтетические данные",
}
