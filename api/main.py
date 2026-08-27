"""Stat Sightline API — FastAPI gateway from PostgreSQL to the Next.js frontend.

Run:
    uvicorn api.main:app --reload --port 8000
Docs:
    http://localhost:8000/docs
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import ask, pitches, standings

app = FastAPI(title="Stat Sightline API", version="0.1.0")

# Allow the Next.js dev server (and a configurable prod origin) to call us.
origins = os.getenv("FRONTEND_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(ask.router)
app.include_router(pitches.router)
app.include_router(standings.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
