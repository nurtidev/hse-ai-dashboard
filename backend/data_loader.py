"""
Централизованная загрузка данных.
Все роутеры и ML-модули обращаются сюда вместо прямого чтения CSV.
Выбор файла зависит от config_store.get_dataset().
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

import config_store
import simulation_store

DATA_DIR = Path(__file__).parent / "data"

_FILES = {
    "incidents": {
        "combined":   DATA_DIR / "incidents.csv",
        "real":       DATA_DIR / "incidents_real.csv",
        "synthetic":  DATA_DIR / "incidents_synth.csv",
    },
    "korgau": {
        "combined":   DATA_DIR / "korgau_cards.csv",
        "real":       DATA_DIR / "korgau_real.csv",
        "synthetic":  DATA_DIR / "korgau_synth.csv",
    },
}


def load_incidents(with_simulated: bool = True) -> pd.DataFrame:
    """Загружает датасет инцидентов согласно текущему режиму."""
    dataset = config_store.get_dataset()
    path = _FILES["incidents"][dataset]
    df = pd.read_csv(path, parse_dates=["date"])

    if with_simulated and dataset != "real":
        extra = simulation_store.get_extra()
        if extra:
            extra_df = pd.DataFrame(extra)
            extra_df["date"] = pd.to_datetime(extra_df["date"])
            df = pd.concat([df, extra_df], ignore_index=True)

    return df


def load_korgau() -> pd.DataFrame:
    """Загружает датасет Коргау согласно текущему режиму."""
    dataset = config_store.get_dataset()
    path = _FILES["korgau"][dataset]
    return pd.read_csv(path, parse_dates=["date"])
