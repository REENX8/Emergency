"""
realtime.py — In-memory WebSocket broadcast layer (per building).

Connections are bucketed by `building_id`. When a write endpoint mutates
state it calls `broadcast(building_id, type, payload, actor)` and every
connected client receives the event.

Limitations of the in-memory backend:
  - Single-instance only. Multi-instance deploys need a pub/sub layer
    (Redis). Sketched for Phase 3.2; not enabled by default.

Event shape:
  {"type": "incident.created", "payload": {...}, "actor": {...} | None,
   "ts": "<ISO8601 UTC>"}

Auth: optional `?token=...` query parameter resolves to a User; without it
the connection is treated as anonymous read-only (still gets all events).
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from auth import _decode_token  # noqa: PLC2701 — internal helper, intentional
from database import SessionLocal
from models import User

logger = logging.getLogger(__name__)


# building_id -> set of WebSocket connections
_connections: dict[int, set[WebSocket]] = {}
_lock = asyncio.Lock()


def _resolve_user_from_token(token: Optional[str]) -> Optional[User]:
    """Best-effort: bad/missing token → None (anonymous), not 401."""
    if not token:
        return None
    try:
        payload = _decode_token(token)
        email = payload.get("sub")
        if not email:
            return None
        db: Session = SessionLocal()
        try:
            return db.query(User).filter(User.email == email).first()
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        logger.debug("ws token resolve failed: %s", exc)
        return None


async def connect(ws: WebSocket, building_id: int, token: Optional[str]) -> Optional[User]:
    await ws.accept()
    async with _lock:
        _connections.setdefault(building_id, set()).add(ws)
    user = _resolve_user_from_token(token)
    return user


async def disconnect(ws: WebSocket, building_id: int) -> None:
    async with _lock:
        bucket = _connections.get(building_id)
        if bucket and ws in bucket:
            bucket.remove(ws)
            if not bucket:
                _connections.pop(building_id, None)


async def broadcast(
    building_id: int,
    event_type: str,
    payload: dict,
    actor: Optional[User] = None,
) -> None:
    """Push an event to every client subscribed to this building.

    Failing sockets are silently dropped — disconnect cleanup will handle
    them properly on the next iteration.
    """
    bucket = _connections.get(building_id)
    if not bucket:
        return
    message = {
        "type":    event_type,
        "payload": payload,
        "actor":   ({"id": actor.id, "email": actor.email, "role": actor.role}
                    if actor else None),
        "ts":      datetime.now(timezone.utc).isoformat(),
    }
    text = json.dumps(message, default=str)
    stale: list[WebSocket] = []
    for ws in list(bucket):
        try:
            await ws.send_text(text)
        except Exception:
            stale.append(ws)
    if stale:
        async with _lock:
            for ws in stale:
                bucket.discard(ws)


def broadcast_sync(
    building_id: int,
    event_type: str,
    payload: dict,
    actor: Optional[User] = None,
) -> None:
    """Sync wrapper for endpoints that aren't already async. Schedules the
    broadcast on the running event loop without blocking the request."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No loop (e.g. test setup); silently skip — caller's commit still happens.
        return
    loop.create_task(broadcast(building_id, event_type, payload, actor))


def active_connections(building_id: int) -> int:
    """Diagnostic helper — used in tests + admin dashboards."""
    return len(_connections.get(building_id, set()))


async def run_ws_loop(ws: WebSocket, building_id: int) -> None:
    """Default handler: accept inbound pings, drop on disconnect.

    Clients only need to receive events; inbound messages are ignored
    except for connection liveness.
    """
    try:
        while True:
            # Wait for any inbound text — typically a ping or just keeps the
            # socket alive. We don't echo anything.
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.debug("ws loop ended: %s", exc)
    finally:
        await disconnect(ws, building_id)
