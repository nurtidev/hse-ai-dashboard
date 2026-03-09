# HSE AI Dashboard

AI-аналитический модуль для системы охраны труда (ОТиПБ).
Хакатон Astana Hub — «Внедрение ИИ в сфере охраны труда», клиент: КМГ-Кумколь.

## Что делает система

- Анализ исторических данных о происшествиях и поведенческих аудитах
- Предиктивная модель: прогноз инцидентов на 3/6/12 месяцев
- NLP-классификация инцидентов по текстовым описаниям
- Система алертов по нарушениям (4 уровня критичности)
- Рейтинг организаций по уровню безопасности
- AI-рекомендации и расчёт экономического эффекта

## Структура проекта

```
hse-ai-dashboard/
├── backend/              # FastAPI + ML модели
│   ├── data/             # Синтетические датасеты (CSV)
│   ├── ml/               # Предиктивные модели, NLP, risk scoring
│   ├── routers/          # API эндпоинты
│   └── main.py
├── frontend/             # Next.js дашборд
│   ├── app/
│   └── components/
└── README.md
```

## API эндпоинты

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/incidents/stats` | Статистика происшествий за период |
| GET | `/api/incidents/predict` | Прогноз на 3/6/12 месяцев |
| GET | `/api/incidents/top-risks` | Топ-5 зон риска |
| GET | `/api/korgau/alerts` | Активные алерты (4 уровня) |
| GET | `/api/korgau/ratings` | Рейтинг организаций |
| GET | `/api/recommendations` | AI-рекомендации |
| GET | `/api/kpi` | Экономический эффект (тенге + люди) |

## Стек

| Слой | Технологии |
|------|-----------|
| Backend | Python 3.11 + FastAPI + Pandas |
| ML | Prophet (прогноз) + scikit-learn (кластеризация) |
| NLP | Claude API (claude-haiku-4-5) |
| Frontend | Next.js 14 + Tailwind CSS + Recharts |
| БД | SQLite |
| Алерты | Telegram Bot API (опционально) |

## Запуск

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Документация API доступна по адресу: `http://localhost:8000/docs`

## Хакатон

- Дедлайн подачи заявки: 18 марта 2026
- Demo Day: 30 марта 2026
