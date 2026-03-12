"""
Конвертация реальных данных от организаторов (xlsx) в CSV-формат HSE-системы.

Запуск: python3 backend/data/convert_xlsx.py
Результат: обновляет incidents.csv и korgau_cards.csv (синтетика 2023-2024 + реальные 2025).
"""
from __future__ import annotations

import csv
import re
import uuid
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).parent
HACKATHON_DIR = DATA_DIR.parent.parent / "файлы хакатон"

INC_XLSX = HACKATHON_DIR / "Проишествия.xlsx"
KORGAU_XLSX = next(HACKATHON_DIR.glob("*.xlsx"), None)  # Коргау файл

# Базовые синтетические CSV (история 2023-2024)
INC_SYNTH = DATA_DIR / "incidents_synth_backup.csv"
KORGAU_SYNTH = DATA_DIR / "korgau_synth_backup.csv"
INC_OUT = DATA_DIR / "incidents.csv"
KORGAU_OUT = DATA_DIR / "korgau_cards.csv"


# ─── Утилиты ────────────────────────────────────────────────────────────────

def col_to_index(col_str: str) -> int:
    result = 0
    for ch in col_str:
        result = result * 26 + (ord(ch) - ord("A") + 1)
    return result - 1


def excel_serial_to_date(serial: str) -> str | None:
    """Преобразует Excel-дату (число) в строку YYYY-MM-DD.
    Фильтрует даты вне диапазона 2020-2027 (признак битых данных).
    """
    if not serial:
        return None
    try:
        days = int(float(serial))
        if days == 0:
            return None
        dt = datetime(1899, 12, 30) + timedelta(days=days)
        if not (2020 <= dt.year <= 2027):
            return None
        return dt.strftime("%Y-%m-%d")
    except (ValueError, OverflowError):
        return None


def excel_serial_to_time(serial: str) -> str | None:
    """Извлекает время из Excel-даты (дробная часть)."""
    if not serial:
        return None
    try:
        val = float(serial)
        frac = val - int(val)
        total_seconds = round(frac * 86400)
        h = total_seconds // 3600
        m = (total_seconds % 3600) // 60
        return f"{h:02d}:{m:02d}"
    except ValueError:
        return None


def read_xlsx(path: Path) -> tuple[dict, dict[int, dict[int, str]]]:
    """Читает xlsx, возвращает (header_dict, rows_dict)."""
    with zipfile.ZipFile(path) as z:
        strings: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            with z.open("xl/sharedStrings.xml") as f:
                tree = ET.parse(f)
                ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
                for si in tree.getroot().iter(f"{ns}si"):
                    t = "".join(
                        (el.text or "")
                        for el in si.iter(f"{ns}t")
                    )
                    strings.append(t)

        sheet_file = "xl/worksheets/sheet1.xml"
        with z.open(sheet_file) as f:
            tree = ET.parse(f)
            ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
            rows_data: dict[int, dict[int, str]] = {}
            for c in tree.getroot().iter(f"{ns}c"):
                ref = c.get("r", "")
                if not ref:
                    continue
                m = re.match(r"([A-Z]+)(\d+)", ref)
                if not m:
                    continue
                col_idx = col_to_index(m.group(1))
                row_idx = int(m.group(2))
                t = c.get("t", "")
                v_el = c.find(f"{ns}v")
                if v_el is None:
                    val = ""
                elif t == "s":
                    val = strings[int(v_el.text)]
                else:
                    val = v_el.text or ""
                rows_data.setdefault(row_idx, {})[col_idx] = val

    header = rows_data.get(1, {})
    return header, rows_data


# ─── Организации → org_id маппинг ───────────────────────────────────────────

def build_org_mapping(inc_rows: dict, korgau_rows: dict) -> dict[str, str]:
    """Собирает все уникальные организации и присваивает им org_id."""
    orgs: set[str] = set()
    for row_num, row in inc_rows.items():
        if row_num == 1:
            continue
        name = row.get(30, "").strip()
        if name:
            orgs.add(name)
    for row_num, row in korgau_rows.items():
        if row_num == 1:
            continue
        name = row.get(5, "").strip()
        if name:
            orgs.add(name)
    return {name: f"org_{i+1:02d}" for i, name in enumerate(sorted(orgs))}


