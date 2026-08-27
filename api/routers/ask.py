"""Natural-language query endpoint — the StatMuse-style answer card.

Thin: parsing lives in src/stat_sightline/query/parse.py, the SQL in run.py.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError

from api.schemas import AskResponse
from src.stat_sightline.query.run import answer

router = APIRouter(prefix="/api/ask", tags=["ask"])


@router.get("", response_model=AskResponse)
def ask(q: str = Query(..., min_length=2, max_length=200, description="plain-English question")) -> AskResponse:
    """Answer one question about the pitch warehouse.

    A question we can parse but can't answer (an unknown player, a stat the
    pitch table doesn't carry) comes back 200 with `notes`/`suggestions` — the
    card shows the miss and what to try instead, which a 404 can't.
    """
    try:
        return AskResponse(**answer(q))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"warehouse unavailable: {exc}") from exc
