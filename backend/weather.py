"""
weather.py — Thai Meteorological Department (TMD) API integration

TMD Open Data API: https://data.tmd.go.th/api/
Endpoint used: /WeatherObservation (latest station observations)

The wind vector from the API is used to model smoke spread direction:
  - Wind blows FROM direction_deg TOWARD (direction_deg + 180°)
  - Edges roughly aligned with the wind direction get a smoke propagation
    bonus (smoke travels faster along wind vector)

If the TMD API is unavailable, the module falls back to a cached/mock
response so the simulation continues to work offline.
"""

import logging
import math
import time

import httpx

logger = logging.getLogger(__name__)

# TMD Open Data base URL (public, no auth required for basic observations)
TMD_BASE = "https://data.tmd.go.th/api/Weather/v1/WeatherObservation"

# Bangkok station ID (used as default building location)
DEFAULT_STATION = "515201"  # Bangna, Bangkok

# Fallback mock weather when API is down
_MOCK_WEATHER = {
    "wind_speed_ms": 3.5,
    "wind_direction_deg": 135,  # SE wind → blows toward NW
    "temperature_c": 32.0,
    "humidity_pct": 75,
    "description": "Partly cloudy (offline fallback)",
    "station": DEFAULT_STATION,
    "source": "mock",
}

# Module-level pooled httpx client (initialised by lifespan in main.py).
# Reusing the connection pool avoids per-request TCP/TLS handshakes.
_client: httpx.AsyncClient | None = None

# In-memory TTL cache: station_id -> (expires_at_epoch, weather_dict)
_CACHE_TTL_SECONDS = 60.0
_cache: dict[str, tuple[float, dict]] = {}


def set_http_client(client: httpx.AsyncClient | None) -> None:
    """Inject the shared httpx client (called from FastAPI lifespan)."""
    global _client
    _client = client


def _get_client() -> httpx.AsyncClient:
    """Return the shared client if available, else a one-off client."""
    if _client is not None:
        return _client
    # Fallback for callers outside the FastAPI lifespan (eg. CLI scripts, tests)
    return httpx.AsyncClient(timeout=5.0)


async def fetch_weather(station_id: str = DEFAULT_STATION) -> dict:
    """
    Fetch current weather observation from Thai Meteorological Department API.

    Returns a normalised weather dict:
      wind_speed_ms, wind_direction_deg, temperature_c, humidity_pct,
      description, station, source ("tmd" | "mock")

    Results are cached per station for `_CACHE_TTL_SECONDS`. Falls back to
    `_MOCK_WEATHER` on network error or API failure.
    """
    now = time.time()
    cached = _cache.get(station_id)
    if cached and cached[0] > now:
        return cached[1].copy()

    try:
        client = _get_client()
        if _client is None:
            # one-off client: must async-close after use
            async with client:
                resp = await client.get(
                    TMD_BASE,
                    params={"StationID": station_id, "output": "json"},
                )
                resp.raise_for_status()
                data = resp.json()
        else:
            resp = await client.get(
                TMD_BASE,
                params={"StationID": station_id, "output": "json"},
                timeout=5.0,
            )
            resp.raise_for_status()
            data = resp.json()
        parsed = _parse_tmd_response(data, station_id)
        _cache[station_id] = (now + _CACHE_TTL_SECONDS, parsed)
        return parsed.copy()
    except Exception as exc:
        logger.warning("TMD API unavailable (%s), using mock weather.", exc)
        mock = _MOCK_WEATHER.copy()
        mock["station"] = station_id
        # cache the mock for a short window so we don't hammer a dead endpoint
        _cache[station_id] = (now + _CACHE_TTL_SECONDS, mock)
        return mock.copy()


def _parse_tmd_response(data: dict, station_id: str) -> dict:
    """
    Parse a TMD WeatherObservation JSON response into a normalised dict.
    TMD response structure can vary; we safely get nested fields.
    """
    try:
        obs = data.get("WeatherObservations", {}).get("WeatherObservation", [])
        if isinstance(obs, list) and obs:
            obs = obs[0]
        elif not isinstance(obs, dict):
            raise ValueError("No observation data")

        wind_speed = float(obs.get("WindSpeed", 0) or 0)
        wind_dir = float(obs.get("WindDirection", 0) or 0)
        temp = float(obs.get("AirTemperature", 30) or 30)
        humidity = float(obs.get("RelativeHumidity", 70) or 70)
        desc = obs.get("Condition", "")

        return {
            "wind_speed_ms": round(wind_speed * 0.2778, 2),  # km/h → m/s
            "wind_direction_deg": wind_dir,
            "temperature_c": temp,
            "humidity_pct": humidity,
            "description": desc,
            "station": station_id,
            "source": "tmd",
        }
    except Exception as exc:
        logger.warning("TMD parse error (%s), using mock.", exc)
        return _MOCK_WEATHER.copy()


# ---------------------------------------------------------------------------
# Smoke spread model
# ---------------------------------------------------------------------------


def compute_smoke_spread(
    fire_node: str,
    graph_nodes: dict,  # node_id → {"x": int, "y": int, ...}
    graph_edges: list[tuple],  # [(u, v), ...]
    wind_direction_deg: float,
    wind_speed_ms: float,
    smoke_radius_m: float = 20.0,
) -> list[tuple[str, str]]:
    """
    Determine which edges should be blocked by smoke.

    Model:
      1. Compute the unit wind vector W from wind_direction_deg.
         Wind direction convention: FROM which compass bearing the wind blows.
         So wind blows TOWARD (direction + 180°) mod 360.
      2. For each edge (u, v):
         a. If either endpoint is within smoke_radius_m of the fire, the edge
            is a candidate.
         b. Project the edge midpoint vector (relative to fire) onto W.
            If projection > 0, the edge is downwind → blocked by smoke.
         c. Wind speed scales the effective radius (faster wind → more spread).

    Returns list of (u, v) edge tuples that are smoke-blocked.
    Pixel-to-metre ratio: 6 px/m (matches graph_builder.py layout).
    """
    PX_PER_M = 6.0
    effective_radius_px = smoke_radius_m * PX_PER_M * (1 + wind_speed_ms / 10.0)

    if fire_node not in graph_nodes:
        return []

    fx = graph_nodes[fire_node]["x"]
    fy = graph_nodes[fire_node]["y"]

    # Wind travels TOWARD direction+180
    toward_deg = (wind_direction_deg + 180) % 360
    toward_rad = math.radians(toward_deg)
    # Compass: 0° = N (+y in screen coords is down), 90° = E (+x)
    wx = math.sin(toward_rad)  # east component
    wy = -math.cos(toward_rad)  # north component (screen y flipped)

    blocked = []
    for u, v in graph_edges:
        if u not in graph_nodes or v not in graph_nodes:
            continue
        ux, uy = graph_nodes[u]["x"], graph_nodes[u]["y"]
        vx, vy = graph_nodes[v]["x"], graph_nodes[v]["y"]
        mid_x = (ux + vx) / 2
        mid_y = (uy + vy) / 2

        # Distance from fire to edge midpoint
        dx = mid_x - fx
        dy = mid_y - fy
        dist = math.hypot(dx, dy)

        if dist > effective_radius_px:
            continue  # too far from fire

        # Downwind check: dot product of (midpoint - fire) with wind vector
        projection = dx * wx + dy * wy
        if projection >= 0:
            blocked.append((u, v))

    return blocked