# ─── Тип инцидента ──────────────────────────────────────────────────────────

def determine_incident_type(row: dict[int, str]) -> str:
    """
    Определяет тип инцидента по флагам и классификациям.
    Приоритет: НС > ДТП > Пожар > Инцидент > Микротравма > default
    """
    ns_flag = row.get(31, "").strip()
    dtp_flag = row.get(16, "").strip()
    fire_flag = row.get(38, "").strip()
    incident_flag = row.get(17, "").strip()
    med_flag = row.get(35, "").strip()
    klass_ns = row.get(23, "").strip()
    klass_omp = row.get(24, "").strip()

    if ns_flag == "1":
        return "НС (несчастный случай)"
    if dtp_flag == "1":
        return "ДТП"
    if fire_flag == "1":
        return "Пожар/Возгорание"
    if incident_flag == "1":
        return "Опасная ситуация"
    if med_flag == "1":
        # Уточнение по классификации
        if "микротравм" in klass_omp.lower():
            return "Микротравма"
        if "ухудшение здоровья" in klass_ns.lower() or "ухудшение здоровья" in row.get(40, "").lower():
            return "Ухудшение здоровья"
        return "Микротравма"
    return "Опасная ситуация"


# ─── Статус устранения Коргау ────────────────────────────────────────────────

def determine_korgau_resolved(row: dict[int, str]) -> str:
    val = row.get(13, "").strip()
    if val == "1":
        return "Устранено"
    if val == "0":
        return "В работе"
    return "В работе"


# ─── Тип наблюдения Коргау ───────────────────────────────────────────────────

OBS_TYPE_MAP = {
    "Хорошая практика": "Хорошая практика",
    "Небезопасное поведение": "Нарушение",
    "Небезопасное действие": "Нарушение",
    "Небезопасное условие": "Нарушение",
    "Опасный фактор": "Нарушение",
    "Опасный случай": "Нарушение",
    "Предложение (инициатива)": "Предложение",
}


# ─── Конвертация Происшествий ────────────────────────────────────────────────

def convert_incidents(path: Path, org_map: dict[str, str]) -> list[dict]:
    _, rows = read_xlsx(path)
    result = []
    for row_num in sorted(rows.keys()):
        if row_num == 1:
            continue
        row = rows[row_num]

        date_str = excel_serial_to_date(row.get(11, ""))
        if not date_str:
            continue

        time_str = excel_serial_to_time(row.get(5, "")) or "00:00"
        inc_type = determine_incident_type(row)
        org_name = row.get(30, "").strip()
        org_id = org_map.get(org_name, "org_00")
        location = row.get(28, "").strip() or row.get(48, "").strip() or "Не указано"
        description = row.get(27, "").strip().replace("\n", " ")
        cause = row.get(40, "").strip() or row.get(23, "").strip() or "Не установлена"
        status = "Закрыто" if row.get(12, "").strip() else "В работе"

        result.append({
            "id": str(uuid.uuid4()),
            "date": date_str,
            "time": time_str,
            "type": inc_type,
            "org_id": org_id,
            "org_name": org_name,
            "location": location,
            "description": description,
            "cause": cause,
            "status": status,
        })
    return result


# ─── Конвертация Коргау ──────────────────────────────────────────────────────

def convert_korgau(path: Path, org_map: dict[str, str]) -> list[dict]:
    _, rows = read_xlsx(path)
    result = []
    for row_num in sorted(rows.keys()):
        if row_num == 1:
            continue
        row = rows[row_num]

        date_str = excel_serial_to_date(row.get(3, ""))
        if not date_str:
            continue

        raw_obs_type = row.get(0, "").strip()
        obs_type = OBS_TYPE_MAP.get(raw_obs_type, "Нарушение")
        category = row.get(2, "").strip() or "Прочее"
        org_name = row.get(5, "").strip()
        org_id = org_map.get(org_name, "org_00")
        description = (row.get(15, "").strip() or row.get(6, "").strip()).replace("\n", " ")
        resolved = determine_korgau_resolved(row)

        result.append({
            "id": str(uuid.uuid4()),
            "date": date_str,
            "obs_type": obs_type,
            "org_id": org_id,
            "org_name": org_name,
            "category": category,
            "description": description,
            "resolved": resolved,
        })
    return result


