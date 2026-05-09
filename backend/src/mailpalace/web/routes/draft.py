"""Draft generation endpoint."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from mailpalace.pipeline.draft import generate_draft

router = APIRouter()


class DraftRequest(BaseModel):
    email_id: int
    instructions: str | None = None


class DraftResponse(BaseModel):
    draft_id: int
    body: str
    language: str
    provider_used: str
    created_at: datetime


@router.post(
    "/draft",
    response_model=DraftResponse,
    summary="Generate a reply draft",
    description=(
        "Calls the active LLM provider to write a draft reply in the source "
        "language of the incoming email. Optional `instructions` steer tone "
        "or content."
    ),
)
async def post_draft(req: DraftRequest) -> DraftResponse:
    """Run the draft pipeline and return the generated reply."""
    draft = await generate_draft(req.email_id, req.instructions)
    if draft is None:
        raise HTTPException(status_code=404, detail="Email not found")
    return DraftResponse(
        draft_id=draft.id,
        body=draft.body,
        language=draft.language_code,
        provider_used=draft.provider_used,
        created_at=draft.created_at,
    )
