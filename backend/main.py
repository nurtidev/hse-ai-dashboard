import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import incidents, korgau, recommendations, kpi

app = FastAPI(
    title="HSE AI Dashboard API",
    description="AI-аналитический модуль для системы охраны труда КМГ-Кумколь",
    version="1.0.0",
)

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.railway\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(incidents.router)
app.include_router(korgau.router)
app.include_router(recommendations.router)
app.include_router(kpi.router)


@app.get("/")
def root():
    return {"status": "ok", "docs": "/docs"}