# ─── Запись CSV ──────────────────────────────────────────────────────────────

def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})
    print(f"  Written {len(rows)} rows → {path.name}")


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    # Найти xlsx Коргау (не Происшествия)
    korgau_xlsx = None
    for p in HACKATHON_DIR.glob("*.xlsx"):
        if "роишествия" not in p.name:
            korgau_xlsx = p
            break

    if not INC_XLSX.exists():
        print(f"❌ Не найден файл: {INC_XLSX}")
        return
    if korgau_xlsx is None:
        print(f"❌ Не найден файл Коргау в {HACKATHON_DIR}")
        return

    print(f"📂 Incidents xlsx: {INC_XLSX.name}")
    print(f"📂 Korgau xlsx:    {korgau_xlsx.name}")

    # Читаем оба xlsx для построения общего маппинга организаций
    _, inc_rows = read_xlsx(INC_XLSX)
    _, korgau_rows = read_xlsx(korgau_xlsx)
    org_map = build_org_mapping(inc_rows, korgau_rows)
    print(f"🏢 Организаций найдено: {len(org_map)}")
    for name, oid in sorted(org_map.items(), key=lambda x: x[1]):
        print(f"   {oid}: {name}")

    # Конвертируем
    print("\n🔄 Конвертация incidents...")
    real_incidents = convert_incidents(INC_XLSX, org_map)
    print(f"   Реальных инцидентов: {len(real_incidents)}")

    print("🔄 Конвертация korgau...")
    real_korgau = convert_korgau(korgau_xlsx, org_map)
    print(f"   Реальных наблюдений: {len(real_korgau)}")

    # Бэкапим синтетику если ещё не сделано
    if not INC_SYNTH.exists() and INC_OUT.exists():
        import shutil
        shutil.copy(INC_OUT, INC_SYNTH)
        shutil.copy(KORGAU_OUT, KORGAU_SYNTH)
        print("\n💾 Синтетические данные сохранены как backup")

    # Загружаем синтетику
    synth_incidents = read_csv(INC_SYNTH) if INC_SYNTH.exists() else []
    synth_korgau = read_csv(KORGAU_SYNTH) if KORGAU_SYNTH.exists() else []
    print(f"\n📊 Синтетика: {len(synth_incidents)} инцидентов + {len(synth_korgau)} наблюдений")

    # Объединяем (синтетика 2023-2024 + реальные 2025)
    all_incidents = synth_incidents + real_incidents
    all_korgau = synth_korgau + real_korgau

    # Сортируем по дате
    all_incidents.sort(key=lambda r: r.get("date", ""))
    all_korgau.sort(key=lambda r: r.get("date", ""))

    # Пишем итоговые CSV
    print(f"\n✍️  Запись итоговых CSV...")
    inc_fields = ["id", "date", "time", "type", "org_id", "org_name", "location", "description", "cause", "status"]
    korgau_fields = ["id", "date", "obs_type", "org_id", "org_name", "category", "description", "resolved"]
    write_csv(INC_OUT, all_incidents, inc_fields)
    write_csv(KORGAU_OUT, all_korgau, korgau_fields)

    # Статистика
    print(f"\n✅ Итого:")
    print(f"   incidents.csv:    {len(all_incidents)} строк ({len(synth_incidents)} синт. + {len(real_incidents)} реал.)")
    print(f"   korgau_cards.csv: {len(all_korgau)} строк ({len(synth_korgau)} синт. + {len(real_korgau)} реал.)")

    # Сохраняем маппинг организаций для фронтенда
    org_mapping_path = DATA_DIR / "org_mapping.py"
    with open(org_mapping_path, "w", encoding="utf-8") as f:
        f.write("# Автогенерированный маппинг организаций из реальных данных\n")
        f.write("ORG_MAP = {\n")
        for name, oid in sorted(org_map.items(), key=lambda x: x[1]):
            f.write(f'    "{oid}": "{name}",\n')
        f.write("}\n")
    print(f"\n📝 Маппинг организаций: {org_mapping_path.name}")


if __name__ == "__main__":
    main()
