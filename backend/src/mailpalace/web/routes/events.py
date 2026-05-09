"""Server-Sent Events stream.

v0 emits a heartbeat every 15s so clients can prove the connection is alive.
v0.1 adds the real topic set: ``inbox.new``, ``triage.done.{id}``,
``ingest.run.{account_id}``, ``draft.{id}`` (token stream).
"""

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()


async def _heartbeat() -> AsyncIterator[bytes]:
    while True:
        payload = {"type": "heartbeat"}
        yield f"event: heartbeat\ndata: {json.dumps(payload)}\n\n".encode()
        await asyncio.sleep(15)


@router.get(
    "/events",
    summary="Server-Sent Events stream",
    description="Long-lived SSE connection. v0 emits a heartbeat every 15s.",
)
async def get_events() -> StreamingResponse:
    """Open the SSE channel."""
    return StreamingResponse(_heartbeat(), media_type="text/event-stream")
