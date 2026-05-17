"""
rate_limit.py — Shared SlowAPI limiter.

Limits live as decorators on individual routes (see routers/*). The
limiter is registered into the FastAPI app from main.py.

Key strategy:
  - default: client IP (`get_remote_address`)
  - per-user: routes that depend on auth can pass `key_func=user_or_ip`
    to bucket authenticated users separately.

Tests can disable rate limiting by setting `RATE_LIMIT_ENABLED=0`.
"""

import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "1") != "0"


def user_or_ip(request: Request) -> str:
    """Key by JWT subject when present, fall back to remote address."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return f"user:{auth[7:][:40]}"  # truncate to keep key bounded
    return get_remote_address(request)


limiter = Limiter(
    key_func=get_remote_address,
    enabled=_ENABLED,
    # NOTE: headers_enabled=True breaks FastAPI routes that return Pydantic
    # models — slowapi tries to inject headers before FastAPI serializes.
    # Clients should rely on the 429 status + Retry-After from the handler.
)
