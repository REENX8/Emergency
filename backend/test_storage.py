"""Tests for storage.py — local and Supabase backends."""

import importlib

import httpx
import pytest

import storage

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _reload_storage(monkeypatch, supabase_url="", supabase_key=""):
    monkeypatch.setenv("SUPABASE_URL", supabase_url)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", supabase_key)
    importlib.reload(storage)


# ---------------------------------------------------------------------------
# is_supabase_configured
# ---------------------------------------------------------------------------


def test_supabase_not_configured_by_default(monkeypatch):
    _reload_storage(monkeypatch)
    assert not storage.is_supabase_configured()


def test_supabase_configured_when_env_set(monkeypatch):
    _reload_storage(monkeypatch, "https://abc.supabase.co", "secret-key")
    assert storage.is_supabase_configured()


def test_supabase_not_configured_with_only_url(monkeypatch):
    _reload_storage(monkeypatch, "https://abc.supabase.co", "")
    assert not storage.is_supabase_configured()


# ---------------------------------------------------------------------------
# Local backend — _save_local / _delete_local
# ---------------------------------------------------------------------------


def test_save_local_creates_file(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_UPLOAD_DIR", str(tmp_path))
    result = storage._save_local(b"hello-file", "test.txt")
    assert result == "test.txt"
    assert (tmp_path / "test.txt").read_bytes() == b"hello-file"


def test_save_local_creates_upload_dir(tmp_path, monkeypatch):
    new_dir = tmp_path / "uploads"
    monkeypatch.setattr(storage, "_UPLOAD_DIR", str(new_dir))
    storage._save_local(b"data", "foo.png")
    assert new_dir.exists()


def test_delete_local_removes_file(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_UPLOAD_DIR", str(tmp_path))
    (tmp_path / "todelete.png").write_bytes(b"data")
    storage._delete_local("todelete.png")
    assert not (tmp_path / "todelete.png").exists()


def test_delete_local_accepts_path_prefix(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_UPLOAD_DIR", str(tmp_path))
    (tmp_path / "img.png").write_bytes(b"x")
    storage._delete_local("/uploads/img.png")
    assert not (tmp_path / "img.png").exists()


def test_delete_local_missing_file_no_error(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_UPLOAD_DIR", str(tmp_path))
    storage._delete_local("nonexistent.png")  # should not raise


# ---------------------------------------------------------------------------
# upload_file — routes to local when Supabase unconfigured
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_upload_file_local(tmp_path, monkeypatch):
    _reload_storage(monkeypatch)
    monkeypatch.setattr(storage, "_UPLOAD_DIR", str(tmp_path))
    result = await storage.upload_file(b"img-bytes", "floor1.png", "image/png")
    assert result == "floor1.png"
    assert (tmp_path / "floor1.png").exists()


@pytest.mark.anyio
async def test_delete_file_local(tmp_path, monkeypatch):
    _reload_storage(monkeypatch)
    monkeypatch.setattr(storage, "_UPLOAD_DIR", str(tmp_path))
    (tmp_path / "rem.png").write_bytes(b"x")
    await storage.delete_file("rem.png")
    assert not (tmp_path / "rem.png").exists()


@pytest.mark.anyio
async def test_delete_file_empty_string_noop(monkeypatch):
    _reload_storage(monkeypatch)
    await storage.delete_file("")  # should not raise


# ---------------------------------------------------------------------------
# Supabase backend — mocked httpx
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_upload_supabase_success(monkeypatch):
    _reload_storage(monkeypatch, "https://abc.supabase.co", "secret")

    async def mock_put(self, url, **kwargs):
        req = httpx.Request("PUT", url)
        return httpx.Response(200, json={"Key": "floor-plans/file.png"}, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "put", mock_put)
    url = await storage._upload_supabase(b"data", "file.png", "image/png")
    assert url.startswith("https://abc.supabase.co")
    assert "file.png" in url


@pytest.mark.anyio
async def test_upload_supabase_raises_on_error(monkeypatch):
    _reload_storage(monkeypatch, "https://abc.supabase.co", "secret")

    async def mock_put(self, url, **kwargs):
        req = httpx.Request("PUT", url)
        return httpx.Response(403, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "put", mock_put)
    with pytest.raises(httpx.HTTPStatusError):
        await storage._upload_supabase(b"data", "file.png", "image/png")


@pytest.mark.anyio
async def test_delete_supabase_calls_correct_endpoint(monkeypatch):
    _reload_storage(monkeypatch, "https://abc.supabase.co", "secret")
    deleted_urls = []

    async def mock_delete(self, url, **kwargs):
        deleted_urls.append(url)
        req = httpx.Request("DELETE", url)
        return httpx.Response(204, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "delete", mock_delete)
    public_url = "https://abc.supabase.co/storage/v1/object/public/floor-plans/img.png"
    await storage._delete_supabase(public_url)
    assert len(deleted_urls) == 1
    assert "img.png" in deleted_urls[0]


@pytest.mark.anyio
async def test_delete_file_dispatches_to_supabase(monkeypatch):
    """delete_file should call Supabase path when URL starts with http."""
    _reload_storage(monkeypatch, "https://abc.supabase.co", "secret")
    calls = []

    async def mock_delete(self, url, **kwargs):
        calls.append(url)
        req = httpx.Request("DELETE", url)
        return httpx.Response(204, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "delete", mock_delete)
    await storage.delete_file("https://abc.supabase.co/storage/v1/object/public/floor-plans/x.png")
    assert len(calls) == 1
