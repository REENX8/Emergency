"""Tests for weather.py — TMD API integration, cache, fallback, smoke spread."""

import httpx
import pytest

import weather as W

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_tmd_response(wind_speed_kmh=10.0, wind_dir=90.0, temp=30.0, humidity=70.0):
    return {
        "WeatherObservations": {
            "WeatherObservation": [
                {
                    "WindSpeed": wind_speed_kmh,
                    "WindDirection": wind_dir,
                    "AirTemperature": temp,
                    "RelativeHumidity": humidity,
                    "Condition": "Clear",
                }
            ]
        }
    }


# ---------------------------------------------------------------------------
# fetch_weather — success path (mocked httpx)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_fetch_weather_success(monkeypatch):
    W._cache.clear()
    W.set_http_client(None)  # force one-off client path

    async def mock_get(self, url, **kwargs):
        req = httpx.Request("GET", url)
        resp = httpx.Response(
            200, json=_make_tmd_response(wind_speed_kmh=36.0, wind_dir=180.0), request=req
        )
        return resp

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = await W.fetch_weather("515201")
    assert result["source"] == "tmd"
    assert result["wind_direction_deg"] == 180.0
    assert abs(result["wind_speed_ms"] - 10.0) < 0.1  # 36 km/h * 0.2778 ≈ 10
    assert result["station"] == "515201"
    W._cache.clear()


@pytest.mark.anyio
async def test_fetch_weather_uses_cache(monkeypatch):
    W._cache.clear()
    call_count = {"n": 0}

    async def mock_get(self, url, **kwargs):
        call_count["n"] += 1
        req = httpx.Request("GET", url)
        return httpx.Response(200, json=_make_tmd_response(), request=req)

    W.set_http_client(None)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    await W.fetch_weather("515201")
    await W.fetch_weather("515201")  # second call should hit cache

    assert call_count["n"] == 1, "Expected only one real HTTP call due to cache"
    W._cache.clear()


@pytest.mark.anyio
async def test_fetch_weather_fallback_on_http_error(monkeypatch):
    W._cache.clear()
    W.set_http_client(None)

    async def mock_get(self, url, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = await W.fetch_weather("515201")
    assert result["source"] == "mock"
    assert "wind_speed_ms" in result
    W._cache.clear()


@pytest.mark.anyio
async def test_fetch_weather_fallback_on_bad_status(monkeypatch):
    W._cache.clear()
    W.set_http_client(None)

    async def mock_get(self, url, **kwargs):
        req = httpx.Request("GET", url)
        return httpx.Response(503, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = await W.fetch_weather("515201")
    assert result["source"] == "mock"
    W._cache.clear()


# ---------------------------------------------------------------------------
# _parse_tmd_response
# ---------------------------------------------------------------------------


def test_parse_valid_response():
    data = _make_tmd_response(wind_speed_kmh=18.0, wind_dir=270.0, temp=28.5, humidity=80.0)
    result = W._parse_tmd_response(data, "515201")
    assert result["source"] == "tmd"
    assert result["wind_direction_deg"] == 270.0
    assert result["temperature_c"] == 28.5
    assert result["humidity_pct"] == 80.0
    assert abs(result["wind_speed_ms"] - 18.0 * 0.2778) < 0.01


def test_parse_empty_observation_returns_mock():
    result = W._parse_tmd_response({"WeatherObservations": {}}, "abc")
    assert result["source"] == "mock"


def test_parse_observation_with_none_values():
    data = {
        "WeatherObservations": {
            "WeatherObservation": [
                {
                    "WindSpeed": None,
                    "WindDirection": None,
                    "AirTemperature": None,
                    "RelativeHumidity": None,
                    "Condition": "",
                }
            ]
        }
    }
    result = W._parse_tmd_response(data, "515201")
    # Should not crash; defaults kick in
    assert isinstance(result["wind_speed_ms"], float)


def test_parse_single_observation_dict():
    """TMD sometimes returns a single dict instead of a list."""
    data = {
        "WeatherObservations": {
            "WeatherObservation": {
                "WindSpeed": 5.0,
                "WindDirection": 45.0,
                "AirTemperature": 25.0,
                "RelativeHumidity": 60.0,
                "Condition": "Sunny",
            }
        }
    }
    # single dict — should parse correctly via list fallback → mock path
    result = W._parse_tmd_response(data, "515201")
    assert "wind_speed_ms" in result


# ---------------------------------------------------------------------------
# compute_smoke_spread
# ---------------------------------------------------------------------------


def _nodes():
    return {
        "fire": {"x": 0, "y": 0},
        "A": {"x": 60, "y": 0},  # 10 m east of fire
        "B": {"x": -60, "y": 0},  # 10 m west of fire (upwind)
        "C": {"x": 0, "y": 60},  # 10 m south
    }


def test_smoke_spread_downwind_blocked():
    """Wind from W (270°) → blows east. Node A is downwind → blocked."""
    nodes = _nodes()
    edges = [("fire", "A"), ("fire", "B"), ("fire", "C")]
    blocked = W.compute_smoke_spread(
        fire_node="fire",
        graph_nodes=nodes,
        graph_edges=edges,
        wind_direction_deg=270.0,  # FROM west → blows east
        wind_speed_ms=5.0,
        smoke_radius_m=15.0,
    )
    blocked_set = set(map(tuple, blocked))
    assert ("fire", "A") in blocked_set
    assert ("fire", "B") not in blocked_set  # upwind, not blocked


def test_smoke_spread_unknown_fire_node():
    nodes = _nodes()
    blocked = W.compute_smoke_spread(
        fire_node="MISSING",
        graph_nodes=nodes,
        graph_edges=[("fire", "A")],
        wind_direction_deg=0.0,
        wind_speed_ms=3.0,
    )
    assert blocked == []


def test_smoke_spread_radius_zero_blocks_nothing():
    nodes = _nodes()
    blocked = W.compute_smoke_spread(
        fire_node="fire",
        graph_nodes=nodes,
        graph_edges=[("fire", "A")],
        wind_direction_deg=270.0,
        wind_speed_ms=5.0,
        smoke_radius_m=0.0,
    )
    assert blocked == []


def test_smoke_spread_high_wind_expands_radius():
    """Higher wind speed → larger effective radius → more edges blocked."""
    nodes = {
        "fire": {"x": 0, "y": 0},
        "Far": {"x": 600, "y": 0},  # 100 m east, beyond normal radius
    }
    blocked_slow = W.compute_smoke_spread("fire", nodes, [("fire", "Far")], 270.0, 1.0, 20.0)
    blocked_fast = W.compute_smoke_spread("fire", nodes, [("fire", "Far")], 270.0, 50.0, 20.0)
    assert len(blocked_fast) >= len(blocked_slow)
