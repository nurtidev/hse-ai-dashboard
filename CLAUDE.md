# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
# Run dev server
cd backend && .venv/bin/uvicorn main:app --reload
# → http://localhost:8000/docs

# Setup (first time)
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

### Frontend
```bash
cd frontend && npm run dev      # → http://localhost:3000
cd frontend && npm run build    # Production build
cd frontend && npm run lint     # ESLint
```

### Environment
- Backend: `backend/.env` with `ANTHROPIC_API_KEY=...` (copy from `backend/.env.example`)
- Frontend: `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000`

## Architecture

### Backend (`FastAPI + Python 3.9`)

Entry point: `backend/main.py` — registers CORS + all routers.

**Request flow:** HTTP → `routers/` → `data_loader.py` (reads CSV based on `config_store.get_dataset()`) → `ml/` modules → response.

Key modules:
- `data_loader.py` — centralized CSV loading; respects dataset mode (`combined`/`real`/`synthetic`) and merges live simulated incidents from `simulation_store.py`
- `config_store.py` — global dataset mode manager (default: `combined`)
- `ml/predictor.py` — Holt-Winters ETS forecasting; auto-trims incomplete trailing months (threshold: < 40% of global monthly median); falls back to linear trend if data is insufficient
- `ml/alerts.py` — 4-level alert system (CRITICAL/HIGH/MEDIUM/LOW) based on violation frequency and trends
- `ml/risk_scorer.py` — risk index 0-100: 60% severity-weighted incidents + 40% Korgau violations

**Claude API usage** (model: `claude-haiku-4-5-20251001`):
- `routers/recommendations.py` — 5 AI safety recommendations, 1-hour in-memory cache
- `routers/chat.py` — AI analyst chatbot with real-time data context injected into system prompt
- `routers/incidents.py` — NLP incident classification (`POST /api/incidents/classify`)

### Frontend (`Next.js app router + TypeScript`)

All pages are in `frontend/app/` and use `"use client"`. API base URL comes from `NEXT_PUBLIC_API_URL`.

Pages map directly to API domains:
- `page.tsx` → overview (KPIs + alerts, hits `/api/kpi` + `/api/korgau/alerts`)
- `incidents/page.tsx` → `/api/incidents/*` (stats, forecast, top-risks, classify)
- `korgau/page.tsx` → `/api/korgau/*` (stats, ratings, alerts, correlation)
- `kpi/page.tsx` → `/api/kpi/`
- `recommendations/page.tsx` → `/api/recommendations/`
- `chat/page.tsx` → `POST /api/chat/`

`components/Sidebar.tsx` contains the dataset switcher (calls `POST /api/config/dataset`).

Charts use **Recharts**. Styling uses **Tailwind CSS 4**.

### Data

CSV files in `backend/data/`:
- `incidents.csv` — 832 rows (combined synthetic + real, 2023–2026)
- `korgau_cards.csv` — 11,115 behavioral audit observations
- `*_real.csv` / `*_synth.csv` — split subsets for dataset switching
- `convert_xlsx.py` — converts raw xlsx from `файлы хакатон/` to CSV
- `generate.py` — synthetic data generator

### Deployment

Both backend and frontend deploy to Railway separately. Frontend communicates with backend via `NEXT_PUBLIC_API_URL` env var.
