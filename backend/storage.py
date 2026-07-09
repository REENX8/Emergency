"""
storage.py — Abstraction layer for file storage.

Local dev:   saves to backend/uploads/, served via FastAPI StaticFiles
Production:  uploads to Supabase Storage, returns public CDN URL

Set env vars to enable Supabase mode:
  SUPABASE_URL               https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  service_role secret (not anon key)
  SUPABASE_BUCKET            floor-plans  (default)
"""

import os

import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = os.getenv("SUPABASE_BUCKET", "floor-plans")

_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")


def is_supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


async def upload_file(content: bytes, filename: str, content_type: str) -> str:
    """
    Upload a file to the configured storage backend.

    Returns:
        Supabase mode → full public URL (https://...)
        Local mode    → bare filename (served from /uploads/)
    """
    if is_supabase_configured():
        return await _upload_supabase(content, filename, content_type)
    return _save_local(content, filename)


async def delete_file(path_or_url: str) -> None:
    """
    Delete a previously stored file.
    Accepts either a bare filename (local) or a full Supabase URL.
    """
    if not path_or_url:
        return
    if is_supabase_configured() and path_or_url.startswith("http"):
        await _delete_supabase(path_or_url)
    else:
        _delete_local(path_or_url)


# ---------------------------------------------------------------------------
# Supabase Storage backend
# ---------------------------------------------------------------------------


async def _upload_supabase(content: bytes, filename: str, content_type: str) -> str:
    upload_url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{filename}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.put(
            upload_url,
            content=content,
            headers={
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": content_type,
                "x-upsert": "true",  # overwrite if exists
            },
        )
        r.raise_for_status()
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{filename}"


async def _delete_supabase(public_url: str) -> None:
    filename = public_url.rsplit("/", 1)[-1]
    delete_url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{filename}"
    async with httpx.AsyncClient(timeout=10) as client:
        await client.delete(
            delete_url,
            headers={"Authorization": f"Bearer {SUPABASE_KEY}"},
        )


# ---------------------------------------------------------------------------
# Local filesystem backend
# ---------------------------------------------------------------------------


def _save_local(content: bytes, filename: str) -> str:
    os.makedirs(_UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(_UPLOAD_DIR, filename), "wb") as f:
        f.write(content)
    return filename  # caller prepends /uploads/ for serving


def _delete_local(filename: str) -> None:
    # Accept both bare filename and /uploads/filename
    name = filename.rsplit("/", 1)[-1]
    path = os.path.join(_UPLOAD_DIR, name)
    if os.path.exists(path):
        os.remove(path)
