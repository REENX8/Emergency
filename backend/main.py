"""
main.py — FastAPI server for the Building Evacuation Simulation

Top-level endpoints:
  GET  /health             → liveness check
  GET  /weather            → current weather from Thai Met Dept API
  POST /metrics/web-vitals → frontend Core Web Vitals sink

Multi-building endpoints (database-backed):
  /buildings/*                  → routers/buildings.py
  /buildings/{id}/incidents/*   → routers/incidents.py
  /buildings/{id}/analysis      → routers/analysis.py

Run with:
  uvicorn main:app --reload --port 8000
"""

import asyncio
import json
import logging
import logging.config
import os
import time
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

import httpx
from fastapi import FastAPI, Query, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

import realtime
import storage
import weather as weather_mod
from database import get_db_health, init_db
from rate_limit import limiter
from routers import analysis as analysis_router
from routers import auth as auth_router
from routers import buildings as buildings_router
from routers import incidents as incidents_router
from weather import fetch_weather

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            log["exc"] = self.formatException(record.exc_info)
        # Attach request_id if propagated via LogRecord extra
        if hasattr(record, "request_id"):
            log["request_id"] = record.request_id
        return json.dumps(log, ensure_ascii=False)


_use_json_logs = os.getenv("LOG_FORMAT", "json").lower() == "json"
if _use_json_logs:
    _handler = logging.StreamHandler()
    _handler.setFormatter(_JsonFormatter())
    logging.root.handlers = [_handler]
    logging.root.setLevel(logging.INFO)
else:
    logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise DB tables and a pooled httpx client; close pool on shutdown."""
    init_db()
    # Register the main loop so sync route handlers (threadpool) can schedule
    # WebSocket broadcasts via realtime.broadcast_sync.
    realtime.set_event_loop(asyncio.get_running_loop())
    async with httpx.AsyncClient(timeout=5.0) as client:
        weather_mod.set_http_client(client)
        try:
            yield
        finally:
            weather_mod.set_http_client(None)
            realtime.set_event_loop(None)


app = FastAPI(
    title="Building Evacuation Simulation API",
    description="Graph-based evacuation routing with dynamic fire/smoke/crowd conditions",
    version="2.0.0",
    lifespan=lifespan,
)

# Rate limiting — slowapi reads decorators on routes; the middleware
# threads request context so per-IP buckets work. Limits live in the route
# decorators themselves (see routers/auth.py, routers/incidents.py).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS — set ALLOWED_ORIGINS env var to a comma-separated list of origins.
# Use "*" (the default) to allow all origins; JWT auth is header-based so
# allow_credentials must be False when the wildcard is active.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
_wildcard = _allowed_origins == ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=not _wildcard,  # credentials=True incompatible with "*"
    allow_methods=["*"],
    allow_headers=["*"],
)


class WebVitalsMetric(BaseModel):
    name: str
    value: float
    rating: str | None = None
    id: str | None = None
    navType: str | None = None


@app.middleware("http")
async def _request_context_middleware(request: Request, call_next):
    """Attach X-Request-ID and X-Process-Time-Ms; emit structured access log."""
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    request.state.request_id = request_id

    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000.0

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.1f}"

    log_extra = {"request_id": request_id}
    log_msg = "%s %s %d %.1fms"
    args = (request.method, request.url.path, response.status_code, elapsed_ms)
    if elapsed_ms > 500:
        logger.warning(log_msg, *args, extra=log_extra)
    else:
        logger.info(log_msg, *args, extra=log_extra)
    return response


@app.middleware("http")
async def _security_headers_middleware(request: Request, call_next):
    """Add security headers to every response."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=()",
    )
    # HSTS only over HTTPS — skip for local dev
    if request.url.scheme == "https":
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
    return response


# Serve uploaded floor plan images (local dev only — Supabase mode uses CDN URLs)
if not storage.is_supabase_configured():
    UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.post("/metrics/web-vitals", status_code=204, tags=["metrics"])
async def record_web_vitals(metric: WebVitalsMetric):
    """Lightweight sink for Core Web Vitals (CLS/FCP/INP/LCP/TTFB). Logs only."""
    logger.info(
        "vitals %s=%.1f rating=%s nav=%s",
        metric.name,
        metric.value,
        metric.rating or "-",
        metric.navType or "-",
    )
    return None


@app.middleware("http")
async def _expose_custom_headers(request: Request, call_next):
    """Allow the browser to read custom response headers cross-origin."""
    response = await call_next(request)
    existing = response.headers.get("Access-Control-Expose-Headers", "")
    want = {"X-Process-Time-Ms", "X-Request-ID"}
    current = {h.strip() for h in existing.split(",") if h.strip()}
    merged = sorted(current | want)
    response.headers["Access-Control-Expose-Headers"] = ", ".join(merged)
    return response


# Include routers
app.include_router(auth_router.router)
app.include_router(buildings_router.router)
app.include_router(incidents_router.router)
app.include_router(analysis_router.router)


# ---------------------------------------------------------------------------
# Top-level endpoints
# ---------------------------------------------------------------------------


@app.get("/health", tags=["meta"])
def health():
    """Liveness + readiness probe — checks DB connectivity."""
    db_status, db_detail = get_db_health()
    payload = {
        "status": "ok" if db_status else "degraded",
        "service": "evacuation-simulation",
        "db": "ok" if db_status else f"error: {db_detail}",
    }
    status_code = 200 if db_status else 503
    return JSONResponse(content=payload, status_code=status_code)


@app.get("/weather", tags=["meta"])
async def get_weather():
    """Fetch current weather from the Thai Meteorological Department API."""
    return await fetch_weather()


# ---------------------------------------------------------------------------
# WebSocket — per-building event stream (Phase 3 realtime collaboration)
# ---------------------------------------------------------------------------


@app.websocket("/buildings/{building_id}/ws")
async def building_events(
    websocket: WebSocket,
    building_id: int,
    token: str | None = Query(default=None),
):
    """Subscribe to incident / node / edge events for a building.

    Anonymous connections are allowed (mobile user-app uses this).
    Provide `?token=<JWT>` to be attributed in the `actor` field of
    outbound events.
    """
    await realtime.connect(websocket, building_id, token)
    await realtime.run_ws_loop(websocket, building_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
