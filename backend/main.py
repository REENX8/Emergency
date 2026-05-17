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

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import init_db
import storage
import weather as weather_mod
from weather import fetch_weather
from rate_limit import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from routers import buildings as buildings_router
from routers import incidents as incidents_router
from routers import analysis as analysis_router
from routers import auth as auth_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise DB tables and a pooled httpx client; close pool on shutdown."""
    init_db()
    async with httpx.AsyncClient(timeout=5.0) as client:
        weather_mod.set_http_client(client)
        try:
            yield
        finally:
            weather_mod.set_http_client(None)


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
    allow_credentials=not _wildcard,   # credentials=True incompatible with "*"
    allow_methods=["*"],
    allow_headers=["*"],
)


class WebVitalsMetric(BaseModel):
    name:    str
    value:   float
    rating:  Optional[str] = None
    id:      Optional[str] = None
    navType: Optional[str] = None


@app.middleware("http")
async def _timing_middleware(request: Request, call_next):
    """Attach X-Process-Time-Ms header and log slow requests (>500ms)."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.1f}"
    if elapsed_ms > 500:
        logger.warning(
            "slow request %s %s took %.1fms",
            request.method, request.url.path, elapsed_ms,
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
        metric.name, metric.value, metric.rating or "-", metric.navType or "-",
    )
    return None


# Allow the browser to read the timing header from cross-origin responses
# (required because /metrics/web-vitals + everything else is on a different
# host than the React app in production).
@app.middleware("http")
async def _expose_timing_header(request: Request, call_next):
    response = await call_next(request)
    existing = response.headers.get("Access-Control-Expose-Headers", "")
    headers = [h for h in existing.split(",") if h.strip()]
    if "X-Process-Time-Ms" not in headers:
        headers.append("X-Process-Time-Ms")
    response.headers["Access-Control-Expose-Headers"] = ", ".join(headers)
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
    return {"status": "ok", "service": "evacuation-simulation"}


@app.get("/weather", tags=["meta"])
async def get_weather():
    """Fetch current weather from the Thai Meteorological Department API."""
    return await fetch_weather()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
