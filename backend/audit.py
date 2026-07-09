"""
audit.py — Append-only audit log helper.

Write-side endpoints call `audit(db, user, action, ...)` after the change
commits successfully. Failures are logged but never raised — auditing
must not break user-facing operations.
"""

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from models import AuditLog, User

logger = logging.getLogger(__name__)


def audit(
    db: Session,
    user: User | None,
    action: str,
    target_type: str | None = None,
    target_id: Any | None = None,
    payload: dict | None = None,
) -> None:
    """Record an audit log entry. Does not raise on failure."""
    try:
        entry = AuditLog(
            user_id=user.id if user else None,
            actor_email=user.email if user else None,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            payload=json.dumps(payload, default=str)[:1000] if payload else "",
        )
        db.add(entry)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit log failed for action=%s: %s", action, exc)
        db.rollback()
